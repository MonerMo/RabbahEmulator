package com.rabbah.device.testing

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.Direction
import com.rabbah.device.core.Frame
import com.rabbah.device.core.ReplyCode
import com.rabbah.device.core.Transport
import com.rabbah.device.core.u8
import com.rabbah.device.core.withDeviceTimeout
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * A Transport with no hardware behind it. Whoever holds it plays the VMC:
 *   vmcSends(block)   a block "arrives" from the VMC; the fake ACKs it at once, like the real transport
 *   vmcPolls()        a POLL arrives; the oldest queued reply goes out and its send() resolves
 *   dropLink(reason)  the cable is pulled; pending sends fail and the state becomes Fault
 * With autoPollMs > 0 it polls by itself, so the app can run on the emulator with no CM30.
 */
class FakeTransport(
    private val scope: CoroutineScope,
    private val autoPollMs: Long = 0,
    var replyPolicy: (ByteArray) -> ReplyCode = { ReplyCode.ACK },
) : Transport {

    /** One queued reply and the waiting send() call that owns it. */
    private class Pending(val block: ByteArray, val reply: CompletableDeferred<ReplyCode>)

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    private val _frames = MutableSharedFlow<Frame>(extraBufferCapacity = 1024)
    private val outbox = ArrayDeque<Pending>()
    private var seq = 0L
    private var poller: Job? = null

    /** Every frame this transport has seen, in order. Tests read this instead of collecting the Flow. */
    val log = mutableListOf<Frame>()

    override val state: StateFlow<ConnectionState> = _state
    override val frames: Flow<Frame> = _frames

    // ---------- the Transport contract: what the app calls ----------

    override suspend fun connect(timeoutMs: Long) {
        withDeviceTimeout("connect", timeoutMs) {
            if (_state.value == ConnectionState.Connected) return@withDeviceTimeout
            _state.value = ConnectionState.Connecting      // the real one calls slave.open() here
            _state.value = ConnectionState.Connected
            if (autoPollMs > 0) {
                poller = scope.launch {
                    while (isActive) {
                        delay(autoPollMs)
                        vmcPolls()
                    }
                }
            }
        }
    }

    override suspend fun disconnect(timeoutMs: Long) {
        withDeviceTimeout("disconnect", timeoutMs) {
            poller?.cancel()
            poller = null
            failAllPending("disconnect")
            _state.value = ConnectionState.Disconnected
        }
    }

    override suspend fun send(block: ByteArray, timeoutMs: Long): ReplyCode {
        if (_state.value != ConnectionState.Connected) {
            throw DeviceError.Disconnected("send while ${_state.value}")
        }
        require(block.size in 1..36) { "MDB block must be 1..36 bytes, got ${block.size}" }
        val pending = Pending(block, CompletableDeferred())
        synchronized(outbox) { outbox.addLast(pending) }
        return try {
            withDeviceTimeout("send", timeoutMs) { pending.reply.await() }
        } catch (e: DeviceError.Timeout) {
            synchronized(outbox) { outbox.remove(pending) }   // nobody will pick it up now
            throw e
        }
    }

    // ---------- the VMC side: what a test or the debug screen calls ----------

    /** A block arrives from the VMC. RESET (10H) wipes the outbox; every block is ACKed at once. */
    fun vmcSends(block: ByteArray) {
        emit(Direction.IN, block)
        if (block.isNotEmpty() && block.u8(0) == 0x10) failAllPending("reset")
        emit(Direction.OUT, ACK_BYTES)
    }

    /** A POLL arrives. If a reply is queued it goes out and its send() resolves; otherwise we ACK. */
    fun vmcPolls() {
        emit(Direction.IN, POLL_BYTES)
        val pending = synchronized(outbox) { outbox.removeFirstOrNull() }
        if (pending == null) {
            emit(Direction.OUT, ACK_BYTES)
            return
        }
        emit(Direction.OUT, pending.block)
        pending.reply.complete(replyPolicy(pending.block))
    }

    /** The cable is pulled. */
    fun dropLink(reason: String = "cable pulled") {
        poller?.cancel()
        poller = null
        failAllPending(reason)
        _state.value = ConnectionState.Fault(DeviceError.Disconnected(reason))
    }

    // ---------- internals ----------

    private fun failAllPending(reason: String) {
        val dropped = synchronized(outbox) {
            val all = outbox.toList()
            outbox.clear()
            all
        }
        for (p in dropped) p.reply.completeExceptionally(DeviceError.Disconnected(reason))
    }

    private fun emit(direction: Direction, bytes: ByteArray) {
        val frame = Frame(++seq, direction, bytes, System.currentTimeMillis())
        log += frame
        _frames.tryEmit(frame)
    }

    private companion object {
        val ACK_BYTES = byteArrayOf(0x00)
        val POLL_BYTES = byteArrayOf(0x12, 0x12)
    }
}

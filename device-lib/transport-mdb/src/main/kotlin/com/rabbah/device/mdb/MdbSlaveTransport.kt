package com.rabbah.device.mdb

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.Direction
import com.rabbah.device.core.Frame
import com.rabbah.device.core.ReplyCode
import com.rabbah.device.core.Transport
import com.rabbah.device.core.hasValidChecksum
import com.rabbah.device.core.u8
import com.rabbah.device.core.withDeviceTimeout
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The real Transport: the CM30's MDB slave port, driven through an [MdbPort].
 *
 * One coroutine - the receive loop - owns the port. For every block the VMC sends, it answers
 * inside the 5 ms t-response window, on its own thread, with no JavaScript involved:
 *   RESET (0x10)   ACK, then fail every queued send() - the bus just restarted
 *   POLL  (0x12)   the oldest queued block goes out; its send() resolves with the VMC's answer
 *   bad CHK        NAK - the VMC will repeat the command
 *   anything else  ACK now; the reply is queued through send() and leaves on the next POLL
 */
class MdbSlaveTransport(
    private val port: MdbPort,
    private val scope: CoroutineScope,
    private val rxDispatcher: CoroutineDispatcher = Dispatchers.IO,   // receive() blocks: never the main thread
) : Transport {

    /** One queued reply and the waiting send() call that owns it. */
    private class Pending(val block: ByteArray, val reply: CompletableDeferred<ReplyCode>)

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    private val _frames = MutableSharedFlow<Frame>(extraBufferCapacity = 1024)
    private val outbox = ArrayDeque<Pending>()
    private var seq = 0L
    private var receiver: Job? = null

    override val state: StateFlow<ConnectionState> = _state
    override val frames: Flow<Frame> = _frames

    // ---------- the Transport contract: what the app calls ----------

    override suspend fun connect(timeoutMs: Long) {
        withDeviceTimeout("connect", timeoutMs) {
            if (_state.value == ConnectionState.Connected) return@withDeviceTimeout
            _state.value = ConnectionState.Connecting
            val rc = try {
                port.open()
            } catch (e: LinkageError) {            // libmdbSlave.so missing: emulator, or wrong ABI
                fault(DeviceError.Disconnected("MDB native library not available: ${e.message}"))
            }
            if (rc < 0) fault(DeviceError.TransportFailure("open", rc))
            receiver = scope.launch(rxDispatcher) { receiveLoop() }
            _state.value = ConnectionState.Connected
        }
    }

    override suspend fun disconnect(timeoutMs: Long) {
        withDeviceTimeout("disconnect", timeoutMs) {
            receiver?.cancel()
            receiver = null
            failAllPending("disconnect")
            port.close()                            // makes a blocked receive() return, so the loop can exit
            _state.value = ConnectionState.Disconnected
        }
    }

    /** Identical to FakeTransport.send(): the mailbox rule does not care what is behind the port. */
    override suspend fun send(block: ByteArray, timeoutMs: Long): ReplyCode {
        if (_state.value != ConnectionState.Connected) {
            throw DeviceError.Disconnected("send while ${_state.value}")
        }
        require(block.size in 1..MAX_BLOCK) { "MDB block must be 1..$MAX_BLOCK bytes, got ${block.size}" }

        val pending = Pending(block, CompletableDeferred())
        synchronized(outbox) { outbox.addLast(pending) }
        return try {
            withDeviceTimeout("send", timeoutMs) { pending.reply.await() }
        } catch (e: DeviceError.Timeout) {
            synchronized(outbox) { outbox.remove(pending) }   // nobody polled in time: take it back
            throw e
        }
    }

    // ---------- the receive loop: runs on rxDispatcher and is the only user of the port ----------

    private suspend fun CoroutineScope.receiveLoop() {
        val buffer = ByteArray(MAX_BLOCK)
        while (isActive) {
            val n = port.receive(buffer)
            if (n > 0) onBlock(buffer.copyOf(n)) else delay(IDLE_MS)   // nothing there: 1 ms nap, like Ciontek's demo
        }
    }

    /** Called for every block the VMC sends. Must answer within 5 ms: no suspension, no JavaScript in here. */
    private fun onBlock(block: ByteArray) {
        emit(Direction.IN, block)
        when {
            !block.hasValidChecksum() -> answer(ReplyCode.NAK)
            block.u8(0) == CMD_RESET -> { answer(ReplyCode.ACK); failAllPending("reset") }
            block.u8(0) == CMD_POLL -> deliverOne()
            else -> answer(ReplyCode.ACK)
        }
    }

    /** POLL: send the oldest queued block, or ACK when the mailbox is empty. */
    private fun deliverOne() {
        val pending = synchronized(outbox) { outbox.removeFirstOrNull() }
        if (pending == null) { answer(ReplyCode.ACK); return }

        val vmcReply = IntArray(1)
        val rc = port.sendResponseData(pending.block, pending.block.size, vmcReply)
        emit(Direction.OUT, pending.block)
        if (rc < 0) pending.reply.completeExceptionally(DeviceError.TransportFailure("sendResponseData", rc))
        else pending.reply.complete(ReplyCode.fromByte(vmcReply[0]))
    }

    // ---------- internals ----------

    private fun answer(code: ReplyCode) {
        port.sendAnswer(code.byte)
        emit(Direction.OUT, byteArrayOf(code.byte.toByte()))
    }

    private fun fault(error: DeviceError): Nothing {
        _state.value = ConnectionState.Fault(error)
        throw error
    }

    private fun failAllPending(reason: String) {
        val dropped = synchronized(outbox) { val all = outbox.toList(); outbox.clear(); all }
        for (p in dropped) p.reply.completeExceptionally(DeviceError.Disconnected(reason))
    }

    private fun emit(direction: Direction, bytes: ByteArray) {
        val frame = Frame(++seq, direction, bytes, System.currentTimeMillis())
        _frames.tryEmit(frame)
    }

    private companion object {
        const val MAX_BLOCK = 36     // MDB section 2: a block is at most 36 bytes, CHK included
        const val IDLE_MS = 1L
        const val CMD_RESET = 0x10   // address 10H (cashless device #1) + command 0
        const val CMD_POLL = 0x12    // address 10H + command 2
    }
}

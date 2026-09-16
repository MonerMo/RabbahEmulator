package com.rabbah.mdbdevice

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.Direction
import com.rabbah.device.core.Frame
import com.rabbah.device.core.Transport
import com.rabbah.device.core.hexToBytes
import com.rabbah.device.mdb.MdbSlavePort
import com.rabbah.device.mdb.MdbSlaveTransport
import com.rabbah.device.testing.FakeTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart.UNDISPATCHED
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** One frame, as JavaScript will see it. Plain Kotlin: there are no React types in this file. */
data class FrameEvent(val seq: Long, val direction: String, val hex: String, val atMillis: Long)

/** The connection state, as JavaScript will see it. errorCode and message exist only for "fault". */
data class StateEvent(val state: String, val errorCode: String? = null, val message: String? = null)

/** Where the bridge delivers events. MdbDeviceModule implements it with emitOnFrame / emitOnState. */
interface BridgeEvents {
    fun onFrame(event: FrameEvent)
    fun onState(event: StateEvent)
}

/** "fake" = FakeTransport polling every 150 ms (the emulator); anything else = the CM30. */
fun defaultTransport(mode: String, scope: CoroutineScope): Transport =
    if (mode == "fake") FakeTransport(scope, autoPollMs = 150)
    else MdbSlaveTransport(MdbSlavePort(), scope)

/**
 * Everything the Turbo Module does, minus React Native: it owns one Transport, turns the
 * transport's flows into events, and turns hex strings and ReplyCodes into what JavaScript
 * expects. No React here means it is unit-tested with FakeTransport, like everything else.
 */
class DeviceBridge(
    private val scope: CoroutineScope,
    private val events: BridgeEvents,
    private val newTransport: (mode: String, scope: CoroutineScope) -> Transport = ::defaultTransport,
) {
    private var transport: Transport? = null
    private var watchers: Job? = null

    /** The Fake VMC controls; null while the real transport is in use. */
    val fake: FakeTransport? get() = transport as? FakeTransport

    suspend fun connect(mode: String, timeoutMs: Long) {
        close()                                            // a reconnect replaces the transport
        val t = newTransport(mode, scope)
        transport = t
        watchers = scope.launch(start = UNDISPATCHED) {          // subscribe NOW, before connect() can emit
            launch(start = UNDISPATCHED) { t.state.collect { events.onState(it.toEvent()) } }
            launch(start = UNDISPATCHED) { t.frames.collect { events.onFrame(it.toEvent()) } }
        }
        t.connect(timeoutMs)
    }

    suspend fun disconnect(timeoutMs: Long) {
        transport?.disconnect(timeoutMs)
    }

    /** Returns "ack", "nak" or "ret". Throws DeviceError or IllegalArgumentException (bad hex). */
    suspend fun send(hex: String, timeoutMs: Long): String {
        val t = transport ?: throw DeviceError.Disconnected("not connected")
        return t.send(hex.hexToBytes(), timeoutMs).name.lowercase()
    }

    fun state(): StateEvent = transport?.state?.value?.toEvent() ?: StateEvent("disconnected")

    /** Stops watching, closes the port, forgets the transport. Errors while closing are not interesting. */
    suspend fun close() {
        watchers?.cancel()
        watchers = null
        transport?.let { runCatching { it.disconnect(500) } }
        transport = null
    }

    companion object {
        /** The rejection code JavaScript switches on. */
        fun errorCode(e: Throwable): String = when (e) {
            is DeviceError -> e.code                       // TIMEOUT, DISCONNECTED, TRANSPORT_FAILURE, INVALID_FRAME
            is IllegalArgumentException -> "INVALID_ARGUMENT"
            else -> "UNKNOWN"
        }

        private fun ConnectionState.toEvent(): StateEvent = when (this) {
            ConnectionState.Disconnected -> StateEvent("disconnected")
            ConnectionState.Connecting -> StateEvent("connecting")
            ConnectionState.Connected -> StateEvent("connected")
            is ConnectionState.Fault -> StateEvent("fault", error.code, error.message)
        }

        private fun Frame.toEvent() =
            FrameEvent(seq, if (direction == Direction.IN) "in" else "out", hex, atMillis)
    }
}

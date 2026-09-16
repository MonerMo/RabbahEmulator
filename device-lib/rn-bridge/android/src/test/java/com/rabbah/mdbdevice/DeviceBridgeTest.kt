package com.rabbah.mdbdevice

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.hexToBytes
import com.rabbah.device.testing.FakeTransport
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotSame
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class DeviceBridgeTest {

    /** Stands in for the JavaScript side: it just records what it was sent. */
    private class Recorder : BridgeEvents {
        val frames = mutableListOf<FrameEvent>()
        val states = mutableListOf<StateEvent>()
        override fun onFrame(event: FrameEvent) { frames += event }
        override fun onState(event: StateEvent) { states += event }
    }

    /** A bridge whose "fake" mode is a FakeTransport WITHOUT auto-poll: the test plays the VMC. */
    private fun TestScope.bridge(): Pair<DeviceBridge, Recorder> {
        val recorder = Recorder()
        val bridge = DeviceBridge(backgroundScope, recorder) { _, scope -> FakeTransport(scope) }
        return bridge to recorder
    }

    private fun TestScope.sendInBackground(b: DeviceBridge, hex: String) =
        async { runCatching { b.send(hex, 2_000) } }

    @Test
    fun `connect reports connected to JavaScript`() = runTest {
        val (b, rec) = bridge()
        b.connect("fake", 3_000)
        runCurrent()
        assertEquals("connected", rec.states.last().state)
        assertEquals("connected", b.state().state)
    }

    @Test
    fun `send resolves with the VMC reply as a lower-case word`() = runTest {
        val (b, _) = bridge()
        b.connect("fake", 3_000)
        val reply = sendInBackground(b, "05 00 64 69")
        runCurrent()
        b.fake!!.vmcPolls()
        runCurrent()
        assertEquals("ack", reply.await().getOrThrow())
    }

    @Test
    fun `frames reach the listener with direction and hex`() = runTest {
        val (b, rec) = bridge()
        b.connect("fake", 3_000)
        b.fake!!.vmcSends("13 00 00 64 00 05 7c".hexToBytes())
        runCurrent()
        assertEquals(listOf("in" to "13 00 00 64 00 05 7c", "out" to "00"), rec.frames.map { it.direction to it.hex })
    }

    @Test
    fun `every failure has a code JavaScript can switch on`() = runTest {
        val (b, _) = bridge()
        val notConnected = assertFailsWith<DeviceError.Disconnected> { b.send("05 00 64 69", 2_000) }
        assertEquals("DISCONNECTED", DeviceBridge.errorCode(notConnected))
        b.connect("fake", 3_000)
        val badHex = assertFailsWith<IllegalArgumentException> { b.send("0G", 2_000) }
        assertEquals("INVALID_ARGUMENT", DeviceBridge.errorCode(badHex))
        val timeout = assertFailsWith<DeviceError.Timeout> { b.send("05 00 64 69", 2_000) }
        assertEquals("TIMEOUT", DeviceBridge.errorCode(timeout))
        assertEquals(2_000L, currentTime)
    }

    @Test
    fun `a dropped link becomes a fault event with code and message`() = runTest {
        val (b, rec) = bridge()
        b.connect("fake", 3_000)
        b.fake!!.dropLink("cable pulled")
        runCurrent()
        val last = rec.states.last()
        assertEquals("fault", last.state)
        assertEquals("DISCONNECTED", last.errorCode)
        assertEquals("disconnected: cable pulled", last.message)
    }

    @Test
    fun `reconnect replaces the transport and disconnects the old one`() = runTest {
        val (b, _) = bridge()
        b.connect("fake", 3_000)
        val first = b.fake!!
        b.connect("fake", 3_000)
        runCurrent()
        assertNotSame(first, b.fake)
        assertEquals(ConnectionState.Disconnected, first.state.value)
    }

    @Test
    fun `close disconnects and forgets the transport`() = runTest {
        val (b, _) = bridge()
        b.connect("fake", 3_000)
        b.close()
        runCurrent()
        assertNull(b.fake)
        assertEquals("disconnected", b.state().state)
    }
}

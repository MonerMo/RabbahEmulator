package com.rabbah.device.mdb

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.Direction
import com.rabbah.device.core.Frame
import com.rabbah.device.core.ReplyCode
import com.rabbah.device.core.hexToBytes
import com.rabbah.device.core.toHex
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class MdbSlaveTransportTest {

    /** A transport whose receive loop runs on the test's virtual clock instead of Dispatchers.IO. */
    private fun TestScope.real(port: ScriptedPort) =
        MdbSlaveTransport(port, backgroundScope, StandardTestDispatcher(testScheduler))

    /** send() must run in the background: it suspends until a POLL, and the test plays the VMC. */
    private fun TestScope.sendInBackground(t: MdbSlaveTransport, hex: String) =
        async { runCatching { t.send(hex.hexToBytes()) } }

    /** Everything the transport emits, in order - collected the same way Module 4 will read `frames`. */
    private fun TestScope.record(t: MdbSlaveTransport): List<Frame> {
        val seen = mutableListOf<Frame>()
        backgroundScope.launch { t.frames.collect { seen += it } }
        return seen
    }

    /** One turn of the receive loop: it naps 1 ms between empty reads. */
    private fun TestScope.tick() = advanceTimeBy(2)

    @Test
    fun `connect opens the port`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        t.connect()
        assertTrue(port.isOpen)
        assertEquals(ConnectionState.Connected, t.state.value)
    }

    @Test
    fun `open failure becomes Fault, not a crash`() = runTest {
        val t = real(ScriptedPort(openResult = -1))
        val e = assertFailsWith<DeviceError.TransportFailure> { t.connect() }
        assertEquals("open", e.operation)
        assertIs<ConnectionState.Fault>(t.state.value)
    }

    @Test
    fun `missing native library becomes Fault, not a crash`() = runTest {   // the emulator case
        val t = real(ScriptedPort(openThrows = UnsatisfiedLinkError("libmdbSlave.so not found")))
        assertFailsWith<DeviceError.Disconnected> { t.connect() }
        assertIs<ConnectionState.Fault>(t.state.value)
    }

    @Test
    fun `POLL with an empty mailbox is ACKed`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        val seen = record(t)
        t.connect()
        port.vmcSends("12 12"); tick()
        assertEquals(listOf(0x00), port.answers)
        assertEquals(listOf("12 12", "00"), seen.map { it.hex })
        assertEquals(listOf(Direction.IN, Direction.OUT), seen.map { it.direction })
    }

    @Test
    fun `a queued block leaves on the next POLL and send resolves with the VMC reply`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        val seen = record(t)
        t.connect()
        val reply = sendInBackground(t, "05 00 64 69")
        runCurrent()                                   // send() is now waiting in the outbox
        port.vmcSends("12 12"); tick()
        assertEquals(ReplyCode.ACK, reply.await().getOrThrow())
        assertEquals("05 00 64 69", port.responses.single().toHex())
        assertEquals(listOf("12 12", "05 00 64 69"), seen.map { it.hex })
    }

    @Test
    fun `the VMC's NAK reaches the caller`() = runTest {
        val port = ScriptedPort(vmcReply = 0xFF)
        val t = real(port)
        t.connect()
        val reply = sendInBackground(t, "05 00 64 69")
        runCurrent()
        port.vmcSends("12 12"); tick()
        assertEquals(ReplyCode.NAK, reply.await().getOrThrow())
    }

    @Test
    fun `a block with a bad checksum is NAKed`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        t.connect()
        port.vmcSends("12 13"); tick()                 // POLL with a wrong CHK byte
        assertEquals(listOf(0xFF), port.answers)
        assertTrue(port.responses.isEmpty())
    }

    @Test
    fun `any other command is ACKed at once - the mailbox rule`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        t.connect()
        port.vmcSends("11 00 03 00 00 00 14"); tick()  // SETUP config data, level 3
        assertEquals(listOf(0x00), port.answers)
        assertTrue(port.responses.isEmpty())           // the answer comes later, through send() + POLL
    }

    @Test
    fun `RESET is ACKed and fails every pending send`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        t.connect()
        val reply = sendInBackground(t, "05 00 64 69")
        runCurrent()
        port.vmcSends("10 10"); tick()
        assertEquals(listOf(0x00), port.answers)
        assertIs<DeviceError.Disconnected>(reply.await().exceptionOrNull())
    }

    @Test
    fun `send times out when the VMC never polls`() = runTest {
        val t = real(ScriptedPort())
        t.connect()
        assertFailsWith<DeviceError.Timeout> { t.send("05 00 64 69".hexToBytes()) }
        assertEquals(2_000L, currentTime)              // virtual clock: 2 s passed, the test took milliseconds
    }

    @Test
    fun `disconnect closes the port and fails pending sends`() = runTest {
        val port = ScriptedPort()
        val t = real(port)
        t.connect()
        val reply = sendInBackground(t, "05 00 64 69")
        runCurrent()
        t.disconnect()
        assertFalse(port.isOpen)
        assertEquals(ConnectionState.Disconnected, t.state.value)
        assertIs<DeviceError.Disconnected>(reply.await().exceptionOrNull())
        assertFailsWith<DeviceError.Disconnected> { t.send("05 00 64 69".hexToBytes()) }
    }
}

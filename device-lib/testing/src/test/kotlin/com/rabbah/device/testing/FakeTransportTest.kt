package com.rabbah.device.testing

import com.rabbah.device.core.ConnectionState
import com.rabbah.device.core.DeviceError
import com.rabbah.device.core.Direction
import com.rabbah.device.core.ReplyCode
import com.rabbah.device.core.hexToBytes
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)   // runCurrent / advanceTimeBy / currentTime are marked experimental
class FakeTransportTest {

    /** A fake whose auto-poller (if any) lives in the test's background scope, so it is cleaned up. */
    private fun TestScope.fake(autoPollMs: Long = 0) = FakeTransport(backgroundScope, autoPollMs)

    /** Runs send() in the background and captures its outcome, so a failure does not kill the test scope. */
    private fun TestScope.sendInBackground(t: FakeTransport, hex: String) =
        async { runCatching { t.send(hex.hexToBytes()) } }

    @Test
    fun `connect moves the state to Connected`() = runTest {
        val t = fake()
        assertEquals(ConnectionState.Disconnected, t.state.value)
        t.connect()
        assertEquals(ConnectionState.Connected, t.state.value)
    }

    @Test
    fun `send resolves when the next POLL picks the reply up`() = runTest {
        val t = fake()
        t.connect()
        val outcome = sendInBackground(t, "05 00 64 69")           // VEND APPROVED
        runCurrent()                                                // let send() queue its block
        t.vmcPolls()
        assertEquals(ReplyCode.ACK, outcome.await().getOrThrow())
        assertEquals(listOf("12 12", "05 00 64 69"), t.log.map { it.hex })
    }

    @Test
    fun `the VMC answer comes back through replyPolicy`() = runTest {
        val t = fake()
        t.connect()
        t.replyPolicy = { ReplyCode.NAK }
        val outcome = sendInBackground(t, "05 00 64 69")
        runCurrent()
        t.vmcPolls()
        assertEquals(ReplyCode.NAK, outcome.await().getOrThrow())
    }

    @Test
    fun `send times out when the VMC never polls`() = runTest {
        val t = fake()
        t.connect()
        val e = assertFailsWith<DeviceError.Timeout> {
            t.send("05 00 64 69".hexToBytes(), timeoutMs = 2_000)
        }
        assertEquals("TIMEOUT", e.code)
        assertEquals(2_000L, currentTime)       // virtual clock: "2 seconds" passed in a few ms
    }

    @Test
    fun `a VMC command is ACKed at once and both frames are logged`() = runTest {
        val t = fake()
        t.connect()
        t.vmcSends("13 00 00 64 00 05 7c".hexToBytes())              // VEND REQUEST
        assertEquals(listOf(Direction.IN, Direction.OUT), t.log.map { it.direction })
        assertEquals("00", t.log[1].hex)                              // the ACK
    }

    @Test
    fun `RESET from the VMC fails a pending send`() = runTest {
        val t = fake()
        t.connect()
        val outcome = sendInBackground(t, "03 03 e8 ee")             // BEGIN SESSION, waiting for a POLL
        runCurrent()
        t.vmcSends("10 10".hexToBytes())                              // RESET arrives instead
        val e = outcome.await().exceptionOrNull()
        assertTrue(e is DeviceError.Disconnected)
        assertEquals("DISCONNECTED", e.code)
    }

    @Test
    fun `dropping the link fails pending sends and reports Fault`() = runTest {
        val t = fake()
        t.connect()
        val outcome = sendInBackground(t, "05 00 64 69")
        runCurrent()
        t.dropLink("cable pulled")
        assertTrue(outcome.await().exceptionOrNull() is DeviceError.Disconnected)
        assertTrue(t.state.value is ConnectionState.Fault)
        assertFailsWith<DeviceError.Disconnected> { t.send("07 07".hexToBytes()) }   // new sends are refused
    }

    @Test
    fun `auto-poll delivers a queued reply with no manual polls`() = runTest {
        val t = fake(autoPollMs = 150)
        t.connect()
        val outcome = sendInBackground(t, "07 07")                   // END SESSION
        advanceTimeBy(151)                                            // one poll tick, in virtual time
        assertEquals(ReplyCode.ACK, outcome.await().getOrThrow())
    }
}

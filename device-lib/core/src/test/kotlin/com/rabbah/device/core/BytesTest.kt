package com.rabbah.device.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BytesTest {

    @Test
    fun `hex round trip`() {
        val bytes = "13 00 64 FF".hexToBytes()
        assertContentEquals(byteArrayOf(0x13, 0x00, 0x64, 0xFF.toByte()), bytes)
        assertEquals("13 00 64 ff", bytes.toHex())
    }

    @Test
    fun `unsigned reads`() {
        val bytes = "FF 01 F4".hexToBytes()
        assertEquals(255, bytes.u8(0))        // without `and 0xFF` this would be -1
        assertEquals(0x01F4, bytes.u16(1))    // 500, most significant byte first
    }

    @Test
    fun `checksum of a VEND REQUEST`() {
        val body = "13 00 00 64 00 05".hexToBytes()
        assertEquals(0x7C, body.checksum())
        assertTrue("13 00 00 64 00 05 7C".hexToBytes().hasValidChecksum())
        assertFalse("13 00 00 64 00 05 7D".hexToBytes().hasValidChecksum())
    }
}

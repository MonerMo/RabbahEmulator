package com.rabbah.device.mdb

/**
 * The five native calls Module 3 needs, as a Kotlin interface.
 * MdbSlavePort forwards them to the CM30 AAR; ScriptedPort (in the tests) answers from a script.
 * Return values are the raw native codes. The transport relies on one rule only: negative = failure.
 */
interface MdbPort {

    /** Power the slave port on. 0 = ok. */
    fun open(): Int

    /** Power it off. 0 = ok. */
    fun close(): Int

    /** Copies one incoming block (address byte .. CHK byte) into [buffer]. Returns its length, or <= 0 when there is none. */
    fun receive(buffer: ByteArray): Int

    /** Sends a one-byte answer: ACK 0x00, NAK 0xFF or RET 0xAA. */
    fun sendAnswer(code: Int): Int

    /** Sends [size] bytes of [block] (CHK included) and stores the VMC's one-byte answer in reply[0]. */
    fun sendResponseData(block: ByteArray, size: Int, reply: IntArray): Int
}

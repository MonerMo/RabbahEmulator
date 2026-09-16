package com.rabbah.device.mdb

import com.rabbah.device.core.hexToBytes

/**
 * An MdbPort with a script instead of a cable. The test plays the VMC:
 *   vmcSends(hex)  queues a block for the receive loop to read next
 *   answers        every one-byte answer the transport sent (ACK 0x00 / NAK 0xFF), in order
 *   responses      every data block the transport sent on a POLL, in order
 */
class ScriptedPort(
    private val openResult: Int = 0,
    private val openThrows: Throwable? = null,
    var vmcReply: Int = 0x00,
) : MdbPort {

    private val incoming = ArrayDeque<ByteArray>()
    val answers = mutableListOf<Int>()
    val responses = mutableListOf<ByteArray>()
    var isOpen = false
        private set

    fun vmcSends(hex: String) { incoming.addLast(hex.hexToBytes()) }

    override fun open(): Int {
        openThrows?.let { throw it }
        isOpen = openResult == 0
        return openResult
    }

    override fun close(): Int { isOpen = false; return 0 }

    override fun receive(buffer: ByteArray): Int {
        val block = incoming.removeFirstOrNull() ?: return 0
        block.copyInto(buffer)
        return block.size
    }

    override fun sendAnswer(code: Int): Int { answers += code; return 0 }

    override fun sendResponseData(block: ByteArray, size: Int, reply: IntArray): Int {
        responses += block.copyOf(size)
        reply[0] = vmcReply
        return 0
    }
}

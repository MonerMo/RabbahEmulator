package com.rabbah.device.mdb

import android.hardware.mdbSlave.MdbSlave

/**
 * The only class in the whole project that imports the CM30 AAR.
 * Nothing here decides anything: every call is forwarded, every code is returned as-is.
 *
 * MdbSlave is created lazily because loading it also loads libmdbSlave.so, which exists for
 * armeabi-v7a only. On the emulator (x86_64) that throws UnsatisfiedLinkError - and it must
 * throw inside open(), where MdbSlaveTransport turns it into a Fault, not at app start-up.
 */
class MdbSlavePort : MdbPort {

    private val slave: MdbSlave by lazy { MdbSlave.getInstance() }

    override fun open(): Int = slave.open()

    override fun close(): Int = slave.close()

    override fun receive(buffer: ByteArray): Int = slave.receiveCommand(buffer)

    override fun sendAnswer(code: Int): Int = slave.sendAnswer(code)

    override fun sendResponseData(block: ByteArray, size: Int, reply: IntArray): Int =
        slave.sendResponseData(block, size, reply)
}

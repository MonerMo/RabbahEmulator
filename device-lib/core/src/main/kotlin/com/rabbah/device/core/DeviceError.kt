package com.rabbah.device.core

/**
 * Sealed = the compiler knows every subclass. A `when` over a DeviceError that is
 * missing a branch will not compile, so adding an error later cannot be forgotten.
 */
sealed class DeviceError(message: String) : Exception(message) {

    /** A call did not finish inside its timeout. */
    class Timeout(val operation: String, val afterMs: Long) :
        DeviceError("$operation timed out after $afterMs ms")

    /** The port is closed, or it closed while we were waiting. */
    class Disconnected(val reason: String) :
        DeviceError("disconnected: $reason")

    /** A native MdbSlave call returned a failure code. */
    class TransportFailure(val operation: String, val nativeCode: Int) :
        DeviceError("$operation failed (native code $nativeCode)")

    /** A block arrived that we cannot accept: bad checksum, impossible length. */
    class InvalidFrame(val reason: String) :
        DeviceError("invalid frame: $reason")

    /** The stable identifier the JavaScript side switches on. */
    val code: String
        get() = when (this) {
            is Timeout -> "TIMEOUT"
            is Disconnected -> "DISCONNECTED"
            is TransportFailure -> "TRANSPORT_FAILURE"
            is InvalidFrame -> "INVALID_FRAME"
        }
}

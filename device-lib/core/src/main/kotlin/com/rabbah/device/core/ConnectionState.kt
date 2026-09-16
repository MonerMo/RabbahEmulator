package com.rabbah.device.core

/** The four states the task names: Disconnected | Connecting | Connected | Fault. */
sealed interface ConnectionState {
    data object Disconnected : ConnectionState
    data object Connecting : ConnectionState
    data object Connected : ConnectionState
    data class Fault(val error: DeviceError) : ConnectionState
}

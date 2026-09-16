package com.rabbah.device.core

import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

/**
 * Runs [block] with a deadline and converts Kotlin's timeout exception into ours,
 * so nothing outside this module has to know about coroutine internals.
 */
suspend fun <T> withDeviceTimeout(
    operation: String,
    timeoutMs: Long,
    block: suspend () -> T,
): T = try {
    withTimeout(timeoutMs) { block() }
} catch (e: TimeoutCancellationException) {
    throw DeviceError.Timeout(operation, timeoutMs)
}

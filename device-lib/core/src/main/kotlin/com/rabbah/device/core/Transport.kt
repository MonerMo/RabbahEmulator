package com.rabbah.device.core

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * The only thing the rest of the app knows about the hardware.
 * No callbacks and no listeners in this API: suspend functions for one-shot calls,
 * a Flow for the incoming stream, one StateFlow for connection state.
 */
interface Transport {

    /** Current link state. A StateFlow always holds a value, so the UI can read it immediately. */
    val state: StateFlow<ConnectionState>

    /** Every block that crosses the bus, both directions - this feeds the raw frame log. */
    val frames: Flow<Frame>

    /** Opens the port. Safe to call when already connected. */
    suspend fun connect(timeoutMs: Long = 3_000)

    /** Closes the port and fails anything still waiting. */
    suspend fun disconnect(timeoutMs: Long = 2_000)

    /**
     * Queues one complete MDB block (checksum already appended by the caller) and
     * suspends until the VMC answers it - ACK, NAK or RET.
     */
    suspend fun send(block: ByteArray, timeoutMs: Long = 2_000): ReplyCode
}

package com.rabbah.mdbdevice

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.rabbah.device.core.hexToBytes
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * The Turbo Module: the thinnest possible skin over DeviceBridge.
 * Every method converts React's types (Double, Promise, WritableMap) to the bridge's
 * (Long, suspend, data class) and back. No device logic lives in this file.
 */
class MdbDeviceModule(reactContext: ReactApplicationContext) :
    NativeMdbDeviceSpec(reactContext), BridgeEvents {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val bridge = DeviceBridge(scope, events = this)

    // ---------- Promise methods: a suspend call becomes a Promise ----------

    override fun connect(mode: String, timeoutMs: Double, promise: Promise) =
        promise.settleWith { bridge.connect(mode, timeoutMs.toLong()) }

    override fun disconnect(timeoutMs: Double, promise: Promise) =
        promise.settleWith { bridge.disconnect(timeoutMs.toLong()) }

    override fun send(hex: String, timeoutMs: Double, promise: Promise) =
        promise.settleWith { bridge.send(hex, timeoutMs.toLong()) }

    // ---------- the sync method and the Fake VMC buttons ----------

    override fun getState(): String = bridge.state().state

    override fun vmcSends(hex: String) { bridge.fake?.vmcSends(hex.hexToBytes()) }

    override fun vmcPolls() { bridge.fake?.vmcPolls() }

    override fun dropLink(reason: String) { bridge.fake?.dropLink(reason) }

    // ---------- events: a Kotlin data class becomes a JavaScript object ----------

    override fun onFrame(event: FrameEvent) = emitOnFrame(Arguments.createMap().apply {
        putDouble("seq", event.seq.toDouble())           // JavaScript numbers are doubles
        putString("direction", event.direction)
        putString("hex", event.hex)
        putDouble("atMillis", event.atMillis.toDouble())
    })

    override fun onState(event: StateEvent) = emitOnState(Arguments.createMap().apply {
        putString("state", event.state)
        event.errorCode?.let { putString("errorCode", it) }
        event.message?.let { putString("message", it) }
    })

    /** React Native is tearing the module down (reload, exit): close the port, then stop every coroutine. */
    override fun invalidate() {
        super.invalidate()
        scope.launch { bridge.close() }.invokeOnCompletion { scope.cancel() }
    }

    /** Runs a suspend block on the bridge's scope and settles the Promise with its value or its error code. */
    private fun Promise.settleWith(block: suspend () -> Any?) {
        scope.launch {
            try {
                val value = block()
                resolve(if (value == Unit) null else value)   // Promise<void> resolves with null
            } catch (e: Throwable) {
                reject(DeviceBridge.errorCode(e), e.message, e)
            }
        }
    }

    companion object {
        const val NAME = NativeMdbDeviceSpec.NAME
    }
}

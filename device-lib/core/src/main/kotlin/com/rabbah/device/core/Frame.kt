package com.rabbah.device.core

/*
    Author: MonirMo
    Date: --/09/2026
    I can reach to the core of any device even your mind
*/

enum class Direction { IN  , OUT}
data class Frame(val seq: Long , val direction: Direction , val bytes: ByteArray , val atMillis: Long){
    val hex: String get() = bytes.toHex()
}
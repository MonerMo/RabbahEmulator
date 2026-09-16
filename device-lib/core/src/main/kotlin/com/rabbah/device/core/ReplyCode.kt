package com.rabbah.device.core

/*
    Author: MonirMo
    Date: --/09/2026
    I can reach to the core of any device even your mind
*/

enum class ReplyCode(val byte : Int){
    ACK(0x00),
    NAK(0xFF),
    RET(0xAA);

    companion object{
        fun fromByte(value: Int) : ReplyCode = entries.firstOrNull {it.byte == (value and 0xFF)} ?: NAK
    }
}
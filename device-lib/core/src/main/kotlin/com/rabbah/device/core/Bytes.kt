/*
    Author: MonirMo
    Date: --/09/2026
    I can reach to the core of any device even your mind
*/

package com.rabbah.device.core

fun String.hexToBytes(): ByteArray{
    val clean = replace(" ", "").replace("\n", "")
    //require -> will fire an exception when the condition is not true 
    require(clean.length % 2 ==0){"error: Hex needs to be even number of digits: $this"}; 
    //byte in kotlin -128..127.
    return ByteArray(clean.length / 2){
        i -> clean.substring(i*2 , i*2+2).toInt(16).toByte()
    }
}

fun ByteArray.toHex(): String = joinToString(" ") { b -> "%02x".format(b.toInt() and 0xFF) }

fun ByteArray.u8(index: Int) : Int = this[index].toInt() and 0xFF ;

fun ByteArray.u16(index: Int) : Int = (u8(index) shl 8) or u8(index+1)

fun ByteArray.checksum(): Int{
    var sum = 0 
    for(b in this) sum = (sum + (b.toInt() and 0xFF)) and 0xFF; 
    return sum 
}

fun ByteArray.hasValidChecksum() : Boolean= size >= 2 && copyOf(size - 1).checksum() == u8(size-1); 

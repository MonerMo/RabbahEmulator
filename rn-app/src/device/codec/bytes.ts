/* eslint-disable no-bitwise */   // this file's whole job is bits; the React Native lint rule is for accidents
/**
 * Module 5 - bytes.ts: the TypeScript twin of Module 1's Bytes.kt.
 * Same hex format ("13 00 64", lower case, space separated) and the same checksum rule,
 * so a block written here reads correctly in Kotlin and the other way round.
 */

/** "13 00 64" -> [0x13, 0x00, 0x64]. Ignores spaces and new lines, accepts upper or lower case. */
export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw new Error(`hex needs an even number of digits: '${hex}'`);
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error(`not hex: '${hex}'`);
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16));
  return out;
}

/** [0x13, 0x00, 0x64] -> "13 00 64". The exact format of every frame in the log. */
export function bytesToHex(bytes: readonly number[]): string {
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

/** MDB checksum: add the bytes up, keep the low 8 bits. */
export function checksum(bytes: readonly number[]): number {
  let sum = 0;
  for (const b of bytes) sum = (sum + (b & 0xff)) & 0xff;
  return sum;
}

/** The block with its CHK appended - what goes on the wire. */
export function withChecksum(bytes: readonly number[]): number[] {
  return [...bytes, checksum(bytes)];
}

/** True when the last byte equals the checksum of everything before it. */
export function hasValidChecksum(bytes: readonly number[]): boolean {
  return bytes.length >= 2 && checksum(bytes.slice(0, -1)) === (bytes[bytes.length - 1] & 0xff);
}

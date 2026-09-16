import { bytesToHex, checksum, hasValidChecksum, hexToBytes, withChecksum } from '../bytes';

describe('bytes - the twin of Module 1', () => {
  test('hex <-> bytes round trip, in the log format', () => {
    expect(hexToBytes('13 00 64')).toEqual([0x13, 0x00, 0x64]);
    expect(bytesToHex([0x13, 0x00, 0x64])).toBe('13 00 64');
    expect(hexToBytes('FF0A')).toEqual([255, 10]);          // upper case, no spaces: still fine
    expect(bytesToHex(hexToBytes('05 00 64 69'))).toBe('05 00 64 69');
  });

  test('bad hex is refused', () => {
    expect(() => hexToBytes('123')).toThrow('even number');
    expect(() => hexToBytes('0G')).toThrow('not hex');
  });

  test('checksum is the sum modulo 256', () => {
    expect(checksum([0x13, 0x00, 0x00, 0x64, 0x00, 0x05])).toBe(0x7c);   // VEND REQUEST, the guide's example
    expect(withChecksum([0x05, 0x00, 0x64])).toEqual([0x05, 0x00, 0x64, 0x69]);
    expect(checksum([0xff, 0x02])).toBe(0x01);                            // wraps around
  });

  test('a block is valid only when its last byte is the checksum', () => {
    expect(hasValidChecksum(hexToBytes('13 00 00 64 00 05 7c'))).toBe(true);
    expect(hasValidChecksum(hexToBytes('13 00 00 64 00 05 7d'))).toBe(false);
    expect(hasValidChecksum([0x12])).toBe(false);                          // one byte cannot carry a CHK
  });
});

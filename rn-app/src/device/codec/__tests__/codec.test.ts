import { CodecError, decodeReader, decodeVmc, describeFrame, encodeReader, encodeVmc } from '../codec';
import { READER_RESPONSES, VMC_COMMANDS, type FieldKind, type ReaderMessage, type ReaderRow, type VmcMessage, type VmcRow } from '../table';

/** The guide's Level 1 / 2 flows, byte for byte (Section 3.8), and what each block must decode to. */
const FLOWS: Array<['in' | 'out', string, VmcMessage | ReaderMessage]> = [
  ['in',  '10 10',                { name: 'RESET' }],
  ['in',  '12 12',                { name: 'POLL' }],
  ['out', '00 00',                { name: 'JUST_RESET' }],
  ['out', '03 03 e8 ee',          { name: 'BEGIN_SESSION', funds: 1000 }],
  ['in',  '13 00 00 64 00 05 7c', { name: 'VEND_REQUEST', price: 100, item: 5 }],
  ['out', '05 00 64 69',          { name: 'VEND_APPROVED', amount: 100 }],
  ['in',  '13 02 00 05 1a',       { name: 'VEND_SUCCESS', item: 5 }],
  ['in',  '13 04 17',             { name: 'SESSION_COMPLETE' }],
  ['out', '07 07',                { name: 'END_SESSION' }],
  ['out', '06 06',                { name: 'VEND_DENIED' }],
  ['in',  '13 00 00 c8 00 07 e2', { name: 'VEND_REQUEST', price: 200, item: 7 }],
  ['out', '05 00 c8 cd',          { name: 'VEND_APPROVED', amount: 200 }],
  ['in',  '13 02 00 07 1c',       { name: 'VEND_SUCCESS', item: 7 }],
  ['in',  '13 05 00 64 00 05 81', { name: 'CASH_SALE', price: 100, item: 5 }],
  ['in',  '14 01 15',             { name: 'READER_ENABLE' }],
];

describe('codec - decode', () => {
  test('a VEND REQUEST becomes a typed object', () => {
    const m = decodeVmc('13 00 00 64 00 05 7c');
    expect(m).toEqual({ name: 'VEND_REQUEST', price: 100, item: 5 });
    if (m.name === 'VEND_REQUEST') expect(m.price + m.item).toBe(105);   // the union narrows on `name`
  });

  test.each(FLOWS)('%s %s decodes to %j', (direction, hex, expected) => {
    expect(direction === 'in' ? decodeVmc(hex) : decodeReader(hex)).toEqual(expected);
  });

  test('a bad checksum is refused before anything is read', () => {
    expect(() => decodeVmc('12 13')).toThrow(CodecError);
    expect(() => decodeVmc('12 13')).toThrow('bad checksum: expected 12');
  });

  test('unknown commands and sub-commands are refused', () => {
    expect(() => decodeVmc('16 16')).toThrow('unknown message: VMC command 0x16');
    expect(() => decodeVmc('13 09 1c')).toThrow('unknown message: VMC command 0x13 sub-command 0x09');
    expect(() => decodeReader('0c 0c')).toThrow('unknown message: reader response 0x0c');
  });

  test('a block of the wrong length is refused even with a good checksum', () => {
    expect(() => decodeVmc('13 00 00 64 77')).toThrow('wrong length: VEND_REQUEST is 7 bytes with CHK, got 5');
    expect(() => decodeReader('05 05')).toThrow('wrong length: VEND_APPROVED is 4 bytes with CHK, got 2');
  });

  test('two layouts with one id: the length picks the row', () => {
    expect(decodeReader('03 03 e8 ee')).toEqual({ name: 'BEGIN_SESSION', funds: 1000 });
    expect(decodeReader(encodeReader({ name: 'BEGIN_SESSION_L2', funds: 1000, mediaId: 0xffffffff, paymentType: 0, paymentData: 0 })))
      .toEqual({ name: 'BEGIN_SESSION_L2', funds: 1000, mediaId: 0xffffffff, paymentType: 0, paymentData: 0 });
  });
});

describe('codec - encode', () => {
  test('VEND APPROVED gets its checksum and the log format', () => {
    expect(encodeReader({ name: 'VEND_APPROVED', amount: 100 })).toBe('05 00 64 69');
    expect(encodeReader({ name: 'END_SESSION' })).toBe('07 07');
    expect(encodeVmc({ name: 'RESET' })).toBe('10 10');
    expect(encodeVmc({ name: 'VEND_REQUEST', price: 100, item: 5 })).toBe('13 00 00 64 00 05 7c');
  });

  test('the time/date file is BCD, digit for digit', () => {
    const hex = encodeVmc({ name: 'EXP_WRITE_TIME', yy: 26, mm: 9, dd: 18, hh: 14, mi: 30, ss: 0, dow: 5, week: 38, dst: 0, holiday: 0 });
    expect(hex).toBe('17 03 26 09 18 14 30 00 05 38 00 00 e2');                 // 18 Sep 2026, 14:30, a Friday
    expect(decodeVmc(hex)).toMatchObject({ name: 'EXP_WRITE_TIME', yy: 26, mm: 9, dd: 18, week: 38 });
  });

  test('identity strings are padded to their width and trimmed back', () => {
    const hex = encodeVmc({ name: 'EXP_REQUEST_ID', manufacturer: 'RAB', serial: 'CM30-0001', model: 'CM30', version: 102 });
    expect(hex.split(' ').length).toBe(2 + 3 + 12 + 12 + 2 + 1);
    expect(hex).toContain('01 02');                                                // version 1.02 in BCD
    expect(decodeVmc(hex)).toEqual({ name: 'EXP_REQUEST_ID', manufacturer: 'RAB', serial: 'CM30-0001', model: 'CM30', version: 102 });
  });

  test('values that do not fit are refused, with the field named', () => {
    expect(() => encodeReader({ name: 'VEND_APPROVED', amount: 70000 })).toThrow('bad value: expected an integer 0..65535, got 70000 [VEND_APPROVED.amount]');
    expect(() => encodeReader({ name: 'VEND_APPROVED', amount: 1.5 })).toThrow(CodecError);
    expect(() => encodeVmc({ name: 'EXP_WRITE_TIME', yy: 100, mm: 1, dd: 1, hh: 0, mi: 0, ss: 0, dow: 1, week: 1, dst: 0, holiday: 0 })).toThrow('0..99');
    expect(() => encodeVmc({ name: 'EXP_REQUEST_ID', manufacturer: 'RABBAH', serial: '', model: '', version: 0 })).toThrow('up to 3 ASCII');
  });
});

describe('codec - every row of both tables survives a round trip', () => {
  const SAMPLE: Record<FieldKind, number | string> = {
    u8: 0x5a, u16: 0x1234, u32: 0x89abcdef, ascii3: 'RAB', ascii12: 'CM30-0001', bcd1: 42, bcd2: 102,
  };
  const sampleOf = (row: { name: string; fields: readonly (readonly [string, FieldKind])[] }) =>
    Object.fromEntries([['name', row.name], ...row.fields.map(([n, k]) => [n, SAMPLE[k]])]);

  test.each(VMC_COMMANDS.map((r): [string, VmcRow] => [r.name, r]))('VMC %s', (_name, row) => {
    const msg = sampleOf(row) as VmcMessage;
    expect(decodeVmc(encodeVmc(msg))).toEqual(msg);
  });

  test.each(READER_RESPONSES.map((r): [string, ReaderRow] => [r.name, r]))('reader %s', (_name, row) => {
    const msg = sampleOf(row) as ReaderMessage;
    expect(decodeReader(encodeReader(msg))).toEqual(msg);
  });
});

describe('describeFrame - one line of meaning for the log', () => {
  test.each([
    ['in', '12 12', 'POLL'],
    ['out', '00', 'ACK'],
    ['out', 'ff', 'NAK'],
    ['out', 'aa', 'RET'],
    ['in', '13 00 00 64 00 05 7c', 'VEND_REQUEST price=100 item=5'],
    ['out', '05 00 64 69', 'VEND_APPROVED amount=100'],
    ['out', '00 00', 'JUST_RESET'],
    ['in', '12 13', '?? bad checksum'],
    ['in', '16 16', '?? unknown message'],
    ['out', '05 05', '?? wrong length'],
  ])('%s %s -> %s', (direction, hex, label) => {
    expect(describeFrame(direction, hex)).toBe(label);
  });
});

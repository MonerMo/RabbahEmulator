/**
 * Module 5 - table.ts: the ONLY file in the app that knows MDB byte layouts.
 * Source: MDB/ICP 4.3, Section 7 - cashless device #1 (address 10H).
 * u16 / u32 are most-significant byte first. Every block on the wire ends with CHK (not listed here).
 */

/** How one field is written on the wire. */
export type FieldKind =
  | 'u8'      // 1 byte,  0..255
  | 'u16'     // 2 bytes, 0..65535
  | 'u32'     // 4 bytes, 0..4294967295
  | 'ascii3'  // 3 ASCII characters, padded with spaces
  | 'ascii12' // 12 ASCII characters, padded with spaces
  | 'bcd1'    // 1 byte holding two decimal digits: 0x26 = 26
  | 'bcd2';   // 2 bytes holding four decimal digits: 0x01 0x02 = 102 (version "1.02")

export const WIDTH: Record<FieldKind, number> = {
  u8: 1, u16: 2, u32: 4, ascii3: 3, ascii12: 12, bcd1: 1, bcd2: 2,
};

/** [field name, how it is written] */
export type Field = readonly [name: string, kind: FieldKind];

export type VmcRow = { readonly name: string; readonly cmd: number; readonly sub?: number; readonly fields: readonly Field[] };
export type ReaderRow = { readonly name: string; readonly id: number; readonly fields: readonly Field[] };

/** Commands the VMC sends us (IN frames). On the wire: [cmd] [sub, if the row has one] [fields...] [CHK]. */
export const VMC_COMMANDS = [
  { name: 'RESET',                 cmd: 0x10,            fields: [] },
  { name: 'SETUP_CONFIG',          cmd: 0x11, sub: 0x00, fields: [['vmcLevel', 'u8'], ['cols', 'u8'], ['rows', 'u8'], ['display', 'u8']] },
  { name: 'SETUP_PRICES',          cmd: 0x11, sub: 0x01, fields: [['maxPrice', 'u16'], ['minPrice', 'u16']] },
  { name: 'POLL',                  cmd: 0x12,            fields: [] },
  { name: 'VEND_REQUEST',          cmd: 0x13, sub: 0x00, fields: [['price', 'u16'], ['item', 'u16']] },
  { name: 'VEND_CANCEL',           cmd: 0x13, sub: 0x01, fields: [] },
  { name: 'VEND_SUCCESS',          cmd: 0x13, sub: 0x02, fields: [['item', 'u16']] },
  { name: 'VEND_FAILURE',          cmd: 0x13, sub: 0x03, fields: [] },
  { name: 'SESSION_COMPLETE',      cmd: 0x13, sub: 0x04, fields: [] },
  { name: 'CASH_SALE',             cmd: 0x13, sub: 0x05, fields: [['price', 'u16'], ['item', 'u16']] },
  { name: 'NEG_VEND_REQUEST',      cmd: 0x13, sub: 0x06, fields: [['value', 'u16'], ['item', 'u16']] },
  { name: 'READER_DISABLE',        cmd: 0x14, sub: 0x00, fields: [] },
  { name: 'READER_ENABLE',         cmd: 0x14, sub: 0x01, fields: [] },
  { name: 'READER_CANCEL',         cmd: 0x14, sub: 0x02, fields: [] },
  { name: 'REVALUE_REQUEST',       cmd: 0x15, sub: 0x00, fields: [['amount', 'u16']] },
  { name: 'REVALUE_LIMIT_REQUEST', cmd: 0x15, sub: 0x01, fields: [] },
  { name: 'EXP_REQUEST_ID',        cmd: 0x17, sub: 0x00, fields: [['manufacturer', 'ascii3'], ['serial', 'ascii12'], ['model', 'ascii12'], ['version', 'bcd2']] },
  { name: 'EXP_WRITE_TIME',        cmd: 0x17, sub: 0x03, fields: [['yy', 'bcd1'], ['mm', 'bcd1'], ['dd', 'bcd1'], ['hh', 'bcd1'], ['mi', 'bcd1'], ['ss', 'bcd1'], ['dow', 'bcd1'], ['week', 'bcd1'], ['dst', 'u8'], ['holiday', 'u8']] },
  { name: 'EXP_ENABLE_OPTIONS',    cmd: 0x17, sub: 0x04, fields: [['options', 'u32']] },
] as const satisfies readonly VmcRow[];

/** Responses we send the VMC (OUT frames), on a POLL. On the wire: [id] [fields...] [CHK]. */
export const READER_RESPONSES = [
  { name: 'JUST_RESET',             id: 0x00, fields: [] },
  { name: 'READER_CONFIG',          id: 0x01, fields: [['level', 'u8'], ['currency', 'u16'], ['scale', 'u8'], ['decimals', 'u8'], ['maxResponseSec', 'u8'], ['misc', 'u8']] },
  { name: 'BEGIN_SESSION',          id: 0x03, fields: [['funds', 'u16']] },                                                                    // Level 1 layout
  { name: 'BEGIN_SESSION_L2',       id: 0x03, fields: [['funds', 'u16'], ['mediaId', 'u32'], ['paymentType', 'u8'], ['paymentData', 'u16']] }, // Level 2/3 layout
  { name: 'SESSION_CANCEL_REQUEST', id: 0x04, fields: [] },
  { name: 'VEND_APPROVED',          id: 0x05, fields: [['amount', 'u16']] },
  { name: 'VEND_DENIED',            id: 0x06, fields: [] },
  { name: 'END_SESSION',            id: 0x07, fields: [] },
  { name: 'CANCELLED',              id: 0x08, fields: [] },
  { name: 'PERIPHERAL_ID',          id: 0x09, fields: [['manufacturer', 'ascii3'], ['serial', 'ascii12'], ['model', 'ascii12'], ['version', 'bcd2']] },                     // Level 1/2
  { name: 'PERIPHERAL_ID_L3',       id: 0x09, fields: [['manufacturer', 'ascii3'], ['serial', 'ascii12'], ['model', 'ascii12'], ['version', 'bcd2'], ['options', 'u32']] }, // Level 3
  { name: 'MALFUNCTION',            id: 0x0a, fields: [['code', 'u8']] },
  { name: 'CMD_OUT_OF_SEQUENCE',    id: 0x0b, fields: [] },
  { name: 'REVALUE_APPROVED',       id: 0x0d, fields: [] },
  { name: 'REVALUE_DENIED',         id: 0x0e, fields: [] },
  { name: 'REVALUE_LIMIT',          id: 0x0f, fields: [['limit', 'u16']] },
  { name: 'TIME_DATE_REQUEST',      id: 0x11, fields: [] },
] as const satisfies readonly ReaderRow[];

// ---------- the message types, derived from the tables (nothing below is typed by hand) ----------

/** 'u16' -> number, 'ascii12' -> string, ... */
type FieldValue<K extends FieldKind> = K extends 'ascii3' | 'ascii12' ? string : number;

/** [['price','u16'], ['item','u16']] -> { price: number; item: number } */
type FieldsOf<Fs extends readonly Field[]> = {
  [N in Fs[number][0]]: FieldValue<Extract<Fs[number], readonly [N, FieldKind]>[1]>;
};

/** One row -> { name: 'VEND_REQUEST'; price: number; item: number }; all rows -> the union of those. */
type MessageOf<R extends { readonly name: string; readonly fields: readonly Field[] }> = {
  [N in R['name']]: { name: N } & FieldsOf<Extract<R, { readonly name: N }>['fields']>;
}[R['name']];

export type VmcMessage = MessageOf<(typeof VMC_COMMANDS)[number]>;
export type ReaderMessage = MessageOf<(typeof READER_RESPONSES)[number]>;
export type VmcName = VmcMessage['name'];
export type ReaderName = ReaderMessage['name'];

/* eslint-disable no-bitwise */
/**
 * Module 5 - codec.ts: turns hex blocks into typed messages and back, driven by the tables in table.ts.
 * Pure functions: no device, no React, no state. Every failure is a CodecError with a `reason`.
 */
import { bytesToHex, checksum, hasValidChecksum, hexToBytes, withChecksum } from './bytes';
import {
  READER_RESPONSES, VMC_COMMANDS, WIDTH,
  type Field, type FieldKind, type ReaderMessage, type ReaderRow, type VmcMessage, type VmcRow,
} from './table';

export type CodecReason = 'bad checksum' | 'unknown message' | 'wrong length' | 'bad value';

export class CodecError extends Error {
  constructor(readonly reason: CodecReason, readonly where: string, detail: string) {
    super(`${reason}: ${detail} [${where}]`);
    this.name = 'CodecError';
  }
}

// The same tables, seen as plain rows: the literal types stay in table.ts, the loops below need only the shape.
const vmcRows: readonly VmcRow[] = VMC_COMMANDS;
const readerRows: readonly ReaderRow[] = READER_RESPONSES;

const h2 = (n: number) => n.toString(16).padStart(2, '0');
const width = (fields: readonly Field[]) => fields.reduce((n, [, kind]) => n + WIDTH[kind], 0);

// ---------- reading fields ----------

const bcd = (byte: number) => (byte >> 4) * 10 + (byte & 0x0f);

function readField(kind: FieldKind, b: readonly number[], at: number): number | string {
  switch (kind) {
    case 'u8': return b[at];
    case 'u16': return (b[at] << 8) | b[at + 1];
    case 'u32': return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0; // >>> 0 keeps it unsigned
    case 'ascii3':
    case 'ascii12': return String.fromCharCode(...b.slice(at, at + WIDTH[kind])).trimEnd();
    case 'bcd1': return bcd(b[at]);
    case 'bcd2': return bcd(b[at]) * 100 + bcd(b[at + 1]);
  }
}

function readFields(fields: readonly Field[], b: readonly number[], at: number): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [name, kind] of fields) {
    out[name] = readField(kind, b, at);
    at += WIDTH[kind];
  }
  return out;
}

/** hex -> bytes, or a CodecError; the checksum must be right before anything is interpreted. */
function checked(hex: string): number[] {
  let b: number[];
  try {
    b = hexToBytes(hex);
  } catch (e) {
    throw new CodecError('bad value', hex, (e as Error).message);
  }
  if (b.length < 2) throw new CodecError('wrong length', hex, 'a block is at least one byte plus CHK');
  if (!hasValidChecksum(b)) throw new CodecError('bad checksum', hex, `expected ${h2(checksum(b.slice(0, -1)))}`);
  return b;
}

function expectLength(b: readonly number[], expected: number, hex: string, name: string): void {
  if (b.length !== expected) throw new CodecError('wrong length', hex, `${name} is ${expected} bytes with CHK, got ${b.length}`);
}

// ---------- decode ----------

/** A block from the VMC (an IN frame) -> a typed message. */
export function decodeVmc(hex: string): VmcMessage {
  const b = checked(hex);
  const cmd = b[0];
  const candidates = vmcRows.filter((r) => r.cmd === cmd);
  if (candidates.length === 0) throw new CodecError('unknown message', hex, `VMC command 0x${h2(cmd)}`);
  const hasSub = candidates[0].sub !== undefined;
  const row = hasSub ? candidates.find((r) => r.sub === b[1]) : candidates[0];
  if (!row) throw new CodecError('unknown message', hex, `VMC command 0x${h2(cmd)} sub-command 0x${h2(b[1])}`);
  const head = hasSub ? 2 : 1;
  expectLength(b, head + width(row.fields) + 1, hex, row.name);
  return { name: row.name, ...readFields(row.fields, b, head) } as VmcMessage;
}

/** A block we sent (an OUT frame) -> a typed message. Where two layouts share an id, the length decides. */
export function decodeReader(hex: string): ReaderMessage {
  const b = checked(hex);
  const id = b[0];
  const candidates = readerRows.filter((r) => r.id === id);
  if (candidates.length === 0) throw new CodecError('unknown message', hex, `reader response 0x${h2(id)}`);
  const row = candidates.find((r) => 1 + width(r.fields) + 1 === b.length);
  if (!row) expectLength(b, 1 + width(candidates[0].fields) + 1, hex, candidates[0].name);   // always throws here
  return { name: row?.name, ...readFields(row?.fields ?? [], b, 1) } as ReaderMessage;
}

// ---------- encode ----------

function num(value: unknown, max: number, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new CodecError('bad value', where, `expected an integer 0..${max}, got ${String(value)}`);
  }
  return value;
}

const toBcd = (n: number) => (Math.floor(n / 10) << 4) | n % 10;

function writeField(kind: FieldKind, value: unknown, where: string): number[] {
  switch (kind) {
    case 'u8': return [num(value, 0xff, where)];
    case 'u16': { const v = num(value, 0xffff, where); return [v >> 8, v & 0xff]; }
    case 'u32': { const v = num(value, 0xffffffff, where); return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]; }
    case 'ascii3':
    case 'ascii12': {
      const s = String(value);
      if (s.length > WIDTH[kind] || !/^[\x20-\x7e]*$/.test(s)) throw new CodecError('bad value', where, `expected up to ${WIDTH[kind]} ASCII characters, got '${s}'`);
      return [...s.padEnd(WIDTH[kind], ' ')].map((c) => c.charCodeAt(0));
    }
    case 'bcd1': return [toBcd(num(value, 99, where))];
    case 'bcd2': { const v = num(value, 9999, where); return [toBcd(Math.floor(v / 100)), toBcd(v % 100)]; }
  }
}

function encode(head: number[], fields: readonly Field[], msg: Record<string, unknown>, where: string): string {
  const body = [...head];
  for (const [name, kind] of fields) {
    if (!(name in msg)) throw new CodecError('bad value', where, `missing field '${name}'`);
    body.push(...writeField(kind, msg[name], `${where}.${name}`));
  }
  return bytesToHex(withChecksum(body));
}

/** A typed reader message -> the hex block to give device.send(), CHK included. */
export function encodeReader(msg: ReaderMessage): string {
  const row = readerRows.find((r) => r.name === msg.name);
  if (!row) throw new CodecError('unknown message', msg.name, 'not in READER_RESPONSES');
  return encode([row.id], row.fields, msg, msg.name);
}

/** A typed VMC command -> the hex block the fake VMC "sends" (tests, the Fake VMC buttons), CHK included. */
export function encodeVmc(msg: VmcMessage): string {
  const row = vmcRows.find((r) => r.name === msg.name);
  if (!row) throw new CodecError('unknown message', msg.name, 'not in VMC_COMMANDS');
  return encode(row.sub === undefined ? [row.cmd] : [row.cmd, row.sub], row.fields, msg, msg.name);
}

// ---------- for the frame log ----------

const SINGLE_BYTE: Record<number, string> = { 0x00: 'ACK', 0xff: 'NAK', 0xaa: 'RET' };

/** One line of meaning for a frame: "VEND_REQUEST price=100 item=5", "POLL", "ACK", or "?? bad checksum". Never throws. */
export function describeFrame(direction: string, hex: string): string {
  const digits = hex.replace(/\s+/g, '');
  if (digits.length === 2) return SINGLE_BYTE[parseInt(digits, 16)] ?? `?? single byte ${digits}`;
  try {
    const msg: Record<string, unknown> = direction === 'in' ? decodeVmc(hex) : decodeReader(hex);
    const { name, ...fields } = msg;
    return [name, ...Object.entries(fields).map(([k, v]) => `${k}=${v}`)].join(' ');
  } catch (e) {
    return `?? ${e instanceof CodecError ? e.reason : String(e)}`;
  }
}

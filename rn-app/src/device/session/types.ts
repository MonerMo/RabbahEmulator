/* eslint-disable no-bitwise */   // flags and masks are bits on purpose
/**
 * Module 6 - types.ts: what the session needs from the device, and what it shows to the screen.
 */
import type { FrameEvent, Mode, Reply, StateEvent } from '@rabbah/mdb-device';
import type { VmcMessage } from '../codec';

export type Subscription = { remove(): void };

/** The slice of Module 4's `device` the session uses. The real bridge and the Jest FakeDevice both fit it. */
export interface DeviceLike {
  connect(mode: Mode, timeoutMs?: number): Promise<void>;
  disconnect(timeoutMs?: number): Promise<void>;
  send(hex: string, timeoutMs?: number): Promise<Reply>;
  state(): string;
  onFrame(listener: (e: FrameEvent) => void): Subscription;
  onState(listener: (e: StateEvent) => void): Subscription;
}

/** MDB/ICP 4.3 Section 7.2 - the reader's states, as the VMC drives them. */
export type SessionState = 'inactive' | 'disabled' | 'enabled' | 'sessionIdle' | 'vend' | 'negativeVend';

export type VendRequest = Extract<VmcMessage, { name: 'VEND_REQUEST' | 'NEG_VEND_REQUEST' }>;

/** Decides a vend: true = approve. `funds` is what is left in the session, in scaled units. */
export type Policy = (request: VendRequest, funds: number) => boolean;

export type ReaderIdentity = { manufacturer: string; serial: string; model: string; version: number };

export type SessionConfig = {
  identity: ReaderIdentity;
  readerLevel: 1 | 2 | 3;
  currency: number;          // ISO 4217 numeric code as the spec writes it: 1682H = SAR (Saudi riyal)
  scale: number;             // scale factor: 1 -> a unit is 1 minor currency unit
  decimals: number;          // 2 -> 100 units = 1.00
  maxResponseSec: number;    // how long the VMC may wait for our data reply (application level)
  multivend: boolean;        // READER CONFIG misc bit 1: more than one vend per session
  refundable: boolean;       // READER CONFIG misc bit 0
  supportedOptions: number;  // Level 3 option bits we accept in EXP ENABLE OPTIONS
  sendTimeoutMs: number;     // device.send() timeout - "nobody polled"
  sessionTimeoutMs: number;  // after BEGIN SESSION: a VEND REQUEST or SESSION COMPLETE must come within this
  timeDateTimeoutMs: number; // after TIME/DATE REQUEST: the VMC's write must come within this
  policy: Policy;
};

/** READER CONFIG DATA misc byte (7.4.1), and the Level 3 option bits (7.4.24). Named, so nobody writes a magic number. */
export const MISC = { refundable: 1 << 0, multivend: 1 << 1 } as const;
export const OPTION = { fileTransfer: 1 << 0, monetary32: 1 << 1, multiCurrency: 1 << 2, negativeVend: 1 << 3, dataEntry: 1 << 4, alwaysIdle: 1 << 5 } as const;

export const DEFAULT_CONFIG: SessionConfig = {
  identity: { manufacturer: 'RAB', serial: 'CM30-0001', model: 'CM30', version: 100 },   // version 1.00
  readerLevel: 3,
  currency: 0x1682,
  scale: 1,
  decimals: 2,
  maxResponseSec: 5,
  multivend: true,
  refundable: true,
  supportedOptions: OPTION.negativeVend,
  sendTimeoutMs: 2000,
  sessionTimeoutMs: 60_000,
  timeDateTimeoutMs: 10_000,
  policy: (request, funds) => ('price' in request ? request.price : request.value) <= funds,
};

/** Everything the debug screen shows about the session. Immutable: every change is a new object. */
export type SessionView = {
  state: SessionState;
  vmcLevel: number | null;      // from SETUP CONFIG
  level: number;                // negotiated: the lower of the VMC's and ours
  funds: number;                // remaining in the session, scaled units
  approved: number | null;      // amount approved, until VEND SUCCESS / FAILURE says what happened
  denyNext: boolean;
  sales: number;                // vends the VMC reported as successful
  cashSales: number;            // CASH SALE reports
  options: number;              // Level 3 bits the VMC enabled
  clock: string | null;         // from EXP WRITE TIME: 'yy-mm-dd hh:mi:ss'
  expecting: 'vendOrComplete' | 'timeDate' | null;
  note: string;                 // one line for the screen: the last thing that happened
};

export const INITIAL_VIEW: SessionView = {
  state: 'inactive', vmcLevel: null, level: 1, funds: 0, approved: null, denyNext: false,
  sales: 0, cashSales: 0, options: 0, clock: null, expecting: null, note: 'waiting for the VMC',
};

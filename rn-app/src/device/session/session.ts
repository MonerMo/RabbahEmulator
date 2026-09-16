/* eslint-disable no-bitwise */
/**
 * Module 6 - session.ts: the cashless state machine (MDB/ICP 4.3 Section 7), Levels 1, 2 and 3.
 *   device.onFrame -> decodeVmc -> onVmc() decides -> encodeReader -> device.send   (the reply leaves on the next POLL)
 * Nothing here knows a byte: the codec does the bytes, the bridge does the wire, this file does the rules.
 */
import { errorCode } from '@rabbah/mdb-device';
import type { Reply } from '@rabbah/mdb-device';
import { CodecError, decodeVmc, encodeReader, type ReaderMessage, type VmcMessage } from '../codec';
import {
  DEFAULT_CONFIG, INITIAL_VIEW, MISC,
  type DeviceLike, type SessionConfig, type SessionView, type Subscription, type VendRequest,
} from './types';

export class CashlessSession {
  readonly config: SessionConfig;
  private view: SessionView = INITIAL_VIEW;
  private readonly listeners = new Set<(v: SessionView) => void>();
  private readonly subs: Subscription[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly device: DeviceLike, config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.subs.push(device.onFrame((f) => { if (f.direction === 'in') this.onFrame(f.hex); }));
    this.subs.push(device.onState((s) => { if (s.state === 'fault' || s.state === 'disconnected') this.reset(`link ${s.state}`); }));
  }

  // ---------- what the screen uses ----------

  snapshot(): SessionView { return this.view; }

  subscribe(listener: (v: SessionView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => { this.listeners.delete(listener); };
  }

  /** Stop listening and forget every timer. After this the object is dead. */
  dispose(): void {
    this.clearExpect();
    for (const s of this.subs) s.remove();
    this.listeners.clear();
  }

  // ---------- triggers: what a person (or a test) can start ----------

  /** Offer the VMC a session with `funds` scaled units (1000 = 10.00). Only from the ENABLED state. */
  async beginSession(funds: number): Promise<Reply | undefined> {
    if (this.view.state !== 'enabled') { this.note(`begin session ignored while ${this.view.state}`); return undefined; }
    this.set({ state: 'sessionIdle', funds, approved: null });
    this.expect('vendOrComplete', this.config.sessionTimeoutMs);
    const msg: ReaderMessage = this.view.level >= 2
      ? { name: 'BEGIN_SESSION_L2', funds, mediaId: 0xffffffff, paymentType: 0, paymentData: 0 }   // Level 2/3 layout: media id unknown
      : { name: 'BEGIN_SESSION', funds };
    const r = await this.reply(msg);
    if (r === undefined && this.snapshot().state === 'sessionIdle') {    // it never left (timeout): there is no session
      this.clearExpect();
      this.set({ state: 'enabled', funds: 0 });
    }
    return r;
  }

  /** Ask the VMC to end the session; it answers with SESSION COMPLETE, which ends it. */
  async cancelSession(): Promise<Reply | undefined> {
    if (this.view.state !== 'sessionIdle' && this.view.state !== 'vend') { this.note(`cancel ignored while ${this.view.state}`); return undefined; }
    return this.reply({ name: 'SESSION_CANCEL_REQUEST' });
  }

  /** The next VEND REQUEST is denied whatever the policy says - for the "denied vend" demo. */
  denyNextVend(on = true): void { this.set({ denyNext: on }); }

  /** Level 2+: ask the VMC for its clock; it answers with EXP WRITE TIME. */
  async requestTimeDate(): Promise<Reply | undefined> {
    this.expect('timeDate', this.config.timeDateTimeoutMs);
    return this.reply({ name: 'TIME_DATE_REQUEST' });
  }

  // ---------- the VMC's side: one frame in, one decision ----------

  private onFrame(hex: string): void {
    let m: VmcMessage;
    try {
      m = decodeVmc(hex);
    } catch (e) {
      this.note(`ignored (${e instanceof CodecError ? e.reason : String(e)}): ${hex}`);
      return;
    }
    this.onVmc(m).catch((e) => this.note(`bug: ${String(e)}`));   // onVmc never throws; this is a belt for the braces
  }

  private async onVmc(m: VmcMessage): Promise<void> {
    const v = this.view;
    switch (m.name) {
      case 'POLL':
        return;                                                    // answered in Kotlin; nothing to decide
      case 'RESET':
        this.clearExpect();
        this.set({ ...INITIAL_VIEW, note: 'RESET: back to INACTIVE' });
        await this.reply({ name: 'JUST_RESET' });
        return;
      case 'SETUP_CONFIG': {
        const level = Math.min(m.vmcLevel, this.config.readerLevel);
        this.set({ state: 'disabled', vmcLevel: m.vmcLevel, level, note: `SETUP: VMC level ${m.vmcLevel}, talking level ${level}` });
        await this.reply({
          name: 'READER_CONFIG', level: this.config.readerLevel, currency: this.config.currency,
          scale: this.config.scale, decimals: this.config.decimals, maxResponseSec: this.config.maxResponseSec,
          misc: (this.config.refundable ? MISC.refundable : 0) | (this.config.multivend ? MISC.multivend : 0),
        });
        return;
      }
      case 'SETUP_PRICES':
        this.note(`prices ${m.minPrice}..${m.maxPrice}`);
        return;
      case 'READER_ENABLE':
        this.set({ state: 'enabled', note: 'reader ENABLED' });
        return;
      case 'READER_DISABLE':
        this.clearExpect();
        this.set({ state: 'disabled', funds: 0, approved: null, note: 'reader DISABLED' });
        return;
      case 'READER_CANCEL':
        this.clearExpect();
        this.set({ state: 'enabled', funds: 0, approved: null, note: 'VMC cancelled' });
        await this.reply({ name: 'CANCELLED' });
        return;
      case 'VEND_REQUEST':
      case 'NEG_VEND_REQUEST':
        await this.onVendRequest(m);
        return;
      case 'VEND_CANCEL':
        this.set({ state: 'sessionIdle', approved: null, note: 'VEND CANCEL -> denied' });
        await this.reply({ name: 'VEND_DENIED' });
        return;
      case 'VEND_SUCCESS':
        if (v.state !== 'vend' && v.state !== 'negativeVend') { this.note(`VEND SUCCESS while ${v.state} - ignored`); return; }
        this.set({ state: 'sessionIdle', approved: null, sales: v.sales + 1, note: `item ${m.item} dispensed, ${v.approved ?? 0} charged` });
        this.expect('vendOrComplete', this.config.sessionTimeoutMs);
        return;
      case 'VEND_FAILURE': {
        const refund = v.state === 'vend' ? v.approved ?? 0 : -(v.approved ?? 0);
        this.set({ state: 'sessionIdle', approved: null, funds: v.funds + refund, note: `VEND FAILURE: ${Math.abs(refund)} refunded` });
        this.expect('vendOrComplete', this.config.sessionTimeoutMs);
        return;
      }
      case 'SESSION_COMPLETE':
        this.clearExpect();
        this.set({ state: 'enabled', funds: 0, approved: null, denyNext: false, note: 'session complete' });
        await this.reply({ name: 'END_SESSION' });
        return;
      case 'CASH_SALE':
        this.set({ cashSales: v.cashSales + 1, note: `cash sale: item ${m.item} for ${m.price}` });
        return;
      case 'REVALUE_REQUEST':
        await this.reply({ name: 'REVALUE_DENIED' });                // Level 2 revalue is not offered by this reader
        return;
      case 'REVALUE_LIMIT_REQUEST':
        await this.reply({ name: 'REVALUE_LIMIT', limit: 0 });
        return;
      case 'EXP_REQUEST_ID': {
        const id = this.config.identity;
        this.note(`VMC is ${m.manufacturer} ${m.model} ${m.serial} v${m.version}`);
        await this.reply(this.config.readerLevel >= 3
          ? { name: 'PERIPHERAL_ID_L3', ...id, options: this.config.supportedOptions }
          : { name: 'PERIPHERAL_ID', ...id });
        return;
      }
      case 'EXP_ENABLE_OPTIONS': {
        const unsupported = m.options & ~this.config.supportedOptions;
        if (unsupported !== 0) {
          this.note(`VMC enabled unsupported options ${unsupported.toString(2)}`);
          await this.reply({ name: 'CMD_OUT_OF_SEQUENCE' });
          return;
        }
        this.set({ options: m.options, note: `options enabled: ${m.options.toString(2)}` });
        return;
      }
      case 'EXP_WRITE_TIME':
        if (v.expecting === 'timeDate') this.clearExpect();
        this.set({ clock: `${pad(m.yy)}-${pad(m.mm)}-${pad(m.dd)} ${pad(m.hh)}:${pad(m.mi)}:${pad(m.ss)}`, note: 'clock set by the VMC' });
        return;
    }
  }

  private async onVendRequest(m: VendRequest): Promise<void> {
    const v = this.view;
    if (v.state !== 'sessionIdle') {
      this.note(`${m.name} while ${v.state} -> out of sequence`);
      await this.reply({ name: 'CMD_OUT_OF_SEQUENCE' });
      return;
    }
    const negative = m.name === 'NEG_VEND_REQUEST';
    const amount = m.name === 'NEG_VEND_REQUEST' ? m.value : m.price;
    const approve = !v.denyNext && (negative || this.config.policy(m, v.funds));
    this.clearExpect();
    if (!approve) {
      this.set({ state: 'sessionIdle', denyNext: false, note: `item ${m.item} for ${amount}: DENIED` });
      this.expect('vendOrComplete', this.config.sessionTimeoutMs);
      await this.reply({ name: 'VEND_DENIED' });
      return;
    }
    this.set({
      state: negative ? 'negativeVend' : 'vend',
      approved: amount,
      funds: negative ? v.funds + amount : v.funds - amount,
      note: `item ${m.item} for ${amount}: APPROVED${negative ? ' (negative vend)' : ''}`,
    });
    await this.reply({ name: 'VEND_APPROVED', amount });
  }

  // ---------- internals ----------

  /** Encode, queue, wait for the POLL that carries it. Never throws: failures become a note (and DISCONNECTED resets). */
  private async reply(msg: ReaderMessage): Promise<Reply | undefined> {
    try {
      const r = await this.device.send(encodeReader(msg), this.config.sendTimeoutMs);
      this.note(`${msg.name} -> ${r}`);
      return r;
    } catch (e) {
      const code = errorCode(e);
      if (code === 'DISCONNECTED') this.reset('disconnected');
      else this.note(`${msg.name} failed: ${code}`);
      return undefined;
    }
  }

  private expect(what: 'vendOrComplete' | 'timeDate', ms: number): void {
    this.clearExpect();
    this.set({ expecting: what });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.set({ expecting: null, note: `timeout: no answer to ${what} in ${ms / 1000} s` });
      if (what === 'vendOrComplete') this.cancelSession().catch(() => undefined);
    }, ms);
  }

  private clearExpect(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.view.expecting) this.set({ expecting: null });
  }

  private reset(reason: string): void {
    this.clearExpect();
    this.set({ ...INITIAL_VIEW, note: reason });
  }

  private set(patch: Partial<SessionView>): void {
    this.view = { ...this.view, ...patch };
    for (const l of this.listeners) l(this.view);
  }

  private note(text: string): void { this.set({ note: text }); }
}

const pad = (n: number) => String(n).padStart(2, '0');

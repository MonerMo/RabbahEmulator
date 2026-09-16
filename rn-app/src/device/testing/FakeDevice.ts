/**
 * Module 6 - FakeDevice.ts: Module 2's puppet, rewritten in TypeScript for Jest.
 * Same three strings (sends / polls / dropLink), same mailbox, same error codes - so a session
 * tested here behaves the same on the emulator (Kotlin FakeTransport) and on the CM30.
 */
import type { FrameEvent, Mode, Reply, StateEvent } from '@rabbah/mdb-device';
import { decodeVmc, encodeVmc, hexToBytes } from '../codec';
import type { DeviceLike, Subscription } from '../session/types';

type Pending = { hex: string; resolve: (r: Reply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** What the bridge's Promise carries when it rejects: an Error with a `code`. */
export function deviceError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const ACK_HEX = '00';

export class FakeDevice implements DeviceLike {
  private current = 'disconnected';
  private seq = 0;
  private readonly frameListeners = new Set<(e: FrameEvent) => void>();
  private readonly stateListeners = new Set<(e: StateEvent) => void>();
  private readonly outbox: Pending[] = [];

  /** What the puppet VMC answers when it takes a block: change it to rehearse a NAK. */
  replyPolicy: (hex: string) => Reply = () => 'ack';
  /** Every block that left on a POLL, in order - what a test asserts on. */
  readonly sent: string[] = [];
  /** Every frame, both directions, like Kotlin's FakeTransport.log. */
  readonly frames: FrameEvent[] = [];

  connect = async (_mode: Mode): Promise<void> => {
    this.setState({ state: 'connecting' });
    this.setState({ state: 'connected' });
  };

  disconnect = async (): Promise<void> => {
    this.failAll('disconnect');
    this.setState({ state: 'disconnected' });
  };

  send = (hex: string, timeoutMs = 2000): Promise<Reply> =>
    new Promise<Reply>((resolve, reject) => {
      if (this.current !== 'connected') { reject(deviceError('DISCONNECTED', `disconnected: send while ${this.current}`)); return; }
      try { hexToBytes(hex); } catch (e) { reject(deviceError('INVALID_ARGUMENT', (e as Error).message)); return; }
      const pending: Pending = {
        hex, resolve, reject,
        timer: setTimeout(() => {
          const i = this.outbox.indexOf(pending);
          if (i >= 0) this.outbox.splice(i, 1);                    // nobody will pick it up now
          reject(deviceError('TIMEOUT', `send timed out after ${timeoutMs} ms`));
        }, timeoutMs),
      };
      this.outbox.push(pending);
    });

  state = (): string => this.current;

  onFrame = (listener: (e: FrameEvent) => void): Subscription => {
    this.frameListeners.add(listener);
    return { remove: () => { this.frameListeners.delete(listener); } };
  };

  onState = (listener: (e: StateEvent) => void): Subscription => {
    this.stateListeners.add(listener);
    return { remove: () => { this.stateListeners.delete(listener); } };
  };

  /** The three strings of the puppet - the same names as device.fakeVmc in Module 4. */
  readonly fakeVmc = {
    /** A block arrives from the VMC: ACKed at once; RESET empties the outbox. */
    sends: (hex: string): void => {
      try { if (decodeVmc(hex).name === 'RESET') this.failAll('reset'); } catch { /* a bad block: Kotlin NAKs it, but it is still shown */ }
      this.emit('in', hex);
      this.emit('out', ACK_HEX);
    },
    /** A POLL arrives: the oldest queued block goes out and its send() resolves; otherwise ACK. */
    polls: (): void => {
      this.emit('in', encodeVmc({ name: 'POLL' }));
      const p = this.outbox.shift();
      if (!p) { this.emit('out', ACK_HEX); return; }
      clearTimeout(p.timer);
      this.emit('out', p.hex);
      this.sent.push(p.hex);
      p.resolve(this.replyPolicy(p.hex));
    },
    /** The cable is pulled. */
    dropLink: (reason = 'cable pulled'): void => {
      this.failAll(reason);
      this.setState({ state: 'fault', errorCode: 'DISCONNECTED', message: `disconnected: ${reason}` });
    },
  };

  private emit(direction: 'in' | 'out', hex: string): void {
    const frame: FrameEvent = { seq: ++this.seq, direction, hex, atMillis: Date.now() };
    this.frames.push(frame);
    for (const l of this.frameListeners) l(frame);
  }

  private setState(e: StateEvent): void {
    this.current = e.state;
    for (const l of this.stateListeners) l(e);
  }

  private failAll(reason: string): void {
    for (const p of this.outbox.splice(0)) { clearTimeout(p.timer); p.reject(deviceError('DISCONNECTED', `disconnected: ${reason}`)); }
  }
}

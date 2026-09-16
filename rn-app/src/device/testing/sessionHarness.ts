/**
 * Module 6 - sessionHarness.ts: one line to get a session on a FakeDevice, plus the VMC's side as verbs.
 * Used by the session tests and by Module 7's screen tests.
 */
import { decodeReader, encodeVmc, type ReaderMessage, type VmcMessage } from '../codec';
import { CashlessSession } from '../session/session';
import type { SessionConfig } from '../session/types';
import { FakeDevice } from './FakeDevice';

/** Lets every queued Promise callback run (a decoded frame -> onVmc -> device.send). */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export async function harness(config: Partial<SessionConfig> = {}) {
  const fake = new FakeDevice();
  const session = new CashlessSession(fake, config);
  await fake.connect('fake');
  const vmc = {
    /** The VMC sends a command; then it POLLs once, so the session's reply (if any) leaves. */
    async says(m: VmcMessage): Promise<ReaderMessage | null> {
      const before = fake.sent.length;
      fake.fakeVmc.sends(encodeVmc(m));
      await flush();
      fake.fakeVmc.polls();
      await flush();
      return fake.sent.length > before ? decodeReader(fake.sent[fake.sent.length - 1]) : null;
    },
    /** A POLL on its own: what leaves, if anything. */
    async polls(): Promise<ReaderMessage | null> {
      const before = fake.sent.length;
      fake.fakeVmc.polls();
      await flush();
      return fake.sent.length > before ? decodeReader(fake.sent[fake.sent.length - 1]) : null;
    },
    /** The usual start of a day: RESET, SETUP, (ID), ENABLE. */
    async handshake(vmcLevel = 3): Promise<void> {
      await this.says({ name: 'RESET' });
      await this.says({ name: 'SETUP_CONFIG', vmcLevel, cols: 16, rows: 2, display: 0 });
      await this.says({ name: 'SETUP_PRICES', maxPrice: 500, minPrice: 50 });
      await this.says({ name: 'READER_ENABLE' });
    },
  };
  return { fake, session, vmc, view: () => session.snapshot() };
}

/**
 * Module 7 - useDebugController.ts: everything the debug screen knows, with no JSX in it.
 * One hook owns the link state, the session (Module 6), the frame log (labelled by Module 5) and the buttons' actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { device as realDevice, errorCode, type FrameEvent, type Mode, type StateEvent } from '@rabbah/mdb-device';
import { describeFrame, encodeVmc, type VmcMessage } from '../../device/codec';
import { CashlessSession, INITIAL_VIEW, type DeviceLike, type SessionView } from '../../device/session';

export type FakeVmcStrings = { sends(hex: string): void; polls(): void; dropLink(reason?: string): void };
/** What the screen needs: Module 6's slice of the device, plus the puppet's three strings (no-ops in real mode). */
export type DebugDevice = DeviceLike & { fakeVmc: FakeVmcStrings };
export type LogRow = FrameEvent & { label: string };

const MAX_ROWS = 300;

/** Rows are newest first. Hides every POLL and the ACK that answered it - the heartbeat - so the rest stays visible. */
export function withoutPolls(rows: LogRow[]): LogRow[] {
  return rows.filter((row, i) => row.label !== 'POLL' && !(row.label === 'ACK' && rows[i + 1]?.label === 'POLL'));
}

export function useDebugController(dev: DebugDevice = realDevice) {
  const [mode, setMode] = useState<Mode>('fake');
  const [link, setLink] = useState<StateEvent>({ state: dev.state() });
  const [rows, setRows] = useState<LogRow[]>([]);
  const [hidePoll, setHidePoll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionView>(INITIAL_VIEW);
  const sessionRef = useRef<CashlessSession | null>(null);

  useEffect(() => {
    const s = new CashlessSession(dev);
    sessionRef.current = s;
    const unsubscribe = s.subscribe(setSession);
    const stateSub = dev.onState(setLink);
    const frameSub = dev.onFrame((f) =>
      setRows((prev) => [{ ...f, label: describeFrame(f.direction, f.hex) }, ...prev].slice(0, MAX_ROWS)),
    );
    return () => { unsubscribe(); stateSub.remove(); frameSub.remove(); s.dispose(); sessionRef.current = null; };
  }, [dev]);

  /** Runs a device Promise and turns a rejection into one line: "send: INVALID_ARGUMENT - not hex". */
  const run = useCallback(async (what: string, p: Promise<unknown>) => {
    try { await p; setError(null); }
    catch (e) { setError(`${what}: ${errorCode(e)} - ${(e as Error).message}`); }
  }, []);

  const vmcSays = useCallback((m: VmcMessage) => dev.fakeVmc.sends(encodeVmc(m)), [dev]);

  const actions = useMemo(() => ({
    connect: () => run('connect', dev.connect(mode)),
    disconnect: () => run('disconnect', dev.disconnect()),
    sendHex: (hex: string) => run('send', dev.send(hex)),
    beginSession: (funds = 1000) => sessionRef.current?.beginSession(funds),
    toggleDenyNext: () => { const s = sessionRef.current; if (s) s.denyNextVend(!s.snapshot().denyNext); },
    requestTimeDate: () => sessionRef.current?.requestTimeDate(),
    cancelSession: () => sessionRef.current?.cancelSession(),
    clearLog: () => setRows([]),
  }), [dev, mode, run]);

  /** The Fake VMC panel: every button is a typed message through the codec - no hex on this screen. */
  const vmc = useMemo(() => ({
    reset: () => vmcSays({ name: 'RESET' }),
    setup: () => {
      vmcSays({ name: 'SETUP_CONFIG', vmcLevel: 3, cols: 16, rows: 2, display: 0 });
      vmcSays({ name: 'SETUP_PRICES', maxPrice: 500, minPrice: 50 });
    },
    requestId: () => vmcSays({ name: 'EXP_REQUEST_ID', manufacturer: 'VMC', serial: 'MACHINE-42', model: 'SNACK-8', version: 205 }),
    enable: () => vmcSays({ name: 'READER_ENABLE' }),
    disable: () => vmcSays({ name: 'READER_DISABLE' }),
    vendRequest: (price = 100, item = 5) => vmcSays({ name: 'VEND_REQUEST', price, item }),
    vendSuccess: (item = 5) => vmcSays({ name: 'VEND_SUCCESS', item }),
    vendFailure: () => vmcSays({ name: 'VEND_FAILURE' }),
    sessionComplete: () => vmcSays({ name: 'SESSION_COMPLETE' }),
    cashSale: () => vmcSays({ name: 'CASH_SALE', price: 100, item: 5 }),
    negVendRequest: () => vmcSays({ name: 'NEG_VEND_REQUEST', value: 100, item: 5 }),
    writeTime: () => {
      const d = new Date();
      vmcSays({
        name: 'EXP_WRITE_TIME', yy: d.getFullYear() % 100, mm: d.getMonth() + 1, dd: d.getDate(),
        hh: d.getHours(), mi: d.getMinutes(), ss: d.getSeconds(), dow: ((d.getDay() + 6) % 7) + 1, week: 1, dst: 0, holiday: 0,
      });
    },
    pullCable: () => dev.fakeVmc.dropLink(),
  }), [dev, vmcSays]);

  return {
    mode, setMode, link, session, error, actions, vmc,
    rows: hidePoll ? withoutPolls(rows) : rows,
    hidePoll, setHidePoll,
  };
}

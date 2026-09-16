import { encodeVmc } from '../../codec';
import { flush, harness } from '../../testing/sessionHarness';

describe('when things go wrong', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }); });
  afterEach(() => { jest.useRealTimers(); });

  test('no VEND REQUEST or SESSION COMPLETE for 60 s -> SESSION CANCEL REQUEST', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake();
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    fake.sent.length = 0;
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(view().note).toContain('timeout: no answer to vendOrComplete');
    expect(await vmc.polls()).toEqual({ name: 'SESSION_CANCEL_REQUEST' });
    expect(await vmc.says({ name: 'SESSION_COMPLETE' })).toEqual({ name: 'END_SESSION' });
    expect(view().state).toBe('enabled');
  });

  test('nobody polls: the reply times out, the session notes it and carries on', async () => {
    const { session, vmc, view } = await harness();
    await vmc.handshake();
    const begin = session.beginSession(1000);
    jest.advanceTimersByTime(2000);
    expect(await begin).toBeUndefined();
    expect(view().note).toBe('BEGIN_SESSION_L2 failed: TIMEOUT');
    expect(view().state).toBe('enabled');                                   // no session was ever announced
  });

  test('cable pulled mid-session: back to INACTIVE, pending reply rejected, handshake runs again after reconnect', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake();
    const begin = session.beginSession(1000);
    fake.fakeVmc.dropLink();
    expect(await begin).toBeUndefined();
    expect(view()).toMatchObject({ state: 'inactive', funds: 0 });
    expect(view().note).toMatch(/link fault|disconnected/);                 // the rejection and the state event race; both reset

    await fake.connect('fake');
    expect(view().state).toBe('inactive');                                  // connected is not enabled: the VMC must set us up again
    await vmc.handshake();
    expect(view().state).toBe('enabled');
  });

  test('a bad or unknown block is ignored with a note', async () => {
    const { fake, view } = await harness();
    fake.fakeVmc.sends('12 13'); await flush();
    expect(view().note).toBe('ignored (bad checksum): 12 13');
    fake.fakeVmc.sends('16 16'); await flush();
    expect(view().note).toBe('ignored (unknown message): 16 16');
  });

  test('VEND SUCCESS without an approval is ignored', async () => {
    const { vmc, view } = await harness();
    await vmc.handshake();
    await vmc.says({ name: 'VEND_SUCCESS', item: 5 });
    expect(view()).toMatchObject({ state: 'enabled', sales: 0 });
  });

  test('dispose() stops listening', async () => {
    const { fake, session, view } = await harness();
    session.dispose();
    fake.fakeVmc.sends(encodeVmc({ name: 'RESET' })); await flush();
    expect(view().note).toBe('waiting for the VMC');
  });
});

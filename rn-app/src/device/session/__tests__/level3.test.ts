import { harness } from '../../testing/sessionHarness';

describe('Level 3 - negative vend, time/date', () => {
  test('negative vend: money comes back onto the card', async () => {
    const { session, vmc, view } = await harness();
    await vmc.handshake(3);
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    expect(await vmc.says({ name: 'NEG_VEND_REQUEST', value: 100, item: 5 })).toEqual({ name: 'VEND_APPROVED', amount: 100 });
    expect(view()).toMatchObject({ state: 'negativeVend', funds: 1100, approved: 100 });
    await vmc.says({ name: 'VEND_SUCCESS', item: 5 });
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 1100, sales: 1 });
  });

  test('a failed negative vend takes the credit back', async () => {
    const { session, vmc, view } = await harness();
    await vmc.handshake(3);
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    await vmc.says({ name: 'NEG_VEND_REQUEST', value: 100, item: 5 });
    await vmc.says({ name: 'VEND_FAILURE' });
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 1000 });
  });

  test('time/date: we ask, the VMC writes, the clock is shown', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake(3);
    fake.sent.length = 0;
    const req = session.requestTimeDate();
    await vmc.polls();
    expect(await req).toBe('ack');
    expect(fake.sent).toEqual(['11 11']);
    expect(view().expecting).toBe('timeDate');
    await vmc.says({ name: 'EXP_WRITE_TIME', yy: 26, mm: 9, dd: 18, hh: 14, mi: 30, ss: 0, dow: 5, week: 38, dst: 0, holiday: 0 });
    expect(view()).toMatchObject({ clock: '26-09-18 14:30:00', expecting: null });
  });
});

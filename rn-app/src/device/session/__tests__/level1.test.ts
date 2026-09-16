import { harness } from '../../testing/sessionHarness';

describe('Level 1 - one vend per session', () => {
  test('approved vend: the guide\'s Section 3.8 flow, block for block', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake(1);
    fake.sent.length = 0;

    const begin = session.beginSession(1000);                     // 10.00
    await vmc.polls();
    expect(await begin).toBe('ack');
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 1000, expecting: 'vendOrComplete' });

    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 })).toEqual({ name: 'VEND_APPROVED', amount: 100 });
    expect(view()).toMatchObject({ state: 'vend', approved: 100, funds: 900 });

    expect(await vmc.says({ name: 'VEND_SUCCESS', item: 5 })).toBeNull();
    expect(view()).toMatchObject({ state: 'sessionIdle', approved: null, sales: 1 });

    expect(await vmc.says({ name: 'SESSION_COMPLETE' })).toEqual({ name: 'END_SESSION' });
    expect(view()).toMatchObject({ state: 'enabled', funds: 0, expecting: null });

    expect(fake.sent).toEqual(['03 03 e8 ee', '05 00 64 69', '07 07']);   // exactly the guide's bytes
  });

  test('denied vend: deny-next, then VEND DENIED, then the session still ends normally', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake(1);
    fake.sent.length = 0;
    session.denyNextVend();
    const begin = session.beginSession(1000); await vmc.polls(); await begin;

    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 })).toEqual({ name: 'VEND_DENIED' });
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 1000, denyNext: false });
    expect(await vmc.says({ name: 'SESSION_COMPLETE' })).toEqual({ name: 'END_SESSION' });
    expect(fake.sent).toEqual(['03 03 e8 ee', '06 06', '07 07']);
  });

  test('not enough funds: the default policy denies', async () => {
    const { session, vmc } = await harness();
    await vmc.handshake(1);
    const begin = session.beginSession(50); await vmc.polls(); await begin;
    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 })).toEqual({ name: 'VEND_DENIED' });
  });

  test('VEND CANCEL -> VEND DENIED; VEND FAILURE refunds', async () => {
    const { session, vmc, view } = await harness();
    await vmc.handshake(1);
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 });
    expect(await vmc.says({ name: 'VEND_CANCEL' })).toEqual({ name: 'VEND_DENIED' });
    expect(view().state).toBe('sessionIdle');

    await vmc.says({ name: 'VEND_REQUEST', price: 300, item: 7 });
    expect(view().funds).toBe(600);
    await vmc.says({ name: 'VEND_FAILURE' });
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 900, sales: 0 });
  });

  test('a VEND REQUEST outside a session is out of sequence', async () => {
    const { vmc } = await harness();
    await vmc.handshake(1);
    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 })).toEqual({ name: 'CMD_OUT_OF_SEQUENCE' });
  });

  test('begin session is refused unless ENABLED', async () => {
    const { session, view } = await harness();
    expect(await session.beginSession(1000)).toBeUndefined();
    expect(view().note).toContain('ignored while inactive');
  });
});

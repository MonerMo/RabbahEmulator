import { harness } from '../../testing/sessionHarness';

describe('Level 2 - multi-vend, cash sales, revalue', () => {
  test('BEGIN SESSION uses the long layout from level 2 up', async () => {
    const { fake, session, vmc } = await harness();
    await vmc.handshake(2);
    fake.sent.length = 0;
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    expect(fake.sent).toEqual(['03 03 e8 ff ff ff ff 00 00 00 ea']);         // funds, media id unknown, type 0, data 0, CHK
  });

  test('two approvals in one session, funds running down', async () => {
    const { fake, session, vmc, view } = await harness();
    await vmc.handshake(2);
    const begin = session.beginSession(1000); await vmc.polls(); await begin;
    fake.sent.length = 0;

    await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 });
    await vmc.says({ name: 'VEND_SUCCESS', item: 5 });
    await vmc.says({ name: 'VEND_REQUEST', price: 200, item: 7 });
    await vmc.says({ name: 'VEND_SUCCESS', item: 7 });
    expect(view()).toMatchObject({ state: 'sessionIdle', funds: 700, sales: 2 });
    await vmc.says({ name: 'SESSION_COMPLETE' });
    expect(fake.sent).toEqual(['05 00 64 69', '05 00 c8 cd', '07 07']);      // two 05H between one 03H and one 07H
  });

  test('CASH SALE is counted and gets no data reply', async () => {
    const { vmc, view } = await harness();
    await vmc.handshake(2);
    expect(await vmc.says({ name: 'CASH_SALE', price: 100, item: 5 })).toBeNull();
    expect(view().cashSales).toBe(1);
  });

  test('revalue is politely refused', async () => {
    const { vmc } = await harness();
    await vmc.handshake(2);
    expect(await vmc.says({ name: 'REVALUE_REQUEST', amount: 500 })).toEqual({ name: 'REVALUE_DENIED' });
    expect(await vmc.says({ name: 'REVALUE_LIMIT_REQUEST' })).toEqual({ name: 'REVALUE_LIMIT', limit: 0 });
  });

  test('a custom policy can approve by item, not by funds', async () => {
    const { session, vmc } = await harness({ policy: (r) => r.item === 5 });
    await vmc.handshake(2);
    const begin = session.beginSession(0); await vmc.polls(); await begin;
    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 5 })).toEqual({ name: 'VEND_APPROVED', amount: 100 });
    await vmc.says({ name: 'VEND_SUCCESS', item: 5 });
    expect(await vmc.says({ name: 'VEND_REQUEST', price: 100, item: 6 })).toEqual({ name: 'VEND_DENIED' });
  });
});

import { OPTION } from '../types';
import { harness } from '../../testing/sessionHarness';

describe('handshake - RESET, SETUP, ID, ENABLE', () => {
  test('starts INACTIVE and answers RESET with JUST RESET on the next POLL', async () => {
    const { vmc, view } = await harness();
    expect(view().state).toBe('inactive');
    expect(await vmc.says({ name: 'RESET' })).toEqual({ name: 'JUST_RESET' });
    expect(view().state).toBe('inactive');
  });

  test('SETUP CONFIG -> READER CONFIG DATA with our identity, state DISABLED', async () => {
    const { vmc, view } = await harness();
    const reply = await vmc.says({ name: 'SETUP_CONFIG', vmcLevel: 3, cols: 16, rows: 2, display: 0 });
    expect(reply).toEqual({ name: 'READER_CONFIG', level: 3, currency: 0x1682, scale: 1, decimals: 2, maxResponseSec: 5, misc: 3 });
    expect(view()).toMatchObject({ state: 'disabled', vmcLevel: 3, level: 3 });
  });

  test('a Level 1 VMC negotiates level 1', async () => {
    const { vmc, view } = await harness();
    await vmc.says({ name: 'SETUP_CONFIG', vmcLevel: 1, cols: 16, rows: 2, display: 0 });
    expect(view()).toMatchObject({ vmcLevel: 1, level: 1 });
  });

  test('SETUP PRICES gets no data reply (Kotlin ACKed it)', async () => {
    const { vmc } = await harness();
    expect(await vmc.says({ name: 'SETUP_PRICES', maxPrice: 500, minPrice: 50 })).toBeNull();
  });

  test('EXP REQUEST ID -> PERIPHERAL ID (Level 3 form, with our option bits)', async () => {
    const { vmc } = await harness();
    const reply = await vmc.says({ name: 'EXP_REQUEST_ID', manufacturer: 'VMC', serial: 'MACHINE-42', model: 'SNACK-8', version: 205 });
    expect(reply).toEqual({ name: 'PERIPHERAL_ID_L3', manufacturer: 'RAB', serial: 'CM30-0001', model: 'CM30', version: 100, options: OPTION.negativeVend });
  });

  test('EXP ENABLE OPTIONS: supported bits are remembered, unsupported ones get CMD OUT OF SEQUENCE', async () => {
    const { vmc, view } = await harness();
    expect(await vmc.says({ name: 'EXP_ENABLE_OPTIONS', options: OPTION.negativeVend })).toBeNull();
    expect(view().options).toBe(OPTION.negativeVend);
    const both = OPTION.fileTransfer + OPTION.negativeVend;                 // two distinct bits
    expect(await vmc.says({ name: 'EXP_ENABLE_OPTIONS', options: both })).toEqual({ name: 'CMD_OUT_OF_SEQUENCE' });
  });

  test('READER ENABLE / DISABLE move between ENABLED and DISABLED', async () => {
    const { vmc, view } = await harness();
    await vmc.handshake();
    expect(view().state).toBe('enabled');
    await vmc.says({ name: 'READER_DISABLE' });
    expect(view().state).toBe('disabled');
    await vmc.says({ name: 'READER_ENABLE' });
    expect(view().state).toBe('enabled');
  });

  test('RESET in the middle of anything goes back to INACTIVE', async () => {
    const { vmc, view, session } = await harness();
    await vmc.handshake();
    await session.beginSession(1000);
    await vmc.says({ name: 'RESET' });
    expect(view()).toMatchObject({ state: 'inactive', funds: 0, vmcLevel: null });
  });
});

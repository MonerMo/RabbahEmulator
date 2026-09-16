import React from 'react';
import ReactTestRenderer, { act, type ReactTestRenderer as Renderer } from 'react-test-renderer';
import { device } from '@rabbah/mdb-device';                     // in Jest this is the TypeScript FakeDevice (jest.config.js)
import type { FakeDevice } from '../../../device/testing/FakeDevice';
import { flush } from '../../../device/testing/sessionHarness';
import { DebugScreen } from '../DebugScreen';
import { withoutPolls, type LogRow } from '../useDebugController';

const fake = device as unknown as FakeDevice;
let tree: Renderer;

// findAllByProps matches our own components too (Chip, Btn) - pick the element that carries what we need.
const host = (testID: string) => tree.root.findAllByProps({ testID }).filter((n) => typeof n.type === 'string');
const withProp = (testID: string, prop: string) => tree.root.findAllByProps({ testID }).find((n) => typeof n.props[prop] === 'function')!;
const chip = (testID: string) => String(host(testID)[0].props.children);
const press = async (testID: string) => { await act(async () => { withProp(testID, 'onPress').props.onPress(); await flush(); }); };
const poll = async () => { await act(async () => { fake.fakeVmc.polls(); await flush(); }); };
const rowsOnScreen = () => host('frame-row').map((n) => String(n.props.children));

beforeEach(async () => {
  await act(async () => { tree = ReactTestRenderer.create(<DebugScreen />); });
});
afterEach(async () => {
  await act(async () => { tree.unmount(); await fake.disconnect(); });
  fake.sent.length = 0;
});

describe('DebugScreen', () => {
  test('starts disconnected and inactive', () => {
    expect(chip('chip-link')).toBe('disconnected');
    expect(chip('chip-session')).toBe('inactive');
  });

  test('Connect, then the Fake VMC handshake enables the reader', async () => {
    await press('btn-connect');
    expect(chip('chip-link')).toBe('connected');
    await press('vmc-reset'); await poll();
    await press('vmc-setup'); await poll();
    await press('vmc-enable'); await poll();
    expect(chip('chip-session')).toBe('enabled');
    expect(rowsOnScreen().some((t) => t.includes('READER_CONFIG level=3'))).toBe(true);
  });

  test('a Level 1 sale, button by button', async () => {
    await press('btn-connect');
    await press('vmc-reset'); await poll(); await press('vmc-setup'); await poll(); await press('vmc-enable'); await poll();
    await press('btn-begin'); await poll();
    expect(chip('chip-session')).toBe('sessionIdle');
    await press('vmc-vend'); await poll();
    expect(chip('chip-session')).toBe('vend');
    await press('vmc-success'); await poll();
    await press('vmc-complete'); await poll();
    expect(chip('chip-session')).toBe('enabled');
    expect(fake.sent.filter((h) => h !== '00')).toEqual(expect.arrayContaining(['05 00 64 69', '07 07']));
    expect(rowsOnScreen().some((t) => t.includes('VEND_APPROVED amount=100'))).toBe(true);
  });

  test('hide POLL removes the heartbeat only', async () => {
    await press('btn-connect');
    await poll(); await poll();
    await press('vmc-reset'); await poll();
    expect(rowsOnScreen().some((t) => t.includes('POLL'))).toBe(false);
    expect(rowsOnScreen().some((t) => t.includes('RESET'))).toBe(true);
    await act(async () => { withProp('hide-poll', 'onValueChange').props.onValueChange(false); });
    expect(rowsOnScreen().some((t) => t.includes('POLL'))).toBe(true);
  });

  test('a bad hex in the box shows the error code', async () => {
    await press('btn-connect');
    await act(async () => { withProp('hex-input', 'onChangeText').props.onChangeText('0G'); });
    await press('btn-send');
    expect(chip('error')).toContain('send: INVALID_ARGUMENT');
  });

  test('pulling the cable shows the fault and drops the session', async () => {
    await press('btn-connect');
    await press('vmc-cable');
    expect(chip('chip-link')).toBe('fault DISCONNECTED');
    expect(chip('chip-session')).toBe('inactive');
  });
});

describe('withoutPolls', () => {
  const row = (seq: number, label: string): LogRow => ({ seq, direction: 'in', hex: '', atMillis: 0, label });
  test('drops POLL and the ACK answering it, keeps other ACKs', () => {
    const rows = [row(4, 'ACK'), row(3, 'POLL'), row(2, 'ACK'), row(1, 'RESET')];       // newest first
    expect(withoutPolls(rows).map((r) => r.seq)).toEqual([2, 1]);
  });
});

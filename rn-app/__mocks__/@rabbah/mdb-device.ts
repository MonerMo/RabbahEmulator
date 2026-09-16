/**
 * Jest's stand-in for the Turbo Module (Module 4), wired in jest.config.js.
 * Everything that imports `device` from '@rabbah/mdb-device' gets this FakeDevice in tests.
 */
import { FakeDevice } from '../../src/device/testing/FakeDevice';

export const device = new FakeDevice();

export type DeviceErrorCode = 'TIMEOUT' | 'DISCONNECTED' | 'TRANSPORT_FAILURE' | 'INVALID_FRAME' | 'INVALID_ARGUMENT' | 'UNKNOWN';
const CODES: DeviceErrorCode[] = ['TIMEOUT', 'DISCONNECTED', 'TRANSPORT_FAILURE', 'INVALID_FRAME', 'INVALID_ARGUMENT', 'UNKNOWN'];

/** Same six lines as the real index.tsx. */
export function errorCode(e: unknown): DeviceErrorCode {
  const code = (e as { code?: unknown } | null)?.code;
  return CODES.find((c) => c === code) ?? 'UNKNOWN';
}

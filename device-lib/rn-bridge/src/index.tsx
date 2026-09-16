import type { EventSubscription } from 'react-native';
import MdbDevice, { type FrameEvent, type StateEvent } from './NativeMdbDevice';

export type { FrameEvent, StateEvent };
export type Mode = 'real' | 'fake';
export type Reply = 'ack' | 'nak' | 'ret';
export type DeviceErrorCode =
  | 'TIMEOUT'
  | 'DISCONNECTED'
  | 'TRANSPORT_FAILURE'
  | 'INVALID_FRAME'
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN';

/**
 * The whole device, as the app sees it. Typed, with the task's default timeouts filled in.
 * Modules 5-7 import this object and never touch NativeMdbDevice directly.
 */
export const device = {
  connect: (mode: Mode, timeoutMs = 3000): Promise<void> => MdbDevice.connect(mode, timeoutMs),
  disconnect: (timeoutMs = 2000): Promise<void> => MdbDevice.disconnect(timeoutMs),
  send: (hex: string, timeoutMs = 2000): Promise<Reply> =>
    MdbDevice.send(hex, timeoutMs) as Promise<Reply>,
  state: (): string => MdbDevice.getState(),
  onFrame: (listener: (e: FrameEvent) => void): EventSubscription => MdbDevice.onFrame(listener),
  onState: (listener: (e: StateEvent) => void): EventSubscription => MdbDevice.onState(listener),
  fakeVmc: {
    sends: (hex: string): void => MdbDevice.vmcSends(hex),
    polls: (): void => MdbDevice.vmcPolls(),
    dropLink: (reason = 'cable pulled'): void => MdbDevice.dropLink(reason),
  },
};

const CODES: DeviceErrorCode[] = [
  'TIMEOUT', 'DISCONNECTED', 'TRANSPORT_FAILURE', 'INVALID_FRAME', 'INVALID_ARGUMENT', 'UNKNOWN',
];

/** A rejected device Promise carries `code`; this reads it safely from an `unknown` catch value. */
export function errorCode(e: unknown): DeviceErrorCode {
  const code = (e as { code?: unknown } | null)?.code;
  return CODES.find((c) => c === code) ?? 'UNKNOWN';
}

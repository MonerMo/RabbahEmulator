import { TurboModuleRegistry, type CodegenTypes, type TurboModule } from 'react-native';

/** One block on the bus, as the Kotlin side reports it. `direction` is "in" (VMC -> us) or "out". */
export type FrameEvent = {
  seq: number;
  direction: string;
  hex: string;
  atMillis: number;
};

/** "disconnected" | "connecting" | "connected" | "fault". The last two fields exist only for "fault". */
export type StateEvent = {
  state: string;
  errorCode?: string;
  message?: string;
};

/**
 * The contract between JavaScript and Kotlin. Codegen reads THIS file and generates
 * NativeMdbDeviceSpec.java; MdbDeviceModule.kt must implement exactly these methods.
 * Numbers arrive in Kotlin as Double, Promises as a Promise parameter, events as emitOnX().
 */
export interface Spec extends TurboModule {
  connect(mode: string, timeoutMs: number): Promise<void>;
  disconnect(timeoutMs: number): Promise<void>;
  send(hex: string, timeoutMs: number): Promise<string>;
  getState(): string;

  // Fake VMC controls - do nothing when the real transport is connected
  vmcSends(hex: string): void;
  vmcPolls(): void;
  dropLink(reason: string): void;

  readonly onFrame: CodegenTypes.EventEmitter<FrameEvent>;
  readonly onState: CodegenTypes.EventEmitter<StateEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MdbDevice');

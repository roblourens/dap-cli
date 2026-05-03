import type { DapEventMessage, DapRequestMessage, DapResponseMessage } from '../protocol/dapMessages.js';

export type FakeAdapterScriptStep =
  | { kind: 'expectRequest'; command: string; expectedArguments?: Record<string, unknown>; respond: DapResponseMessage }
  | { kind: 'sendEvent'; event: DapEventMessage }
  | { kind: 'writeStderr'; text: string }
  | { kind: 'closeTransport' };

export interface FakeAdapterScript {
  name: string;
  steps: readonly FakeAdapterScriptStep[];
}

export interface ObservedDapRequest {
  request: DapRequestMessage;
  matchedStep: number;
}

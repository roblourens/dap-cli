export interface DapRequestMessage<TArguments = unknown> {
  seq: number;
  type: 'request';
  command: string;
  arguments?: TArguments;
}

export interface DapResponseMessage<TBody = unknown> {
  seq: number;
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: TBody;
}

export interface DapEventMessage<TBody = unknown> {
  seq: number;
  type: 'event';
  event: string;
  body?: TBody;
}

export type DapProtocolMessage = DapRequestMessage | DapResponseMessage | DapEventMessage;

export function isDapRequestMessage(value: unknown): value is DapRequestMessage {
  return isRecord(value)
    && value.type === 'request'
    && isNonNegativeInteger(value.seq)
    && typeof value.command === 'string';
}

export function isDapResponseMessage(value: unknown): value is DapResponseMessage {
  return isRecord(value)
    && value.type === 'response'
    && isNonNegativeInteger(value.seq)
    && isNonNegativeInteger(value.request_seq)
    && typeof value.success === 'boolean'
    && typeof value.command === 'string';
}

export function isDapEventMessage(value: unknown): value is DapEventMessage {
  return isRecord(value)
    && value.type === 'event'
    && isNonNegativeInteger(value.seq)
    && typeof value.event === 'string';
}

export function isDapProtocolMessage(value: unknown): value is DapProtocolMessage {
  return isDapRequestMessage(value) || isDapResponseMessage(value) || isDapEventMessage(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

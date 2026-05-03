export interface DapTransport {
  readonly name: string;
  readonly readable: NodeJS.ReadableStream;
  readonly writable: NodeJS.WritableStream;
  close(): Promise<void>;
}

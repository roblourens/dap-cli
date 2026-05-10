import net from 'node:net';
import type { DapProtocolMessage, DapRequestMessage } from '../protocol/dapMessages.js';
import { DapMessageParser, encodeDapMessage } from '../protocol/framing.js';

/**
 * Per-connection context handed to a {@link ConnectionScript}. Sockets are
 * abstracted so the script never has to manage framing — emit events /
 * reverse-requests by name + body, send responses via the dispatcher's
 * return value.
 */
export interface MultiChildConnectionContext {
  emitEvent(event: string, body?: unknown): void;
  emitReverseRequest(command: string, args?: unknown): number;
  /** Close the underlying socket. */
  close(): void;
  /** Resolves once the script has finished its synchronous setup. */
  ready(): Promise<void>;
}

/** Per-request return value: success body, or a structured failure. */
export type ScriptResponse =
  | { ok: true; body?: unknown }
  | { ok: false; message: string };

/**
 * Per-connection script. Receives every inbound DAP request and returns the
 * response body. Async so the script can stage events between phases (e.g.
 * the bootloader child emits `terminated` only after the real target has
 * stopped). Use the optional `onAttach` hook to fire-and-forget event
 * sequences after the attach response goes out.
 */
export interface ConnectionScript {
  /**
   * Called once per inbound request. Default behavior for unhandled commands
   * is `{ ok: true }` (empty success response). Returning `undefined` from
   * the dispatcher is treated as `{ ok: true }`.
   */
  dispatch(request: DapRequestMessage, context: MultiChildConnectionContext): ScriptResponse | undefined | Promise<ScriptResponse | undefined>;
}

export interface MultiChildFakeAdapterConfig {
  /**
   * Script for the FIRST connection. The parent fake should typically
   * respond to `initialize`, `attach`, then issue `startDebugging` reverse
   * requests via {@link MultiChildConnectionContext.emitReverseRequest}
   * after `configurationDone`.
   */
  parent: ConnectionScript;
  /**
   * Scripts for child connections, applied in order. The Nth incoming
   * connection (after the parent) runs `children[N-1]`. A connection beyond
   * the configured array length closes immediately.
   */
  children: ConnectionScript[];
}

export interface MultiChildFakeAdapterHandle {
  port: number;
  close(): Promise<void>;
}

/**
 * Phase 18 multi-child fake socket adapter. Hosts a TCP DAP server that:
 *   - Routes the first connection through {@link MultiChildFakeAdapterConfig.parent}
 *     so it can emit `startDebugging` reverse-requests for each desired
 *     child without managing framing.
 *   - Routes each subsequent connection through the next entry in
 *     `children`, so the controller's `openChildTransport` (provided by
 *     `connectSocketAdapter`) can bring up child sessions against this
 *     same TCP endpoint.
 *
 * Used by tests/integration/fakeAdapterCli.test.ts to repro the S-02 shape
 * (bootloader child terminates after the real child stops) end-to-end
 * through the real CLI / controller / ChildSessionCoordinator stack.
 */
export async function startMultiChildFakeSocketAdapter(config: MultiChildFakeAdapterConfig): Promise<MultiChildFakeAdapterHandle> {
  let connectionIndex = 0;
  const sockets = new Set<net.Socket>();

  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));

    const index = connectionIndex;
    connectionIndex += 1;
    const script = index === 0 ? config.parent : config.children[index - 1];
    if (script === undefined) {
      socket.destroy();
      return;
    }
    runConnection(socket, script);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Multi-child fake socket adapter failed to bind a TCP port.');
  }

  return {
    port: address.port,
    close(): Promise<void> {
      return new Promise(resolve => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(() => resolve());
      });
    },
  };
}

function runConnection(socket: net.Socket, script: ConnectionScript): void {
  const parser = new DapMessageParser();
  let serverSeq = 1;
  let resolveReady!: () => void;
  const readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });

  const writeMessage = (message: DapProtocolMessage): void => {
    if (socket.destroyed || socket.writableEnded) {
      return;
    }
    socket.write(encodeDapMessage(message));
  };

  const context: MultiChildConnectionContext = {
    emitEvent(event, body) {
      const seq = serverSeq;
      serverSeq += 1;
      writeMessage(body === undefined
        ? { seq, type: 'event', event }
        : { seq, type: 'event', event, body });
    },
    emitReverseRequest(command, args) {
      const seq = serverSeq;
      serverSeq += 1;
      writeMessage({ seq, type: 'request', command, arguments: args });
      return seq;
    },
    close() {
      socket.end();
    },
    ready() {
      return readyPromise;
    },
  };

  // Resolve `ready()` on the next tick so scripts that schedule async work
  // from `dispatch` can await ordering against subsequent dispatches.
  setImmediate(resolveReady);

  socket.on('data', (chunk: Buffer) => {
    void (async () => {
      for (const message of parser.push(chunk)) {
        if (message.type !== 'request') {
          continue;
        }
        let response: ScriptResponse | undefined;
        try {
          response = await script.dispatch(message, context);
        } catch (error) {
          response = { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        const final: ScriptResponse = response ?? { ok: true };
        const seq = serverSeq;
        serverSeq += 1;
        if (final.ok) {
          writeMessage({
            seq,
            type: 'response',
            request_seq: message.seq,
            success: true,
            command: message.command,
            ...(final.body !== undefined ? { body: final.body } : {}),
          });
        } else {
          writeMessage({
            seq,
            type: 'response',
            request_seq: message.seq,
            success: false,
            command: message.command,
            message: final.message,
          });
        }
      }
    })();
  });
}

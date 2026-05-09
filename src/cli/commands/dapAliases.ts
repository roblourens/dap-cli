import path from 'node:path';
import type { Command } from 'commander';
import type { OutputWriter } from '../outputWriter.js';
import { getDapGeneratedCommand } from '../../generated/dapCommandRegistry.js';
import { parseIntegerOption, parseIntegerValues, parseRequiredIntegerOption, requireGeneratedCommand, sendGeneratedDapRequest } from './dapGenerated.js';
import { createControllerClient } from '../../controller/client.js';

interface NamedOptions {
  name?: string;
}

interface BreakpointsSetOptions extends NamedOptions {
  source: string;
  line?: string[];
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

interface StackOptions extends NamedOptions {
  threadId?: string;
  startFrame?: string;
  levels?: string;
}

interface ScopesOptions extends NamedOptions {
  frameId?: string;
}

interface VariablesOptions extends NamedOptions {
  variablesReference?: string;
}

interface SourceOptions extends NamedOptions {
  sourceReference?: string;
  path?: string;
}

interface EvaluateOptions extends NamedOptions {
  expression?: string;
  frameId?: string;
  context?: string;
}

interface ThreadControlOptions extends NamedOptions {
  threadId?: string;
  singleThread?: boolean;
  targetId?: string;
}

export function registerDapAliasCommands(program: Command, output: OutputWriter): void {
  const breakpoints = program.command('breakpoints').description('Manage source breakpoints');
  breakpoints
    .command('set')
    .requiredOption('--source <path>', 'source path')
    .requiredOption('--line <number...>', 'breakpoint line')
    .option('--name <name>', 'session name or id')
    .option('--condition <expr>', 'breakpoint condition')
    .option('--hit-condition <expr>', 'breakpoint hit condition')
    .option('--log-message <text>', 'breakpoint log message')
    .description('Set breakpoints at source file line numbers')
    .action(async (options: BreakpointsSetOptions) => {
      const lines = parseIntegerValues(options.line, 'line');
      await sendAliasRequest(output, 'setBreakpoints', {
        source: { path: path.resolve(options.source) },
        breakpoints: lines.map(line => compactObject({
          line,
          condition: options.condition,
          hitCondition: options.hitCondition,
          logMessage: options.logMessage,
        })),
        lines,
      }, options.name, 'breakpoints set');
    });

  program.command('threads').option('--name <name>', 'session name or id').description('List active threads in a paused session').addHelpText('after', workflowHelp()).action(async (options: NamedOptions) => {
    await sendAliasRequest(output, 'threads', {}, options.name, 'threads');
  });

  program.command('stack').requiredOption('--thread-id <number>', 'thread id').option('--start-frame <number>', 'start frame').option('--levels <number>', 'frame count').option('--name <name>', 'session name or id').description('Get stack frames for a thread (requires thread-id from threads command)').addHelpText('after', workflowHelp()).action(async (options: StackOptions) => {
    await sendAliasRequest(output, 'stackTrace', compactObject({
      threadId: parseRequiredIntegerOption(options.threadId, 'thread-id'),
      startFrame: parseIntegerOption(options.startFrame, 'start-frame'),
      levels: parseIntegerOption(options.levels, 'levels'),
    }), options.name, 'stack');
  });

  program.command('scopes').requiredOption('--frame-id <number>', 'frame id').option('--name <name>', 'session name or id').description('List scopes for a stack frame (requires frame-id from stack command)').addHelpText('after', workflowHelp()).action(async (options: ScopesOptions) => {
    await sendAliasRequest(output, 'scopes', { frameId: parseRequiredIntegerOption(options.frameId, 'frame-id') }, options.name, 'scopes');
  });

  program.command('variables').requiredOption('--variables-reference <number>', 'variables reference').option('--name <name>', 'session name or id').description('Inspect variables for a scope (requires variables-reference from scopes command)').addHelpText('after', workflowHelp()).action(async (options: VariablesOptions) => {
    await sendAliasRequest(output, 'variables', { variablesReference: parseRequiredIntegerOption(options.variablesReference, 'variables-reference') }, options.name, 'variables');
  });

  program.command('source').requiredOption('--source-reference <number>', 'source reference').option('--path <path>', 'source path').option('--name <name>', 'session name or id').description('Return source content').action(async (options: SourceOptions) => {
    const path = options.path;
    await sendAliasRequest(output, 'source', compactObject({
      sourceReference: parseRequiredIntegerOption(options.sourceReference, 'source-reference'),
      source: path === undefined ? undefined : { path },
    }), options.name, 'source');
  });

  program.command('evaluate').requiredOption('--expression <expr>', 'expression').option('--frame-id <number>', 'frame id (auto-resolved to topmost paused frame when omitted)').option('--context <context>', 'evaluation context').option('--name <name>', 'session name or id').description('Evaluate an expression (auto-uses topmost frame of most-recently-stopped thread when paused)').action(async (options: EvaluateOptions) => {
    let frameId = parseIntegerOption(options.frameId, 'frame-id');
    if (frameId === undefined) {
      frameId = await resolveAutoFrameId(output, options.name);
    }
    await sendAliasRequest(output, 'evaluate', compactObject({
      expression: options.expression,
      frameId,
      context: options.context,
    }), options.name, 'evaluate');
  });

  program.command('continue').requiredOption('--thread-id <number>', 'thread id').option('--single-thread', 'resume only one thread').option('--name <name>', 'session name or id').description('Continue execution').action(async (options: ThreadControlOptions) => {
    await sendThreadControlAlias(output, 'continue', options, 'continue');
  });

  program.command('pause').requiredOption('--thread-id <number>', 'thread id').option('--name <name>', 'session name or id').description('Pause execution').action(async (options: ThreadControlOptions) => {
    await sendThreadControlAlias(output, 'pause', options, 'pause');
  });

  program.command('next').requiredOption('--thread-id <number>', 'thread id').option('--single-thread', 'step only one thread').option('--name <name>', 'session name or id').description('Step over').action(async (options: ThreadControlOptions) => {
    await sendThreadControlAlias(output, 'next', options, 'next');
  });

  program.command('step-in').requiredOption('--thread-id <number>', 'thread id').option('--single-thread', 'step only one thread').option('--target-id <number>', 'step target id').option('--name <name>', 'session name or id').description('Step in').action(async (options: ThreadControlOptions) => {
    await sendThreadControlAlias(output, 'stepIn', options, 'step-in');
  });

  program.command('step-out').requiredOption('--thread-id <number>', 'thread id').option('--single-thread', 'step only one thread').option('--name <name>', 'session name or id').description('Step out').action(async (options: ThreadControlOptions) => {
    await sendThreadControlAlias(output, 'stepOut', options, 'step-out');
  });
}

function workflowHelp(): string {
  return `

Polling workflow:
  $ dap-cli status
  $ dap-cli events --after-cursor 0
  $ dap-cli threads
  $ dap-cli stack --thread-id 1
  $ dap-cli scopes --frame-id 1000
  $ dap-cli variables --variables-reference 2000
`;
}

async function sendThreadControlAlias(output: OutputWriter, dapCommand: 'continue' | 'pause' | 'next' | 'stepIn' | 'stepOut', options: ThreadControlOptions, commandLabel: string): Promise<void> {
  await sendAliasRequest(output, dapCommand, compactObject({
    threadId: parseRequiredIntegerOption(options.threadId, 'thread-id'),
    singleThread: options.singleThread === true ? true : undefined,
    targetId: parseIntegerOption(options.targetId, 'target-id'),
  }), options.name, commandLabel);
}

async function sendAliasRequest(output: OutputWriter, dapCommand: string, args: Record<string, unknown>, name: string | undefined, commandLabel: string): Promise<void> {
  getDapGeneratedCommand(dapCommand);
  await sendGeneratedDapRequest(output, requireGeneratedCommand(dapCommand), args, name, commandLabel);
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

interface SessionStatusForAutoFrame {
  paused?: boolean;
  stoppedThreadIds?: readonly number[];
}

interface ThreadsResponse {
  threads?: ReadonlyArray<{ id?: unknown }>;
}

interface StackTraceResponse {
  stackFrames?: ReadonlyArray<{ id?: unknown }>;
}

// Phase 11 plan 02 (PAUSED-02): when `--frame-id` is omitted, resolve it to
// the topmost frame of the most-recently-stopped thread on a paused session.
// Hints go to stderr; resolution failures fall through to a no-frame evaluate
// so the user's request is never aborted by auto-frame plumbing.
async function resolveAutoFrameId(output: OutputWriter, name: string | undefined): Promise<number | undefined> {
  const hint = (message: string): void => output.warn(`evaluate: ${message}`);
  let client;
  try {
    client = await createControllerClient({ dapCliHome: process.env.DAP_CLI_HOME });
  } catch {
    hint(`auto-frame failed (controller unavailable); sending evaluate without --frame-id`);
    return undefined;
  }

  try {
    let status: SessionStatusForAutoFrame;
    try {
      status = await client.request<SessionStatusForAutoFrame>('sessions.status', name === undefined ? undefined : { name });
    } catch {
      hint(`auto-frame failed (status lookup failed); sending evaluate without --frame-id`);
      return undefined;
    }

    if (status.paused !== true) {
      hint(`session not paused; sending evaluate without --frame-id (uses adapter REPL context)`);
      return undefined;
    }

    let threadId: number | undefined;
    const stoppedThreadIds = Array.isArray(status.stoppedThreadIds) ? status.stoppedThreadIds : [];
    if (stoppedThreadIds.length > 0) {
      threadId = stoppedThreadIds[0];
      if (stoppedThreadIds.length > 1) {
        hint(`auto-selected frame from thread ${threadId}; ${stoppedThreadIds.length} threads paused — pass --thread-id or --frame-id to disambiguate`);
      }
    } else {
      let threadsResponse: ThreadsResponse;
      try {
        threadsResponse = await client.request<ThreadsResponse>('dap.request', { command: 'threads', args: {}, ...(name === undefined ? {} : { name }) });
      } catch (error) {
        hint(`auto-frame failed (threads request failed: ${describeError(error)}); sending evaluate without --frame-id`);
        return undefined;
      }
      const firstThreadId = threadsResponse.threads?.[0]?.id;
      if (typeof firstThreadId !== 'number' || !Number.isInteger(firstThreadId)) {
        hint(`auto-frame failed (no threads reported); sending evaluate without --frame-id`);
        return undefined;
      }
      threadId = firstThreadId;
    }

    let stackResponse: StackTraceResponse;
    try {
      stackResponse = await client.request<StackTraceResponse>('dap.request', {
        command: 'stackTrace',
        args: { threadId, startFrame: 0, levels: 1 },
        ...(name === undefined ? {} : { name }),
      });
    } catch (error) {
      hint(`auto-frame failed (stackTrace request failed: ${describeError(error)}); sending evaluate without --frame-id`);
      return undefined;
    }

    const firstFrameId = stackResponse.stackFrames?.[0]?.id;
    if (typeof firstFrameId !== 'number' || !Number.isInteger(firstFrameId)) {
      hint(`auto-frame failed (empty stack trace); sending evaluate without --frame-id`);
      return undefined;
    }
    return firstFrameId;
  } finally {
    await client.close();
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
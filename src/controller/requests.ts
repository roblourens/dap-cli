import { z } from 'zod';

export const controllerRequestMethods = [
  'controller.start',
  'controller.status',
  'controller.shutdown',
  'controller.cleanup',
  'controller.hello',
  'sessions.launch',
  'sessions.attach',
  'sessions.list',
  'sessions.target',
  'sessions.use',
  'sessions.status',
  'sessions.stop',
  'sessions.detach',
  'sessions.close',
  'sessions.cleanup',
  'dap.start',
  'dap.startCompound',
  'dap.request',
  'dap.capabilities',
  'dap.continue',
  'dap.stackTrace',
  'dap.scopes',
  'dap.variables',
  'dap.setBreakpoints',
  'events.list',
  'events.recent',
] as const;

export type ControllerRequestMethod = (typeof controllerRequestMethods)[number];

export const controllerRequestMethodSchema = z.enum(controllerRequestMethods);

export const controllerRequestSchema = z.object({
  id: z.string().min(1),
  method: controllerRequestMethodSchema,
  params: z.unknown().optional(),
});

export interface ControllerRequest<TParams = unknown> {
  id: string;
  method: ControllerRequestMethod;
  params?: TParams;
}

export interface ControllerResponse<TResponse = unknown> {
  id: string;
  ok: true;
  result: TResponse;
}

export interface ControllerFailureResponse {
  id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    category?: string;
    exitCode?: number;
    diagnostics?: readonly string[];
    sessionId?: string;
    request?: { command: string; seq?: number };
    adapter?: { descriptorId?: string; pid?: number; stderrTail?: readonly string[]; logPath?: string };
    // Plan 05-19 (gap H-3): structured machine-readable recovery payload.
    data?: Readonly<Record<string, unknown>>;
  };
}

export const controllerSuccessResponseSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown(),
});

export const controllerFailureResponseSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    category: z.string().min(1).optional(),
    exitCode: z.number().int().optional(),
    diagnostics: z.array(z.string()).optional(),
    sessionId: z.string().min(1).optional(),
    request: z.object({
      command: z.string().min(1),
      seq: z.number().int().positive().optional(),
    }).optional(),
    adapter: z.object({
      descriptorId: z.string().min(1).optional(),
      pid: z.number().int().positive().optional(),
      stderrTail: z.array(z.string()).optional(),
      logPath: z.string().min(1).optional(),
    }).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const controllerResponseSchema = z.discriminatedUnion('ok', [
  controllerSuccessResponseSchema,
  controllerFailureResponseSchema,
]);

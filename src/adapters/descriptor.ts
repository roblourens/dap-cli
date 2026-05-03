import { z } from 'zod';

const adapterIdSchema = z.string().min(1).regex(/^[A-Za-z0-9._-]+$/, 'Adapter id may only contain letters, numbers, dots, underscores, and dashes.');

export interface AdapterDescriptor {
  id: string;
  label: string;
  transport:
    | { kind: 'stdio'; command: string; args: string[]; cwd?: string | undefined; env?: Record<string, string> | undefined }
    | { kind: 'socket'; host: '127.0.0.1'; port: number };
}

export const adapterDescriptorSchema: z.ZodType<AdapterDescriptor> = z.object({
  id: adapterIdSchema,
  label: z.string().min(1),
  transport: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('stdio'),
      command: z.string().min(1),
      args: z.array(z.string()),
      cwd: z.string().min(1).optional(),
      env: z.record(z.string(), z.string()).optional(),
    }),
    z.object({
      kind: z.literal('socket'),
      host: z.literal('127.0.0.1'),
      port: z.number().int().positive(),
    }),
  ]),
});

export function parseAdapterDescriptor(value: unknown): AdapterDescriptor {
  return adapterDescriptorSchema.parse(value);
}

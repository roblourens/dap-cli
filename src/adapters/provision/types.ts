// Shared types for the per-adapter provisioners. Lives in its own module to
// keep `index.ts` <-> per-adapter modules import graph acyclic.

export type AdapterId = 'js-debug' | 'debugpy' | 'delve';

export interface ProvisionContext {
  readonly env: NodeJS.ProcessEnv;
  readonly assumeYes: boolean;
  readonly adaptersDir: string;
  readonly stdin?: NodeJS.ReadStream;
  readonly stderr?: NodeJS.WriteStream;
}

export interface ProvisionResult {
  readonly adapterId: AdapterId;
  readonly version: string;
  readonly installRoot: string;
  readonly entrypoint: string;
  readonly fromCache: boolean;
}

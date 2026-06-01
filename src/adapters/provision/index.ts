import { provisionJsDebug } from './jsDebug.js';
import { provisionDebugpy } from './debugpy.js';
import { provisionDelve } from './delve.js';
import { provisionCodeLldb } from './codelldb.js';
import type { AdapterId, ProvisionContext, ProvisionResult } from './types.js';

export type { AdapterId, ProvisionContext, ProvisionResult } from './types.js';

export async function provisionAdapter(id: AdapterId, ctx: ProvisionContext): Promise<ProvisionResult> {
  switch (id) {
    case 'js-debug':
      return provisionJsDebug(ctx);
    case 'debugpy':
      return provisionDebugpy(ctx);
    case 'delve':
      return provisionDelve(ctx);
    case 'codelldb':
      return provisionCodeLldb(ctx);
  }
}

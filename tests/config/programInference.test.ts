import { describe, expect, test } from 'vitest';
import { inferAdapterAndType } from '../../src/config/programInference.js';

describe('inferAdapterAndType', () => {
  test('both --adapter and --type given pass through with inferred=false for both', () => {
    const result = inferAdapterAndType({ adapter: 'js-debug', type: 'pwa-node', program: 'whatever.py' });
    expect(result.adapterId).toBe('js-debug');
    expect(result.type).toBe('pwa-node');
    expect(result.inferred).toEqual({ adapter: false, type: false });
  });

  test('explicit --adapter with un-mapped --type still wins (no validation that they agree)', () => {
    const result = inferAdapterAndType({ adapter: 'fake', type: 'totally-not-mapped' });
    expect(result.adapterId).toBe('fake');
    expect(result.type).toBe('totally-not-mapped');
    expect(result.inferred).toEqual({ adapter: false, type: false });
  });

  test('adapter-only js-debug with .html program defaults type to pwa-chrome', () => {
    const result = inferAdapterAndType({ adapter: 'js-debug', program: '/tmp/index.html' });
    expect(result.adapterId).toBe('js-debug');
    expect(result.type).toBe('pwa-chrome');
    expect(result.inferred).toEqual({ adapter: false, type: true });
  });

  test('adapter-only js-debug with .htm program defaults type to pwa-chrome', () => {
    const result = inferAdapterAndType({ adapter: 'js-debug', program: '/tmp/index.htm' });
    expect(result.type).toBe('pwa-chrome');
  });

  test('adapter-only js-debug with .js program defaults type to pwa-node', () => {
    const result = inferAdapterAndType({ adapter: 'js-debug', program: '/tmp/server.js' });
    expect(result.adapterId).toBe('js-debug');
    expect(result.type).toBe('pwa-node');
    expect(result.inferred).toEqual({ adapter: false, type: true });
  });

  test('adapter-only js-debug with no program defaults type to pwa-node', () => {
    const result = inferAdapterAndType({ adapter: 'js-debug' });
    expect(result.type).toBe('pwa-node');
  });

  test('adapter-only debugpy defaults type to python', () => {
    const result = inferAdapterAndType({ adapter: 'debugpy' });
    expect(result.adapterId).toBe('debugpy');
    expect(result.type).toBe('python');
    expect(result.inferred).toEqual({ adapter: false, type: true });
  });

  test('adapter-only delve defaults type to go', () => {
    const result = inferAdapterAndType({ adapter: 'delve' });
    expect(result.adapterId).toBe('delve');
    expect(result.type).toBe('go');
    expect(result.inferred).toEqual({ adapter: false, type: true });
  });

  test('adapter-only codelldb defaults type to lldb', () => {
    const result = inferAdapterAndType({ adapter: 'codelldb' });
    expect(result.adapterId).toBe('codelldb');
    expect(result.type).toBe('lldb');
    expect(result.inferred).toEqual({ adapter: false, type: true });
  });

  test('adapter-only custom adapter returns undefined type (no fabrication)', () => {
    const result = inferAdapterAndType({ adapter: 'my-custom-adapter', program: '/tmp/script.js' });
    expect(result.adapterId).toBe('my-custom-adapter');
    expect(result.type).toBeUndefined();
    expect(result.inferred).toEqual({ adapter: false, type: false });
  });

  test('type-only node maps to js-debug', () => {
    const result = inferAdapterAndType({ type: 'node' });
    expect(result.adapterId).toBe('js-debug');
    expect(result.type).toBe('node');
    expect(result.inferred).toEqual({ adapter: true, type: false });
  });

  test('type-only python maps to debugpy', () => {
    const result = inferAdapterAndType({ type: 'python' });
    expect(result.adapterId).toBe('debugpy');
    expect(result.type).toBe('python');
  });

  test('type-only lldb maps to codelldb', () => {
    const result = inferAdapterAndType({ type: 'lldb' });
    expect(result.adapterId).toBe('codelldb');
    expect(result.type).toBe('lldb');
    expect(result.inferred).toEqual({ adapter: true, type: false });
  });

  test('type-only with unknown type re-throws unknown_launch_type', () => {
    expect(catchErrorCode(() => inferAdapterAndType({ type: 'totally-bogus' }))).toBe('unknown_launch_type');
  });

  test('type-only respects customTypeMap', () => {
    const result = inferAdapterAndType({ type: 'fakeType', customTypeMap: { fakeType: 'custom-fake' } });
    expect(result.adapterId).toBe('custom-fake');
    expect(result.type).toBe('fakeType');
    expect(result.inferred).toEqual({ adapter: true, type: false });
  });

  test('program-only .py maps to debugpy/python', () => {
    const result = inferAdapterAndType({ program: '/tmp/app.py' });
    expect(result.adapterId).toBe('debugpy');
    expect(result.type).toBe('python');
    expect(result.inferred).toEqual({ adapter: true, type: true });
  });

  test('program-only .go maps to delve/go', () => {
    const result = inferAdapterAndType({ program: '/tmp/app.go' });
    expect(result.adapterId).toBe('delve');
    expect(result.type).toBe('go');
    expect(result.inferred).toEqual({ adapter: true, type: true });
  });

  test('program-only .js / .mjs / .cjs map to js-debug / pwa-node', () => {
    for (const ext of ['.js', '.mjs', '.cjs']) {
      const result = inferAdapterAndType({ program: `/tmp/app${ext}` });
      expect(result.adapterId, ext).toBe('js-debug');
      expect(result.type, ext).toBe('pwa-node');
    }
  });

  test('program-only .ts / .mts / .cts map to js-debug / pwa-node', () => {
    for (const ext of ['.ts', '.mts', '.cts']) {
      const result = inferAdapterAndType({ program: `/tmp/app${ext}` });
      expect(result.adapterId, ext).toBe('js-debug');
      expect(result.type, ext).toBe('pwa-node');
    }
  });

  test('program-only .html / .htm map to js-debug / pwa-chrome', () => {
    for (const ext of ['.html', '.htm']) {
      const result = inferAdapterAndType({ program: `/tmp/page${ext}` });
      expect(result.adapterId, ext).toBe('js-debug');
      expect(result.type, ext).toBe('pwa-chrome');
    }
  });

  test('program-only with unsupported extension throws adapter_inference_failed with extension data', () => {
    const captured = catchErrorDetail(() => inferAdapterAndType({ program: '/tmp/app.foo' }));
    expect(captured.code).toBe('adapter_inference_failed');
    expect(captured.data?.extension).toBe('.foo');
    expect(captured.data?.program).toBe('/tmp/app.foo');
  });

  test('program-only .rs remains unsupported because Rust source is not a launch executable', () => {
    const captured = catchErrorDetail(() => inferAdapterAndType({ program: '/tmp/main.rs' }));
    expect(captured.code).toBe('adapter_inference_failed');
    expect(captured.data).toMatchObject({ program: '/tmp/main.rs', extension: '.rs' });
  });

  test('program-only with no extension throws adapter_inference_failed with empty extension', () => {
    const captured = catchErrorDetail(() => inferAdapterAndType({ program: '/tmp/run' }));
    expect(captured.code).toBe('adapter_inference_failed');
    expect(captured.data?.extension).toBe('');
  });

  test('program extension match is case-insensitive', () => {
    const result = inferAdapterAndType({ program: '/tmp/App.JS' });
    expect(result.adapterId).toBe('js-debug');
    expect(result.type).toBe('pwa-node');
  });

  test('all-absent returns fake adapter with undefined type', () => {
    const result = inferAdapterAndType({});
    expect(result.adapterId).toBe('fake');
    expect(result.type).toBeUndefined();
    expect(result.inferred).toEqual({ adapter: false, type: false });
  });
});

function catchErrorCode(callback: () => unknown): string | undefined {
  try {
    callback();
  } catch (error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  }
  return undefined;
}

function catchErrorDetail(callback: () => unknown): { code: string | undefined; data: Record<string, unknown> | undefined } {
  try {
    callback();
  } catch (error: unknown) {
    if (error instanceof Error) {
      const code = 'code' in error && typeof (error as { code: unknown }).code === 'string' ? (error as { code: string }).code : undefined;
      const data = 'data' in error ? (error as { data?: Record<string, unknown> }).data : undefined;
      return { code, data };
    }
  }
  return { code: undefined, data: undefined };
}

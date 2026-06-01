import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  launchConfigTypeMap,
  listLaunchConfigEntries,
  loadVSCodeLaunchJson,
  loadVSCodeLaunchConfig,
  mapDebugpyFlags,
  mapJsDebugFlags,
  applyJsDebugSourceMapDefaults,
  resolveAdapterIdFromType,
  resolveLaunchConfigurationConfig,
  resolveLaunchConfigEntry,
  resolveLaunchConfig,
  validateCodeLldbNativeConfig,
} from '../../src/config/launchConfig.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'dap-cli-launch-config-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('launch config resolution', () => {
  test('merges named config, JSON, and flags by precedence', () => {
    expect(resolveLaunchConfig({
      namedConfig: { program: 'named.js', cwd: 'named', request: 'launch' },
      jsonConfig: { program: 'json.js', env: { A: '1' } },
      flags: { program: 'flags.js' },
    })).toEqual({ program: 'flags.js', cwd: 'named', request: 'launch', env: { A: '1' } });
  });

  test('maps VS Code launch types to adapter ids', () => {
    expect(launchConfigTypeMap.node).toBe('js-debug');
    expect(resolveAdapterIdFromType('pwa-chrome')).toBe('js-debug');
    expect(resolveAdapterIdFromType('python')).toBe('debugpy');
    expect(resolveAdapterIdFromType('debugpy')).toBe('debugpy');
    expect(resolveAdapterIdFromType('go')).toBe('delve');
    expect(resolveAdapterIdFromType('lldb')).toBe('codelldb');
  });

  test('reports unknown launch types', () => {
    expect(catchErrorCode(() => resolveAdapterIdFromType('unknown'))).toBe('unknown_launch_type');
  });

  test('loads .vscode launch configurations and returns empty for missing files', async () => {
    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([]);

    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), JSON.stringify({
      configurations: [{ type: 'node', name: 'Run app', program: 'app.js' }],
    }), 'utf8');

    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([{ type: 'node', name: 'Run app', program: 'app.js' }]);
  });

  test('loads VS Code JSONC launch configurations with comments and trailing commas', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), `{
      // VS Code launch files are JSONC.
      "configurations": [
        { "type": "node", "name": "Run app", "program": "app.js", },
      ],
    }`, 'utf8');

    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([{ type: 'node', name: 'Run app', program: 'app.js' }]);
  });

  test('loads launch.json documents with configurations and compounds', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), `{
      // VS Code launch files allow JSONC.
      "configurations": [
        { "type": "node", "request": "launch", "name": "Run app", "program": "app.js", },
      ],
      "compounds": [
        { "name": "Full stack", "configurations": ["Run app"], "stopAll": false, },
      ],
    }`, 'utf8');

    expect(await loadVSCodeLaunchConfig(tempDir)).toEqual([{ type: 'node', request: 'launch', name: 'Run app', program: 'app.js' }]);
    expect(await loadVSCodeLaunchJson(tempDir)).toEqual({
      workspaceFolder: tempDir,
      configurations: [{ type: 'node', request: 'launch', name: 'Run app', program: 'app.js' }],
      compounds: [{ name: 'Full stack', configurations: ['Run app'], stopAll: false }],
    });
  });

  test('lists configuration and compound entries', () => {
    expect(listLaunchConfigEntries({
      workspaceFolder: tempDir,
      configurations: [{ type: 'node', request: 'launch', name: 'Run app', program: 'app.js' }],
      compounds: [{ name: 'Full stack', configurations: ['Run app'], stopAll: true }],
    })).toEqual([
      { kind: 'configuration', name: 'Run app', type: 'node', request: 'launch' },
      { kind: 'compound', name: 'Full stack', configurations: ['Run app'], stopAll: true },
    ]);
  });

  test('resolves launch config entries and reports missing or ambiguous names', () => {
    const document = {
      workspaceFolder: tempDir,
      configurations: [{ type: 'node', request: 'launch', name: 'Run app', program: 'app.js' }],
      compounds: [{ name: 'Full stack', configurations: ['Run app'], stopAll: true }],
    };

    expect(resolveLaunchConfigEntry(document, 'Run app')).toEqual({
      kind: 'configuration',
      configuration: { type: 'node', request: 'launch', name: 'Run app', program: 'app.js' },
    });
    expect(resolveLaunchConfigEntry(document, 'Full stack')).toEqual({
      kind: 'compound',
      compound: { name: 'Full stack', configurations: ['Run app'], stopAll: true },
    });
    expect(catchErrorCode(() => resolveLaunchConfigEntry(document, 'Missing'))).toBe('launch_config_not_found');
    expect(catchErrorCode(() => resolveLaunchConfigEntry({
      workspaceFolder: tempDir,
      configurations: [{ type: 'node', request: 'launch', name: 'Duplicate', program: 'app.js' }],
      compounds: [{ name: 'Duplicate', configurations: ['Duplicate'] }],
    }, 'Duplicate'))).toBe('launch_config_ambiguous');
  });

  test('resolves workspace and environment variables recursively', () => {
    const resolved = resolveLaunchConfigurationConfig({
      type: 'node',
      name: 'Run app',
      request: 'launch',
      program: '${workspaceFolder}/src/app.js',
      cwd: '${workspaceFolder}',
      args: ['--root', '${workspaceFolderBasename}', '--home', '${userHome}'],
      env: { PATH_VALUE: '${env:EXAMPLE_PATH}', EXEC_PATH: '${execPath}' },
      nested: { file: '${workspaceFolder}/nested.js' },
    }, {
      workspaceFolder: path.join(tempDir, 'workspace-root'),
      env: { EXAMPLE_PATH: '/example/bin' },
      execPath: '/usr/local/bin/node',
      userHome: '/Users/example',
    });

    expect(resolved).toMatchObject({
      program: path.join(tempDir, 'workspace-root', 'src/app.js'),
      cwd: path.join(tempDir, 'workspace-root'),
      args: ['--root', 'workspace-root', '--home', '/Users/example'],
      env: { PATH_VALUE: '/example/bin', EXEC_PATH: '/usr/local/bin/node' },
      nested: { file: path.join(tempDir, 'workspace-root', 'nested.js') },
    });
  });

  test('reports unresolved and unsupported launch variables with paths', () => {
    expect(catchErrorCode(() => resolveLaunchConfigurationConfig({
      type: 'node',
      name: 'Run app',
      request: 'launch',
      env: { MISSING: '${env:DOES_NOT_EXIST}' },
    }, { workspaceFolder: tempDir, env: {} }))).toBe('unresolved_launch_variable');

    expect(catchErrorCode(() => resolveLaunchConfigurationConfig({
      type: 'node',
      name: 'Run app',
      request: 'launch',
      program: '${command:extension.command}',
    }, { workspaceFolder: tempDir }))).toBe('unsupported_launch_variable');

    expect(catchErrorCode(() => resolveLaunchConfigurationConfig({
      type: 'node',
      name: 'Run app',
      request: 'launch',
      args: ['${input:choice}'],
    }, { workspaceFolder: tempDir }))).toBe('unsupported_launch_variable');
  });

  test('applies platform overlays and strips nonmatching overlays', () => {
    const resolved = resolveLaunchConfigurationConfig({
      type: 'chrome',
      name: 'Run browser',
      request: 'launch',
      runtimeExecutable: 'base-browser',
      osx: { runtimeExecutable: 'mac-browser', args: ['--mac'] },
      mac: { cwd: '${workspaceFolder}' },
      linux: { runtimeExecutable: 'linux-browser' },
      windows: { runtimeExecutable: 'windows-browser' },
    }, { workspaceFolder: tempDir, platform: 'darwin' });

    expect(resolved).toMatchObject({
      runtimeExecutable: 'mac-browser',
      args: ['--mac'],
      cwd: tempDir,
    });
    expect(resolved).not.toHaveProperty('osx');
    expect(resolved).not.toHaveProperty('mac');
    expect(resolved).not.toHaveProperty('linux');
    expect(resolved).not.toHaveProperty('windows');
  });

  test('preserves adapter-native fields and strips VS Code-only fields', () => {
    expect(resolveLaunchConfigurationConfig({
      type: 'chrome',
      name: 'Launch VS Code Internal',
      request: 'launch',
      userDataDir: '${userHome}/.vscode-oss-dev',
      webRoot: '${workspaceFolder}',
      cleanUp: 'wholeBrowser',
      killBehavior: 'polite',
      browserLaunchLocation: 'workspace',
      cascadeTerminateToConfigurations: ['Attach to Extension Host'],
      pauseForSourceMap: false,
      env: { NULL_VALUE: null },
      presentation: { hidden: true },
      internalConsoleOptions: 'neverOpen',
      serverReadyAction: { pattern: 'ready' },
      preLaunchTask: 'build',
      postDebugTask: 'cleanup',
    }, { workspaceFolder: tempDir, userHome: '/Users/example' })).toEqual({
      type: 'chrome',
      name: 'Launch VS Code Internal',
      request: 'launch',
      userDataDir: '/Users/example/.vscode-oss-dev',
      webRoot: tempDir,
      cleanUp: 'wholeBrowser',
      killBehavior: 'polite',
      browserLaunchLocation: 'workspace',
      cascadeTerminateToConfigurations: ['Attach to Extension Host'],
      pauseForSourceMap: false,
      env: { NULL_VALUE: null },
    });
  });

  test('preserves Go launch and attach fields while normalizing relative launch programs from cwd', () => {
    const launch = resolveLaunchConfigurationConfig({
      type: 'go',
      name: 'Debug Go app',
      request: 'launch',
      mode: 'debug',
      cwd: '${workspaceFolder}/module',
      program: 'cmd/app/main.go',
    }, { workspaceFolder: tempDir });
    expect(launch).toMatchObject({
      type: 'go',
      request: 'launch',
      mode: 'debug',
      cwd: path.join(tempDir, 'module'),
      program: path.join(tempDir, 'module', 'cmd', 'app', 'main.go'),
    });

    const attach = resolveLaunchConfigurationConfig({
      type: 'go',
      name: 'Attach Go app',
      request: 'attach',
      mode: 'local',
      processId: 4242,
    }, { workspaceFolder: tempDir });
    expect(attach).toMatchObject({ type: 'go', request: 'attach', mode: 'local', processId: 4242 });
  });

  test('preserves already absolute Go launch program paths', () => {
    const program = path.join(tempDir, 'absolute', 'main.go');
    expect(resolveLaunchConfigurationConfig({
      type: 'go',
      name: 'Debug absolute Go app',
      request: 'launch',
      mode: 'debug',
      cwd: '${workspaceFolder}/module',
      program,
    }, { workspaceFolder: tempDir })).toMatchObject({
      cwd: path.join(tempDir, 'module'),
      program,
    });
  });

  test('preserves explicit CodeLLDB native Rust launch fields without cargo', () => {
    const resolved = resolveLaunchConfigurationConfig({
      type: 'lldb',
      name: 'Debug Rust executable',
      request: 'launch',
      program: '${workspaceFolder}/target/debug/demo',
      cwd: '${workspaceFolder}',
      args: ['--flag'],
      env: { RUST_LOG: 'debug' },
      sourceLanguages: ['rust'],
      sourceMap: { '/build': '${workspaceFolder}' },
    }, { workspaceFolder: tempDir });

    expect(validateCodeLldbNativeConfig(resolved)).toEqual({
      type: 'lldb',
      name: 'Debug Rust executable',
      request: 'launch',
      program: path.join(tempDir, 'target', 'debug', 'demo'),
      cwd: tempDir,
      args: ['--flag'],
      env: { RUST_LOG: 'debug' },
      sourceLanguages: ['rust'],
      sourceMap: { '/build': tempDir },
    });
  });

  test('rejects every CodeLLDB extension-owned cargo configuration with explicit-binary recovery', () => {
    for (const config of [
      { type: 'lldb', name: 'Cargo', request: 'launch', cargo: { args: ['build'] } },
      { type: 'lldb', name: 'Cargo plus program', request: 'launch', cargo: { args: ['build'] }, program: '/tmp/target/debug/demo' },
    ]) {
      let error: unknown;
      try {
        validateCodeLldbNativeConfig(config);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        code: 'codelldb_cargo_config_unsupported',
        category: 'usage',
        data: { adapterId: 'codelldb', unsupportedField: 'cargo', requiredField: 'program' },
      });
    }
  });

  test('reports invalid launch JSON', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(path.join(tempDir, '.vscode', 'launch.json'), '{', 'utf8');

    await expect(loadVSCodeLaunchConfig(tempDir)).rejects.toMatchObject({ code: 'invalid_launch_json' });
  });

  // Round 6 R6-I regression: VS Code tolerates UTF-8 BOM in launch.json,
  // and copies of real workspaces frequently include one. The loader used
  // to reject these files as `Invalid JSONC at offset 0`. Strip the BOM
  // before handing the buffer to the JSONC parser.
  test('tolerates a UTF-8 BOM at the start of launch.json', async () => {
    await fs.mkdir(path.join(tempDir, '.vscode'));
    await fs.writeFile(
      path.join(tempDir, '.vscode', 'launch.json'),
      '\uFEFF' + JSON.stringify({ configurations: [{ type: 'node', request: 'launch', name: 'BOM run', program: 'app.js' }] }),
      'utf8',
    );

    const document = await loadVSCodeLaunchJson(tempDir);
    expect(document.configurations).toHaveLength(1);
    expect(document.configurations[0]?.name).toBe('BOM run');
  });

  // Round 6 R6-H regression: pointing --workspace at a regular file (rather
  // than a directory) used to bubble up an uncaught ENOTDIR as
  // `internal_error`/exit-70. Map common filesystem-shape errors to a
  // structured `invalid_workspace` usage error.
  test('reports invalid_workspace when the workspace path is a regular file', async () => {
    const filePath = path.join(tempDir, 'not-a-dir');
    await fs.writeFile(filePath, 'hello', 'utf8');

    await expect(loadVSCodeLaunchJson(filePath)).rejects.toMatchObject({
      code: 'invalid_workspace',
      category: 'usage',
    });
  });

  test('maps js-debug flags to native config fields', () => {
    expect(mapJsDebugFlags({ type: 'node', program: 'app.ts', cwd: '/repo', runtimeExecutable: 'node', url: 'http://localhost:3000', port: 9229 })).toEqual({
      type: 'pwa-node',
      program: 'app.ts',
      cwd: '/repo',
      runtimeExecutable: 'node',
      url: 'http://localhost:3000',
      port: 9229,
    });
  });

  test('maps debugpy flags to native config fields', () => {
    expect(mapDebugpyFlags({ program: 'main.py', cwd: '/repo', python: '.venv/bin/python', port: 5678 })).toEqual({
      program: 'main.py',
      cwd: '/repo',
      python: '.venv/bin/python',
      connect: { host: '127.0.0.1', port: 5678 },
    });
  });

  test('maps electron runtime flag to node type for js-debug', () => {
    expect(mapJsDebugFlags({ runtimeExecutable: 'electron' })).toEqual({ runtimeExecutable: 'electron', type: 'pwa-node' });
  });

  test('passes stopOnEntry through to js-debug native config', () => {
    expect(mapJsDebugFlags({ program: 'app.js', stopOnEntry: true })).toEqual({ program: 'app.js', stopOnEntry: true });
  });

  test('passes adapter-native js-debug fields through flag mapping', () => {
    expect(mapJsDebugFlags({
      type: 'chrome',
      userDataDir: '/tmp/profile',
      webRoot: '/repo',
      cleanUp: 'wholeBrowser',
      browserLaunchLocation: 'workspace',
      pauseForSourceMap: false,
    })).toEqual({
      type: 'pwa-chrome',
      userDataDir: '/tmp/profile',
      webRoot: '/repo',
      cleanUp: 'wholeBrowser',
      browserLaunchLocation: 'workspace',
      pauseForSourceMap: false,
    });
  });

  test('adds js-debug source map defaults for TypeScript workspaces', async () => {
    await fs.writeFile(path.join(tempDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { sourceMap: true } }), 'utf8');

    await expect(applyJsDebugSourceMapDefaults({ type: 'pwa-node', program: 'dist/index.js' }, { workspaceFolder: tempDir })).resolves.toEqual({
      type: 'pwa-node',
      program: 'dist/index.js',
      sourceMaps: true,
      outFiles: [
        path.join(tempDir, 'dist', '**', '*.js'),
        path.join(tempDir, 'out', '**', '*.js'),
        path.join(tempDir, 'build', '**', '*.js'),
      ],
    });
  });

  test('keeps explicit js-debug source map settings', async () => {
    await fs.writeFile(path.join(tempDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { sourceMap: true } }), 'utf8');

    await expect(applyJsDebugSourceMapDefaults({ type: 'pwa-node', sourceMaps: false, outFiles: ['custom/**/*.js'] }, { workspaceFolder: tempDir })).resolves.toEqual({
      type: 'pwa-node',
      sourceMaps: false,
      outFiles: ['custom/**/*.js'],
    });
  });

  test('passes stopOnEntry through to debugpy native config', () => {
    expect(mapDebugpyFlags({ program: 'main.py', stopOnEntry: true })).toEqual({ program: 'main.py', stopOnEntry: true });
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
# Plan 17-01 Summary — Build the 20-scenario Code OSS attach matrix

## Result

`17-SCENARIOS.md` written with exactly 20 distinct Code-OSS-only attach
scenarios, each carrying a self-contained `subagent_prompt` block that names
both required skills (`~/.copilot/skills/dap-cli/SKILL.md` and
`/Users/roblou/code/vscode/.agents/skills/launch/SKILL.md`) as the first
instruction.

Acceptance gates verified locally:

- 20 `### S-NN ` headings (exactly).
- `## How To Use`, `## Scenario Matrix`, `## Coverage Audit` all present.
- 21 references to the dap-cli skill (one in How-To-Use, one per scenario).
- 21 references to the VS Code launch skill (one in How-To-Use, one per scenario).
- 38 references to the persistent profile path `.build/chat-memory-smoke/user-data`
  across renderer/workbench scenarios.
- 20 `**subagent_prompt:**` blocks.
- No off-vscode GitHub URLs.

## Distribution

### Across target processes (10 distinct families)

| Process | Scenarios |
|---|---|
| Electron main | S-01, S-14, S-17, S-20 |
| Renderer (workbench / chat / file service) | S-03, S-09, S-11, S-13, S-16, S-18 |
| Extension host | S-02, S-12 |
| Shared process | S-04 |
| Pty host | S-05 |
| File watcher | S-06 |
| Search service | S-07 |
| Agent host | S-08 |
| Webview children | S-10 |
| Code-server (Code OSS as web server) | S-15 |
| Compound (renderer + main + ext host + shared + agent host) | S-19 |

### Across debug ops (12 distinct ops)

| Op | Scenarios |
|---|---|
| Line breakpoint | S-01, S-02, S-04, S-06, S-07, S-08, S-15 |
| Conditional breakpoint | S-05 |
| Logpoint | S-09 |
| Exception breakpoint (uncaught) | S-14 |
| Step in / over / out | S-11 |
| Restart-frame | S-12 |
| Pause-while-running | S-13 |
| Multi-thread enumeration / pause non-main | S-16 |
| Breakpoints list / clear (DAP replacement semantics) | S-17 |
| Evaluate (REPL form) | S-18 |
| Session enumeration / `child_session_not_targetable` | S-10 |
| Compound member targeting + stopAll cascade | S-19 |
| Wrong-verb auto-route (Phase 10 regression check) | S-20 |
| Renderer line breakpoint via Playwright trigger | S-03 |

### Across launch verbs

- `attach` — S-01..S-18 (workspace `--config "Attach to ..."` or raw `--type pwa-chrome --port`).
- `launch` (compound) — S-19.
- `launch` (intentional misuse to test auto-route) — S-20.

## Notes / Fallbacks

- All breakpoint targets are function declaration lines verified via `grep -n`
  against the live `/Users/roblou/code/vscode` checkout. Files that didn't
  exist (`chatWidget.ts` at the old `browser/` path; `chatService.ts` flat;
  `textFileService.ts` in `common/`) were resolved to the current paths
  (`browser/widget/chatWidget.ts`, `common/chatService/chatServiceImpl.ts`,
  `browser/textFileService.ts`).
- S-06 (file watcher) and S-08 (agent host) depend on inspector hooks
  (`VSCODE_FILE_WATCHER_INSPECT_PORT`, `--inspect-agenthost`) that may not
  exist on the current branch. Both scenario prompts instruct the executor
  subagent to mark `result: blocked` with the missing-hook reason if so —
  that's signal for Phase 17-02 to file as a doc-skill gap rather than treat
  as a dap-cli bug.
- S-15 uses a unique inspect port (5872) and HTTP port (8898) to avoid
  collisions with the canonical attach ports baked into the workspace
  launch.json (5870/5874-5879).
- Renderer scenarios use distinct CDP ports (9224..9230) so reruns can
  happen without orphans confusing things, even though Plan 17-02 runs
  serially.

## Next

Plan 17-02 (Wave 2) will iterate this matrix with one fresh subagent per
scenario.

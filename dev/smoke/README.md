# Hand-driven smoke sequences

These are the canonical end-to-end smoke runs used to verify dap-cli releases. They are **not** product documentation — they live here, not under `docs/`, because they are part of the development verification workflow rather than something a user reads to learn the tool.

| File | When to use |
|---|---|
| [hand-driven-smoke.md](hand-driven-smoke.md) | Mandatory Sequence A / Sequence B runs for every `/gsd-verify-work` round (see `.github/copilot-instructions.md`) |
| [vscode-chat-smoke.md](vscode-chat-smoke.md) | Drives VS Code OSS built from sources, breakpointing the chat input — exercises `--config` + multi-renderer pwa-chrome |

Run these from a real terminal with the published `node dist/index.js` (or installed `dap-cli`) entrypoint and paste the verbatim output into the relevant phase UAT.

---
quick_id: 260525-ot8
slug: set-up-npm-publishing-via-github-actions
created: 2026-05-26
status: complete
---

# Summary: Set up npm publishing via GitHub Actions

## What changed

- Added `.github/workflows/publish.yml` — a release-driven workflow that
  publishes `@roblourens/dap-cli` to npm with provenance.

The repo had no `.github/workflows/` directory before this change; publishing
was fully manual. Release-process docs (`NPM_TOKEN` setup, per-release steps)
are captured below in this summary rather than in the user-facing README —
they belong in a contributor doc, not the README.

## Workflow behavior

- **Trigger:** `release: { types: [published] }` (auto-runs on every GitHub
  Release) plus `workflow_dispatch` (manual re-run from the Actions tab if a
  publish fails after the release is already created).
- **Permissions:** Top-level `contents: read`; job adds `id-token: write` so
  `--provenance` can sign the upload.
- **Steps:**
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` — Node 22, `registry-url:
     https://registry.npmjs.org`, npm cache enabled.
  3. `npm ci`
  4. **Tag-vs-version guard** (release trigger only): fails fast if the
     release tag (with leading `v` stripped) does not equal `package.json`
     `version`. Prevents accidentally publishing a wrong version when a tag
     and a version bump go out of sync. Skipped on `workflow_dispatch` so
     manual re-runs aren't blocked.
  5. `npm run check` — typecheck, lint, tests, build, packaging tests.
  6. `npm publish --provenance --access public` with
     `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.

## What the user still has to do once

1. On npmjs.com → Account → Access Tokens → Generate New Token →
   **Automation** type (CI-friendly, bypasses 2FA prompts). Scope it to
   `@roblourens/dap-cli` if they want a narrow token, or leave broad.
2. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret** → name `NPM_TOKEN`, paste the token value.

After that, every published GitHub Release ships to npm automatically.

## Cutting a release

```
npm version patch        # or minor / major; bumps package.json + tags
git push --follow-tags   # push commit + tag
# Then: GitHub UI → Releases → Draft a new release → pick the v<x.y.z> tag → Publish
```

The workflow runs automatically and the package appears on npm within a
minute or two.

## Notes / non-goals

- **No PR/CI workflow** was added. The user only asked for publish; gating PRs
  on tests is a separate decision.
- **No auto-version-bumping or changelog generation** (release-please,
  changesets, semantic-release). The version field in `package.json` remains
  the source of truth; the workflow only enforces that the release tag agrees
  with it.
- **NPM_TOKEN over OIDC trusted publishing** was chosen for setup simplicity.
  Swapping to OIDC later is a small change: register the repo on npmjs.com as
  a trusted publisher and remove the `NODE_AUTH_TOKEN` env from the publish
  step.
- **Provenance** is enabled because the repo is public and it's now the npm
  recommended default; it adds a verifiable supply-chain attestation linking
  the published tarball to this workflow run.

## Files touched

- `.github/workflows/publish.yml` (new, 50 lines)

## Verification

- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/publish.yml'))"`
  parses cleanly. Triggers, permissions, and all 6 steps verified
  programmatically.
- Real-world verification (a publish actually running) requires the user to
  add the `NPM_TOKEN` secret and cut a release — out of scope for this task.

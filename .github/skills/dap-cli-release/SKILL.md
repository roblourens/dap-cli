---
name: dap-cli-release
description: "Use when: cutting a new dap-cli release to npm. Walks through bumping the version, pushing the tag, and creating the GitHub Release that triggers the publish workflow."
argument-hint: "[patch|minor|major or explicit version]"
allowed-tools: Read, Bash, AskUserQuestion
---

# dap-cli Release Workflow

Publishing `@roblourens/dap-cli` to npm is automated by [.github/workflows/publish.yml](../../workflows/publish.yml). The workflow runs on `release: published` (any GitHub Release going from draft → published) plus `workflow_dispatch` (manual re-run). This skill is the human side: bump the version, push the tag, create the Release.

## Prerequisites (one-time, per repo)

- npmjs.com → Account → Access Tokens → generate an **Automation** token for `@roblourens/dap-cli`.
- GitHub repo → Settings → Secrets and variables → Actions → add `NPM_TOKEN` with that token value.

If `NPM_TOKEN` is missing, the publish step fails with a 401 from the registry.

## Release steps

1. **Confirm `main` is clean and up to date.**

   ```bash
   git switch main
   git pull --ff-only
   git status   # must be clean
   ```

2. **Bump the version.**

   Ask the user (or accept argument) which bump: `patch`, `minor`, `major`, or an explicit `x.y.z`.

   ```bash
   npm version <patch|minor|major>     # or: npm version 0.2.0
   ```

   `npm version` edits `package.json`, creates a commit (`vX.Y.Z`), and creates a matching git tag `vX.Y.Z`. Do not edit `package.json` by hand for a release — the workflow's tag-vs-version guard requires the tag (with leading `v` stripped) to equal `package.json` `version`.

3. **Push the commit and the tag together.**

   ```bash
   git push --follow-tags
   ```

   `--follow-tags` pushes annotated tags reachable from the pushed commits. Without it the tag stays local and the GitHub Release step has nothing to point at.

4. **Create the GitHub Release.**

   This is the step that triggers the publish workflow. Pushing the tag alone does NOT.

   Pick one path:

   - **`gh` CLI (preferred — single command):**

     ```bash
     gh release create vX.Y.Z --generate-notes --verify-tag
     ```

     `--generate-notes` autopopulates release notes from commits since the previous tag. `--verify-tag` makes `gh` fail if the tag does not exist on the remote (catches a missed `--follow-tags`).

   - **GitHub web UI:**

     Repo → Releases → **Draft a new release** → choose the existing `vX.Y.Z` tag (do NOT pick "Create new tag" — push the tag first) → **Generate release notes** → **Publish release**.

   Either way, "publish" (not "save draft") is what fires the `release: published` event the workflow listens for.

5. **Watch the workflow.**

   ```bash
   gh run watch                         # picks the most recent run
   # or
   gh run list --workflow publish.yml --limit 3
   ```

   The job runs `npm ci` → tag-vs-version guard → `npm run check` (typecheck, lint, tests, build, packaging) → `npm publish --provenance --access public`. Provenance signing uses the job's OIDC token via `id-token: write`.

6. **Verify it landed.**

   ```bash
   npm view @roblourens/dap-cli version
   ```

   Should equal the version just released. The package page on npmjs.com will show a "Provenance" badge linking back to the workflow run.

## Recovery

- **Workflow failed after the Release was already published** (e.g. flaky test, transient registry error): re-run from the Actions tab via `workflow_dispatch`, or:

  ```bash
  gh workflow run publish.yml
  ```

  The tag-vs-version guard is skipped on `workflow_dispatch`, so this works without recreating the Release.

- **Tag was pushed but Release not yet created:** just create the Release pointing at the existing tag (step 4). No re-push needed.

- **Wrong version was tagged:** delete the tag locally and remotely, bump again. Do not force-push over a released tag.

  ```bash
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
  ```

- **Already published to npm with the wrong content:** npm does not allow republishing the same version. Bump to the next patch and release again. `npm unpublish` within the 72-hour window is technically possible but discouraged.

## Non-goals

This skill does NOT cover changelog curation, prerelease (`-beta`, `-rc`) tags, or migrating off `NPM_TOKEN` to OIDC trusted publishing. Add them as separate skills if needed.

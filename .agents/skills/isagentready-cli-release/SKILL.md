---
name: isagentready-cli-release
description: Release the isagentready CLI to npm (version bump, release PR, npm publish, signed tag, GitHub release).
disable-model-invocation: true
---

# /isagentready-cli-release

Release the `isagentready` npm package from `~/Sites/isagentready-cli`. `main` is protected, so a release goes through a PR. `scripts/release.mjs` does every step. Do not run `npm publish`, `git tag` or `gh release` by hand.

## Usage

- `/isagentready-cli-release patch`, `minor`, `major` or an explicit `x.y.z`. The default is `patch`.
- A new command, option or a breaking change is `minor` while the version is below 1.0.

## Steps

### 1. Release notes

Check out `main`, pull, and read `## Unreleased` in `CHANGELOG.md`. Write the notes there if they are missing: one line per user-visible change under `### Features`, `### Bug Fixes` or `### Breaking Changes`, in STE, no em-dashes. Commit them through a normal PR.

Done when: `main` is up to date and `## Unreleased` holds the notes for every change since the last tag (`git log v<last>..main`).

### 2. Release PR

```bash
pnpm release prepare <patch|minor|major|x.y.z>
```

The script refuses when `main` is not clean or not in sync, or when the tag or the npm version exists. It runs typecheck, tests and build. Then it moves the notes to a version entry, bumps `package.json`, and pushes `chore/release-v<version>` with a PR.

Done when: the script prints the PR URL and CI on the PR is green.

### 3. Merge

Give Bart the merge command. Auto mode does not merge PRs.

```bash
gh pr merge <n> --merge --repo BartWaardenburg/isagentready-cli
```

Done when: the PR state is merged.

### 4. Publish

npm needs 2FA in the browser, and auto mode blocks a publish. Give Bart this command for his terminal:

```bash
cd ~/Sites/isagentready-cli && git pull --ff-only && pnpm release publish
```

The script publishes to npm, pushes a signed tag `v<version>`, makes the GitHub release from the CHANGELOG entry, and checks that npm `latest` is the new version. After a failure, run it again: it skips each part that is already done.

Done when: the script prints `Released isagentready@<version>`.

### 5. Check

```bash
npx -y isagentready@<version> --version
```

Done when: the output is the new version.

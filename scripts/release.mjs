#!/usr/bin/env node
// Release flow for the isagentready CLI. main is protected, so a release goes in two parts:
//   node scripts/release.mjs prepare <patch|minor|major|x.y.z>   opens the release PR
//   node scripts/release.mjs publish                             after the merge: npm, tag, GitHub release
// Each publish step checks its own state first, so a second run after a failure is safe.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bumpVersion, releaseChangelog, releaseNotes, setPackageVersion } from "./release-lib.mjs";

const PACKAGE = "isagentready";
const REPO_URL = "https://github.com/BartWaardenburg/isagentready-cli";
const BASE = "main";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const runLoud = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const succeeds = (cmd, args) => {
  try {
    run(cmd, args);
    return true;
  } catch {
    return false;
  }
};
const fail = (message) => {
  console.error(`release: ${message}`);
  process.exit(1);
};
const step = (message) => console.log(`\n> ${message}`);

const packageVersion = () => JSON.parse(readFileSync("package.json", "utf8")).version;

const requireCleanBase = () => {
  if (run("git", ["branch", "--show-current"]) !== BASE) fail(`check out ${BASE} first.`);
  if (run("git", ["status", "--porcelain"]) !== "") fail("the working tree is not clean.");
  run("git", ["fetch", "--quiet", "origin", BASE, "--tags"]);
  const [behind, ahead] = run("git", ["rev-list", "--left-right", "--count", `origin/${BASE}...HEAD`]).split(/\s+/);
  if (behind !== "0") fail(`${BASE} is behind origin/${BASE}. Run git pull --ff-only.`);
  if (ahead !== "0") fail(`${BASE} has local commits that are not on origin/${BASE}.`);
};

const verifyBuild = () => {
  step("typecheck, tests and build");
  runLoud("pnpm", ["typecheck"]);
  runLoud("pnpm", ["test"]);
  runLoud("pnpm", ["build"]);
};

const tagExists = (tag) =>
  succeeds("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]) ||
  run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]) !== "";

const isPublished = (version) => succeeds("npm", ["view", `${PACKAGE}@${version}`, "version"]);

const prepare = (spec) => {
  if (!spec) fail("usage: release.mjs prepare <patch|minor|major|x.y.z>");
  requireCleanBase();
  const previous = packageVersion();
  const version = bumpVersion(previous, spec);
  const tag = `v${version}`;
  const branch = `chore/release-${tag}`;
  if (tagExists(tag)) fail(`tag ${tag} already exists.`);
  if (isPublished(version)) fail(`${PACKAGE}@${version} is already on npm.`);

  const date = new Date().toISOString().slice(0, 10);
  const changelog = releaseChangelog(readFileSync("CHANGELOG.md", "utf8"), { version, previous, date, repoUrl: REPO_URL });
  verifyBuild();

  step(`release branch ${branch}`);
  run("git", ["checkout", "-b", branch]);
  writeFileSync("CHANGELOG.md", changelog);
  writeFileSync("package.json", setPackageVersion(readFileSync("package.json", "utf8"), version));
  run("git", ["add", "CHANGELOG.md", "package.json"]);
  runLoud("git", ["commit", "-S", "-m", `chore(release): ${tag}`]);
  runLoud("git", ["push", "-u", "origin", branch]);

  const body = `## Summary\n\nRelease ${tag}.\n\n${releaseNotes(changelog, version)}\n\nAfter the merge, run \`pnpm release publish\` on ${BASE}.`;
  const url = run("gh", ["pr", "create", "--base", BASE, "--head", branch, "--title", `chore(release): ${tag}`, "--body", body]);
  run("git", ["checkout", BASE]);
  console.log(`\nRelease PR: ${url}\nMerge it, then run: git pull --ff-only && pnpm release publish`);
};

const publish = () => {
  requireCleanBase();
  const version = packageVersion();
  const tag = `v${version}`;
  const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
  if (!run("git", ["log", "--format=%s", `-n`, "50"]).split("\n").includes(`chore(release): ${tag}`)) {
    fail(`${BASE} has no "chore(release): ${tag}" commit. Run prepare and merge the release PR first.`);
  }
  if (succeeds("npm", ["whoami"]) === false) fail("npm is not logged in. Run npm login.");
  verifyBuild();

  if (isPublished(version)) {
    step(`${PACKAGE}@${version} is already on npm, skip publish`);
  } else {
    step(`npm publish ${PACKAGE}@${version} (npm asks for 2FA in the browser or terminal)`);
    runLoud("npm", ["publish"]);
  }

  if (tagExists(tag)) {
    step(`tag ${tag} exists, skip tag`);
  } else {
    step(`signed tag ${tag}`);
    run("git", ["tag", "-s", tag, "-m", `Release ${tag}`]);
    runLoud("git", ["push", "origin", tag]);
  }

  if (succeeds("gh", ["release", "view", tag])) {
    step(`GitHub release ${tag} exists, skip release`);
  } else {
    step(`GitHub release ${tag}`);
    runLoud("gh", ["release", "create", tag, "--title", tag, "--notes", notes, "--verify-tag"]);
  }

  const live = run("npm", ["view", PACKAGE, "dist-tags.latest"]);
  if (live !== version) fail(`npm latest is ${live}, not ${version}.`);
  console.log(`\nReleased ${PACKAGE}@${version}: npm latest, tag ${tag}, GitHub release.`);
};

const [command, arg] = process.argv.slice(2);
try {
  if (command === "prepare") prepare(arg);
  else if (command === "publish") publish();
  else fail("usage: release.mjs prepare <patch|minor|major|x.y.z> | publish");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

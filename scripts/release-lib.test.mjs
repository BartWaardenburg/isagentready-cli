import { describe, expect, it } from "vitest";
import { bumpVersion, releaseChangelog, releaseNotes, setPackageVersion } from "./release-lib.mjs";

const REPO = "https://github.com/BartWaardenburg/isagentready-cli";

const changelog = `# Changelog

## Unreleased

### Features

* add the \`foo\` command.

## [0.3.0](${REPO}/compare/v0.2.2...v0.3.0) (2026-10-23)

### Bug Fixes

* old fix.
`;

describe("bumpVersion", () => {
  it("bumps patch, minor and major", () => {
    expect(bumpVersion("0.3.0", "patch")).toBe("0.3.1");
    expect(bumpVersion("0.3.4", "minor")).toBe("0.4.0");
    expect(bumpVersion("0.3.4", "major")).toBe("1.0.0");
  });

  it("accepts an explicit higher version", () => {
    expect(bumpVersion("0.3.0", "0.5.0")).toBe("0.5.0");
  });

  it("rejects a version that is not higher", () => {
    expect(() => bumpVersion("0.3.0", "0.3.0")).toThrow(/higher/);
    expect(() => bumpVersion("0.3.0", "0.2.9")).toThrow(/higher/);
  });

  it("rejects an unknown spec", () => {
    expect(() => bumpVersion("0.3.0", "next")).toThrow(/patch, minor, major/);
  });
});

describe("releaseChangelog", () => {
  it("turns the Unreleased section into the version entry and adds an empty one", () => {
    const out = releaseChangelog(changelog, { version: "0.4.0", previous: "0.3.0", date: "2026-11-01", repoUrl: REPO });
    expect(out).toContain(`## Unreleased\n\n## [0.4.0](${REPO}/compare/v0.3.0...v0.4.0) (2026-11-01)\n\n### Features`);
    expect(out.match(/## Unreleased/g)).toHaveLength(1);
    expect(out).toContain("## [0.3.0]");
  });

  it("refuses a release without notes", () => {
    const empty = changelog.replace("### Features\n\n* add the `foo` command.\n\n", "");
    expect(() => releaseChangelog(empty, { version: "0.4.0", previous: "0.3.0", date: "2026-11-01", repoUrl: REPO })).toThrow(/no notes/);
  });

  it("refuses a changelog without an Unreleased section", () => {
    const none = changelog.replace("## Unreleased\n\n", "");
    expect(() => releaseChangelog(none, { version: "0.4.0", previous: "0.3.0", date: "2026-11-01", repoUrl: REPO })).toThrow(/Unreleased/);
  });
});

describe("releaseNotes", () => {
  it("returns the body of one version entry", () => {
    const notes = releaseNotes(changelog, "0.3.0");
    expect(notes).toBe("### Bug Fixes\n\n* old fix.");
  });

  it("matches the old top-level heading style too", () => {
    expect(releaseNotes("# [0.3.0](x) (d)\n\n* a\n\n## [0.2.2](y)\n", "0.3.0")).toBe("* a");
  });

  it("throws when the version has no entry", () => {
    expect(() => releaseNotes(changelog, "9.9.9")).toThrow(/9\.9\.9/);
  });
});

describe("setPackageVersion", () => {
  it("changes only the version line", () => {
    const pkg = `{\n  "name": "isagentready",\n  "version": "0.3.0",\n  "dependencies": { "x": "0.3.0" }\n}\n`;
    expect(setPackageVersion(pkg, "0.4.0")).toBe(pkg.replace('"version": "0.3.0"', '"version": "0.4.0"'));
  });
});

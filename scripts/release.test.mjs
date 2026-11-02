import { execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));
vi.mock("node:fs", () => ({
  readFileSync: vi.fn((path) => {
    if (path === "package.json") return JSON.stringify({ version: "0.4.0" });
    if (path === "CHANGELOG.md") return "## [0.4.0](release)\n\n* Release fixture.\n";
    throw new Error(`Unexpected release file: ${path}`);
  }),
  writeFileSync: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each([
  { message: "npm error code EPUBLISHCONFLICT", accepted: true },
  {
    message: "npm error You cannot publish over the previously published versions: 0.4.0.",
    accepted: true,
  },
  { message: "npm error code EOTP", accepted: false },
  { message: "EPUBLISHCONFLICT\nnpm error code EOTP", accepted: false },
  { message: "npm error code E403: permission denied", accepted: false },
  {
    message: "npm error You cannot publish over the previously published versions: 0.3.0.",
    accepted: false,
  },
])(
  "resumes only a conflict for the intended publication: $message",
  async ({ message, accepted }) => {
    vi.useFakeTimers();
    let versionReads = 0;
    let latestReads = 0;
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      if (command === "git" && args[0] === "branch") return "main";
      if (command === "git" && args[0] === "rev-list") return "0 0";
      if (command === "git" && args[0] === "log") return "chore(release): v0.4.0";
      if (command === "npm" && args[0] === "whoami") return "bartwaardenburg";
      if (command === "npm" && args[0] === "publish") throw new Error(message);
      if (command === "npm" && args[1] === "isagentready@0.4.0") {
        if (versionReads++ === 0) throw new Error("Package not visible yet");
        return "0.4.0";
      }
      if (command === "npm" && args[2] === "dist-tags.latest") {
        latestReads += 1;
        return "0.4.0";
      }
      return "";
    });
    vi.mocked(spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter() });
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from(message));
        child.emit("close", 1, null);
      });
      return child;
    });
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`release exited ${code}`);
    });
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "release.mjs", "publish"]);

    const outcome = await import("./release.mjs").then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error: error.message }),
    );
    expect(outcome).toEqual(accepted ? { ok: true } : { ok: false, error: "release exited 1" });
    expect(latestReads).toBe(accepted ? 1 : 0);
  },
);

it.each([
  {
    name: "latest appears after acceptance",
    latest: ["0.3.0", "0.4.0"],
    versions: ["0.4.0"],
    ok: true,
  },
  {
    name: "version appears after its dist-tag",
    latest: ["0.4.0"],
    versions: ["0.4.0", null, "0.4.0"],
    ok: true,
  },
  { name: "registry stays unavailable", latest: ["0.3.0"], versions: ["0.4.0"], ok: false },
])("handles npm availability: $name", async ({ latest, versions, ok }) => {
  vi.useFakeTimers();
  let started = 0;
  let latestReads = 0;
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === "git" && args[0] === "branch") return "main";
    if (command === "git" && args[0] === "rev-list") return "0 0";
    if (command === "git" && args[0] === "log") return "chore(release): v0.4.0";
    if (command === "npm" && args[0] === "whoami") return "bartwaardenburg";
    if (command === "npm" && args[1] === "isagentready@0.4.0") {
      const version = versions.length > 1 ? versions.shift() : versions[0];
      if (version === null) throw new Error("Version is still being scanned");
      return version;
    }
    if (command === "npm" && args[2] === "dist-tags.latest") {
      if (latestReads === 0) started = Date.now();
      latestReads += 1;
      return latest.length > 1 ? latest.shift() : latest[0];
    }
    return "";
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`release exited ${code}`);
  });
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "release.mjs", "publish"]);

  const outcome = import("./release.mjs").then(
    () => ({ ok: true }),
    (error) => ({ ok: false, error: error.message }),
  );
  await vi.waitFor(() => expect(latestReads).toBeGreaterThan(0));
  await vi.runAllTimersAsync();
  if (ok) {
    expect(await outcome).toEqual({ ok: true });
    expect(Date.now() - started).toBe(10 * 1000);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Released isagentready@0.4.0"));
  } else {
    expect(await outcome).toEqual({ ok: false, error: "release exited 1" });
    expect(Date.now() - started).toBe(15 * 60 * 1000);
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("Check npm publish-time scanning"),
    );
  }
});

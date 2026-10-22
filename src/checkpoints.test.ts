import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ScanResult } from "./api.js";
import {
  EXIT,
  stableIdOf,
  legacyIdOf,
  filterFailing,
  findCheckpoint,
  fillPlaceholders,
  runCheckpoints,
  runExplain,
  runMethodology,
  runResultsCheckpoint,
  runResultsFailing,
  runVerify,
} from "./checkpoints.js";
import definition from "./fixtures/checkpoint-definition.json" with { type: "json" };
import checkpointList from "./fixtures/checkpoints-list.json" with { type: "json" };
import methodology from "./fixtures/methodology.json" with { type: "json" };
import changelog from "./fixtures/changelog.json" with { type: "json" };
import scoring from "./fixtures/scoring.json" with { type: "json" };
import scanContract from "./fixtures/scan-contract.json" with { type: "json" };
import scanLegacy from "./fixtures/scan-legacy.json" with { type: "json" };

const childProcess = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  fork: vi.fn(),
}));
vi.mock("node:child_process", () => childProcess);
vi.mock("child_process", () => childProcess);

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const contractScan = scanContract as unknown as ScanResult;
const legacyScan = scanLegacy as unknown as ScanResult;
const requestedUrls = (): string[] => mockFetch.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  mockFetch.mockReset();
  for (const fn of Object.values(childProcess)) fn.mockReset();
});

describe("checkpoint ids", () => {
  it("reads the stable id and the legacy id from a contract result", () => {
    const cp = findCheckpoint(contractScan, "4.3")!;
    expect(stableIdOf(cp)).toBe("ia.a2a-agent-card");
    expect(legacyIdOf(cp)).toBe("4.3");
  });

  it("reads the ids from a definition", () => {
    expect(stableIdOf(definition as never)).toBe("ia.a2a-agent-card");
    expect(legacyIdOf(definition as never)).toBe("4.3");
  });

  it("has no stable id in a legacy result", () => {
    const cp = findCheckpoint(legacyScan, "4.3")!;
    expect(stableIdOf(cp)).toBeNull();
    expect(legacyIdOf(cp)).toBe("4.3");
  });
});

describe("findCheckpoint", () => {
  it("finds a checkpoint by stable id", () => {
    expect(findCheckpoint(contractScan, "ia.a2a-agent-card")?.name).toBe("A2A Agent Card");
  });

  it("finds a checkpoint by legacy id in a legacy payload", () => {
    expect(findCheckpoint(legacyScan, "1.3")?.name).toBe("llms.txt");
  });

  it("returns null for an unknown id", () => {
    expect(findCheckpoint(contractScan, "ia.nope")).toBeNull();
  });
});

describe("filterFailing", () => {
  it("keeps only fail and partial checkpoints and drops empty categories", () => {
    const filtered = filterFailing(legacyScan);
    const ids = filtered.categories!.flatMap((c) => c.checkpoints.map((cp) => cp.id));
    expect(ids).toEqual(["1.3", "4.3"]);
    expect(filtered.domain).toBe("example.com");
  });

  it("does not change the input", () => {
    filterFailing(contractScan);
    expect(contractScan.categories![1]!.checkpoints).toHaveLength(2);
  });
});

describe("fillPlaceholders", () => {
  it("fills the domain and origin placeholders", () => {
    expect(fillPlaceholders("curl {origin}/x && echo {domain}", "example.com")).toBe(
      "curl https://example.com/x && echo example.com"
    );
  });
});

describe("runCheckpoints", () => {
  it("returns the server list", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(checkpointList));

    const result = await runCheckpoints({ stage: "Act" });

    expect(result).toEqual({ ok: true, data: checkpointList });
    expect(requestedUrls()[0]).toContain("/api/v2/checkpoints?stage=act");
  });

  it("rejects an invalid filter without a request", async () => {
    const result = await runCheckpoints({ strength: "COULD" });

    expect(result).toMatchObject({ ok: false, error: { exitCode: EXIT.VALIDATION } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports a clear error when the catalog endpoint is missing", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404));

    const result = await runCheckpoints({});

    expect(result).toEqual({
      ok: false,
      error: { exitCode: EXIT.NOT_FOUND, message: "The checkpoint catalog is not available on this server yet." },
    });
  });
});

describe("runExplain", () => {
  it("returns the definition", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(definition));

    const result = await runExplain("4.3");

    expect(result).toEqual({ ok: true, data: definition });
  });

  it("exits with not found for an unknown id", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ detail: "Unknown checkpoint" }, 404));

    const result = await runExplain("ia.nope");

    expect(result).toEqual({
      ok: false,
      error: {
        exitCode: EXIT.NOT_FOUND,
        message: "Unknown checkpoint id: ia.nope. Run isagentready checkpoints for the list.",
      },
    });
  });

  it("exits with a validation error for a malformed id", async () => {
    const result = await runExplain("../etc");

    expect(result).toMatchObject({ ok: false, error: { exitCode: EXIT.VALIDATION } });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("runMethodology", () => {
  it("returns the current methodology", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(methodology));

    const result = await runMethodology({});

    expect(result).toEqual({ ok: true, data: { kind: "methodology", document: methodology } });
  });

  it("returns the changelog", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(changelog));

    const result = await runMethodology({ changelog: true });

    expect(result).toEqual({ ok: true, data: { kind: "changelog", document: changelog } });
  });

  it("returns the scoring document of a version", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scoring));

    const result = await runMethodology({ version: "2026-11-02", scoring: true });

    expect(result).toEqual({ ok: true, data: { kind: "scoring", document: scoring } });
    expect(requestedUrls()[0]).toContain("/api/v2/methodology/2026-11-02/scoring");
  });

  it("asks the server for the current version before it gets the scoring document", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(methodology)).mockResolvedValueOnce(jsonResponse(scoring));

    await runMethodology({ scoring: true });

    expect(requestedUrls()[1]).toContain("/api/v2/methodology/2026-11-02/scoring");
  });

  it("exits with not found for an unknown version", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404));

    const result = await runMethodology({ version: "2020-01-01" });

    expect(result).toMatchObject({ ok: false, error: { exitCode: EXIT.NOT_FOUND } });
  });
});

describe("runResultsFailing", () => {
  it("asks for failing checkpoints with the contract and filters the result", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runResultsFailing("example.com");

    expect(requestedUrls()[0]).toContain("/api/v1/scan/example.com?checkpoints=failing&include=contract");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const statuses = result.data.categories!.flatMap((c) => c.checkpoints.map((cp) => cp.status));
    expect(statuses).toEqual(["partial", "fail"]);
  });

  it("filters a current server payload that ignores the query", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanLegacy));

    const result = await runResultsFailing("example.com");

    expect(result.ok && result.data.categories!.length).toBe(2);
  });
});

describe("runResultsCheckpoint", () => {
  it("returns one checkpoint with the scan context", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runResultsCheckpoint("example.com", "ia.a2a-agent-card");

    expect(result).toMatchObject({
      ok: true,
      data: {
        domain: "example.com",
        completed_at: "2026-10-20T10:30:00Z",
        methodology_version: "2026-09-02",
        checkpoint: { stable_id: "ia.a2a-agent-card", status: "fail" },
      },
    });
  });

  it("exits with not found when the scan has no such checkpoint", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runResultsCheckpoint("example.com", "ia.nope");

    expect(result).toEqual({
      ok: false,
      error: { exitCode: EXIT.NOT_FOUND, message: "No checkpoint ia.nope in the scan result for example.com." },
    });
  });
});

describe("runVerify", () => {
  it("reports the status and the filled verify command", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runVerify("4.3", "example.com");

    expect(result).toEqual({
      ok: true,
      data: {
        domain: "example.com",
        checkpoint_id: "ia.a2a-agent-card",
        legacy_id: "4.3",
        name: "A2A Agent Card",
        status: "fail",
        passed: false,
        failure: expect.objectContaining({ reason_code: "agent_card_missing" }),
        verify: {
          command: "curl -sf https://example.com/.well-known/agent-card.json | jq -e '.name and .url'",
          expect: "exit code 0",
          rescan: "isagentready results example.com --checkpoint ia.a2a-agent-card",
        },
        command_executed: false,
        completed_at: "2026-10-20T10:30:00Z",
        methodology_version: "2026-09-02",
      },
      exitCode: EXIT.CHECK_FAILED,
    });
  });

  it("exits with success when the checkpoint passes", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runVerify("ia.webmcp", "example.com");

    expect(result).toMatchObject({ ok: true, data: { status: "pass", passed: true }, exitCode: EXIT.SUCCESS });
  });

  it("gets the verify data from the catalog when the scan has no contract fields", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanLegacy)).mockResolvedValueOnce(jsonResponse(definition));

    const result = await runVerify("4.3", "example.com");

    expect(requestedUrls()[1]).toContain("/api/v2/checkpoints/4.3");
    expect(result).toMatchObject({
      ok: true,
      data: { checkpoint_id: "ia.a2a-agent-card", verify: { command: expect.stringContaining("https://example.com/") } },
    });
  });

  it("still reports the status when the catalog is not available", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanLegacy)).mockResolvedValueOnce(jsonResponse({}, 404));

    const result = await runVerify("4.3", "example.com");

    expect(result).toMatchObject({
      ok: true,
      data: {
        checkpoint_id: "4.3",
        status: "fail",
        verify: { command: null, expect: null, rescan: "isagentready verify 4.3 example.com --rescan" },
      },
    });
  });

  it("starts a new scan with --rescan", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ...scanContract, status: "completed" }))
      .mockResolvedValueOnce(jsonResponse(scanContract));

    await runVerify("4.3", "example.com", { rescan: true });

    expect(mockFetch.mock.calls[0]![1]).toMatchObject({ method: "POST" });
    expect(requestedUrls()[1]).toContain("include=contract");
  });

  it("exits with not found for an id that is not in the scan", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(scanContract));

    const result = await runVerify("ia.nope", "example.com");

    expect(result).toMatchObject({ ok: false, error: { exitCode: EXIT.NOT_FOUND } });
  });

  it("never spawns a shell or a child process", async () => {
    mockFetch.mockResolvedValue(jsonResponse(scanContract));

    await runVerify("4.3", "example.com");
    await runVerify("ia.llms-txt", "example.com");

    for (const fn of Object.values(childProcess)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("source code", () => {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(srcDir)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => readFileSync(join(srcDir, file), "utf8"));

  it("has no way to run a command string", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/child_process|\beval\(|new Function\(|node:vm|worker_threads/);
    }
  });
});

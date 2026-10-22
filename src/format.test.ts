import { describe, it, expect } from "vitest";
import {
  formatScanResult,
  formatRankings,
  scoreColor,
  gradeBg,
  statusIcon,
  truncate,
  formatCheckpointList,
  formatCheckpointDefinition,
  formatMethodology,
  formatChangelog,
  formatScoring,
  formatFailingResult,
  formatCheckpointResult,
  formatVerifyReport,
} from "./format.js";
import type {
  ScanResult,
  RankingsResponse,
  CheckpointList,
  CheckpointDefinition,
  MethodologyDocument,
  ChangelogDocument,
  ScoringDocument,
  Checkpoint,
} from "./api.js";
import type { VerifyReport } from "./checkpoints.js";
import { filterFailing, findCheckpoint } from "./checkpoints.js";
import definitionFixture from "./fixtures/checkpoint-definition.json" with { type: "json" };
import listFixture from "./fixtures/checkpoints-list.json" with { type: "json" };
import methodologyFixture from "./fixtures/methodology.json" with { type: "json" };
import changelogFixture from "./fixtures/changelog.json" with { type: "json" };
import scoringFixture from "./fixtures/scoring.json" with { type: "json" };
import scanContractFixture from "./fixtures/scan-contract.json" with { type: "json" };
import scanLegacyFixture from "./fixtures/scan-legacy.json" with { type: "json" };

// Strip ANSI codes for easier assertions
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

const scan = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  id: "abc-123",
  domain: "example.com",
  status: "completed",
  overall_score: 72,
  letter_grade: "B",
  scan_duration_ms: 18500,
  completed_at: "2025-01-15T10:30:00Z",
  categories: [
    {
      category: "discovery",
      label: "AI Content Discovery",
      score: 80,
      max_score: 100,
      weight: 30,
      checkpoints: [
        {
          id: "1.1",
          name: "robots.txt present",
          status: "pass",
          score: 15,
          max_score: 15,
          details: "Valid robots.txt found",
        },
        {
          id: "1.2",
          name: "AI crawler directives",
          status: "fail",
          score: 0,
          max_score: 15,
          details: "No AI crawlers allowed",
          recommendation: "Add User-agent: GPTBot Allow: / to robots.txt",
        },
      ],
    },
  ],
  ...overrides,
});

describe("scoreColor", () => {
  it("returns green for high scores", () => {
    const fn = scoreColor(80);
    expect(fn("test")).toContain("\x1b[32m");
  });

  it("returns yellow for mid scores", () => {
    const fn = scoreColor(50);
    expect(fn("test")).toContain("\x1b[33m");
  });

  it("returns red for low scores", () => {
    const fn = scoreColor(20);
    expect(fn("test")).toContain("\x1b[31m");
  });
});

describe("gradeBg", () => {
  it("returns green bg for A+", () => {
    expect(gradeBg("A+")("test")).toContain("\x1b[42m");
  });

  it("returns green bg for B", () => {
    expect(gradeBg("B")("test")).toContain("\x1b[42m");
  });

  it("returns yellow bg for C", () => {
    expect(gradeBg("C")("test")).toContain("\x1b[43m");
  });

  it("returns red bg for D", () => {
    expect(gradeBg("D")("test")).toContain("\x1b[41m");
  });

  it("returns red bg for F", () => {
    expect(gradeBg("F")("test")).toContain("\x1b[41m");
  });
});

describe("statusIcon", () => {
  it("renders pass as green check", () => {
    expect(statusIcon("pass")).toContain("✓");
    expect(statusIcon("pass")).toContain("\x1b[32m");
  });

  it("renders fail as red cross", () => {
    expect(statusIcon("fail")).toContain("✗");
    expect(statusIcon("fail")).toContain("\x1b[31m");
  });

  it("renders partial as yellow half", () => {
    expect(statusIcon("partial")).toContain("◐");
  });

  it("renders skip as dim circle", () => {
    expect(statusIcon("skip")).toContain("○");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("formatScanResult", () => {
  it("includes domain and score", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain("example.com");
    expect(result).toContain("72/100");
  });

  it("includes letter grade", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain(" B ");
  });

  it("includes scan duration", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain("18.5s");
  });

  it("includes category labels", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain("AI Content Discovery");
    expect(result).toContain("30% weight");
  });

  it("shows top recommendations for failing checkpoints", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain("AI crawler directives");
    expect(result).toContain("Add User-agent: GPTBot");
  });

  it("includes link to full report", () => {
    const result = strip(formatScanResult(scan()));
    expect(result).toContain("https://isagentready.com/scan/example.com");
  });

  it("shows checkpoints in verbose mode", () => {
    const result = strip(formatScanResult(scan(), true));
    expect(result).toContain("1.1");
    expect(result).toContain("robots.txt present");
    expect(result).toContain("15/15");
    expect(result).toContain("Valid robots.txt found");
  });

  it("handles A+ grade", () => {
    const result = strip(formatScanResult(scan({ letter_grade: "A+", overall_score: 98 })));
    expect(result).toContain(" A+ ");
    expect(result).toContain("98/100");
  });

  it("handles missing categories", () => {
    const result = strip(formatScanResult(scan({ categories: [] })));
    expect(result).toContain("example.com");
    expect(result).not.toContain("Categories");
  });

  it("handles missing scan duration", () => {
    const result = strip(formatScanResult(scan({ scan_duration_ms: undefined })));
    expect(result).not.toContain("Scanned in");
  });
});

describe("formatRankings", () => {
  const rankings: RankingsResponse = {
    entries: [
      { id: "1", domain: "best.com", status: "completed", overall_score: 95, letter_grade: "A+" },
      { id: "2", domain: "good.com", status: "completed", overall_score: 72, letter_grade: "B" },
    ],
    total: 50,
    page: 1,
    per_page: 25,
    total_pages: 2,
  };

  it("includes header with total count", () => {
    const result = strip(formatRankings(rankings));
    expect(result).toContain("AI Agent Readiness Rankings");
    expect(result).toContain("50 websites ranked");
  });

  it("includes page info", () => {
    const result = strip(formatRankings(rankings));
    expect(result).toContain("Page 1/2");
  });

  it("lists entries with rank", () => {
    const result = strip(formatRankings(rankings));
    expect(result).toContain("1");
    expect(result).toContain("best.com");
    expect(result).toContain("95/100");
    expect(result).toContain("2");
    expect(result).toContain("good.com");
  });

  it("shows next page hint when not on last page", () => {
    const result = strip(formatRankings(rankings));
    expect(result).toContain("isagentready rankings --page 2");
  });

  it("hides next page hint on last page", () => {
    const lastPage = { ...rankings, page: 2, total_pages: 2 };
    const result = strip(formatRankings(lastPage));
    expect(result).not.toContain("--page");
  });

  it("calculates correct rank offset for page 2", () => {
    const page2 = { ...rankings, page: 2 };
    const result = strip(formatRankings(page2));
    expect(result).toContain("26");
    expect(result).toContain("27");
  });
});

const contractScan = scanContractFixture as unknown as ScanResult;
const legacyScan = scanLegacyFixture as unknown as ScanResult;
const definition = definitionFixture as unknown as CheckpointDefinition;
const lineCount = (s: string): number => s.split("\n").length;

describe("formatScanResult with contract fields", () => {
  it("shows the stable id, stage and strength of a failing checkpoint", () => {
    const result = strip(formatScanResult(contractScan));
    expect(result).toContain("A2A Agent Card  ia.a2a-agent-card · ACT · MAY");
  });

  it("is not longer than the output for the current payload", () => {
    expect(lineCount(formatScanResult(contractScan))).toBe(lineCount(formatScanResult(legacyScan)));
  });

  it("shows no fix steps or verify command by default", () => {
    const result = strip(formatScanResult(contractScan));
    expect(result).not.toContain("curl");
    expect(result).not.toContain("1. Create the agent card JSON file.");
  });

  it("adds fix steps and the filled verify command in verbose mode", () => {
    const result = strip(formatScanResult(contractScan, true));
    expect(result).toContain("4.3 A2A Agent Card");
    expect(result).toContain("ia.a2a-agent-card · ACT · MAY");
    expect(result).toContain("1. Create the agent card JSON file.");
    expect(result).toContain("curl -sf https://example.com/.well-known/agent-card.json");
  });

  it("keeps the placeholders when the scan domain is not a strict host name", () => {
    const unsafe = { ...contractScan, domain: "example.com;touch /tmp/x" };
    const result = strip(formatScanResult(unsafe, true));
    expect(result).toContain("curl -sf https://{domain}/.well-known/agent-card.json");
    expect(result).not.toContain("touch /tmp/x/");
  });

  it("does not count a checkpoint that does not apply as failing", () => {
    const result = strip(formatFailingResult(filterFailing(legacyScan)));
    expect(result).not.toContain("OAuth Discovery");
  });

  it("shows the server status of a training exposure check", () => {
    const result = strip(formatCheckpointResult("example.com", findCheckpoint(legacyScan, "te.3")!));
    expect(result).toContain("not_found  training exposure, not scored");
  });

  it("marks a checkpoint that does not apply", () => {
    const result = strip(formatCheckpointResult("example.com", findCheckpoint(legacyScan, "5.12")!));
    expect(result).toContain("fail  0/0  not applicable");
  });

  it("shows no fix steps for a passing checkpoint in verbose mode", () => {
    const result = strip(formatScanResult(contractScan, true));
    expect(result).not.toContain("WebMCP tools found\n      Fix");
  });
});

describe("formatCheckpointList", () => {
  const result = strip(formatCheckpointList(listFixture as unknown as CheckpointList));

  it("lists the stable id, legacy id, stage, strength and name", () => {
    expect(result).toMatch(/ia\.robots-txt\s+1\.1\s+FIND\s+MUST\s+robots\.txt/);
    expect(result).toMatch(/ia\.a2a-agent-card\s+4\.3\s+ACT\s+MAY\s+A2A Agent Card/);
  });

  it("shows the count, the methodology version and a hint", () => {
    expect(result).toContain("2 checkpoints");
    expect(result).toContain("methodology 2026-09-02");
    expect(result).toContain("isagentready explain <id>");
  });

  it("shows a message for an empty list", () => {
    expect(strip(formatCheckpointList({ checkpoints: [] }))).toContain("No checkpoints match the filters.");
  });
});

describe("formatCheckpointDefinition", () => {
  const result = strip(formatCheckpointDefinition(definition));

  it("shows the ids and the spec values", () => {
    expect(result).toContain("A2A Agent Card");
    expect(result).toContain("ia.a2a-agent-card (legacy 4.3)");
    expect(result).toContain("ACT · MAY · recommendation");
    expect(result).toContain("AR-READ-06 (partial)");
  });

  it("shows why, the fix steps and the verify command", () => {
    expect(result).toContain("Agents use the agent card");
    expect(result).toContain("1. Create the agent card JSON file.");
    expect(result).toContain("2. Serve the file with Content-Type application/json.");
    expect(result).toContain("curl -sf https://{domain}/.well-known/agent-card.json");
    expect(result).toContain("Expect: exit code 0");
  });

  it("shows the fail rate with the benchmark version", () => {
    expect(result).toContain("94% of 4210 scanned sites fail this (benchmark 2026-q3)");
  });

  it("shows the detail page", () => {
    expect(result).toContain("https://isagentready.com/en/methodology/checkpoints/ia.a2a-agent-card");
  });

  it("works without the optional fields", () => {
    const minimal = { ...definition, fix: undefined, verify: undefined, aggregate: null, why: undefined };
    const text = strip(formatCheckpointDefinition(minimal));
    expect(text).toContain("A2A Agent Card");
    expect(text).not.toContain("scanned sites");
  });

  it("marks a retired checkpoint", () => {
    const retired = {
      ...definition,
      lifecycle: { introduced: "2026-08-24", revised: [], retired: "2026-11-02", replaced_by: "ia.new" },
    };
    expect(strip(formatCheckpointDefinition(retired))).toContain("Retired 2026-11-02. Replaced by ia.new.");
  });
});

describe("formatMethodology", () => {
  const result = strip(formatMethodology(methodologyFixture as unknown as MethodologyDocument));

  it("shows the version and the spec alignment", () => {
    expect(result).toContain("Methodology 2026-11-02");
    expect(result).toContain("agentready.org spec 2.0");
  });

  it("shows the stages and the latest change", () => {
    expect(result).toContain("Find");
    expect(result).toContain("Act");
    expect(result).toContain("2026-11-02  Adds seven checks.");
  });

  it("points to the deeper commands", () => {
    expect(result).toContain("isagentready methodology --changelog");
    expect(result).toContain("isagentready checkpoints");
  });
});

describe("formatChangelog", () => {
  it("lists each version with its changes", () => {
    const result = strip(formatChangelog(changelogFixture as unknown as ChangelogDocument));
    expect(result).toContain("2026-11-02  Adds seven checks.");
    expect(result).toContain("Introduced: ia.mcp-apps, ia.nlweb");
    expect(result).toContain("Revised: ia.a2a-agent-card");
  });
});

describe("formatScoring", () => {
  it("lists the category weights and grade bands", () => {
    const result = strip(formatScoring(scoringFixture as unknown as ScoringDocument));
    expect(result).toContain("Scoring 2026-11-02");
    expect(result).toContain("Agent Protocols");
    expect(result).toContain("15%");
    expect(result).toContain("A+  95-100");
  });
});

describe("formatFailingResult", () => {
  it("lists the failing checkpoints with the failure message", () => {
    const result = strip(formatFailingResult(filterFailing(contractScan)));
    expect(result).toContain("2 failing checkpoints");
    expect(result).toContain("A2A Agent Card  ia.a2a-agent-card · ACT · MAY");
    expect(result).toContain("No agent card found at /.well-known/agent-card.json (HTTP 404).");
    expect(result).not.toContain("WebMCP");
    expect(result).not.toContain("curl");
  });

  it("adds fix steps and verify in verbose mode", () => {
    const result = strip(formatFailingResult(filterFailing(contractScan), true));
    expect(result).toContain("1. Create the agent card JSON file.");
    expect(result).toContain("curl -sf https://example.com/.well-known/agent-card.json");
  });

  it("works with the current payload", () => {
    const result = strip(formatFailingResult(filterFailing(legacyScan)));
    expect(result).toContain("A2A Agent Card  4.3");
    expect(result).toContain("No agent card found");
  });

  it("shows a message when nothing fails", () => {
    const result = strip(formatFailingResult({ ...contractScan, categories: [] }));
    expect(result).toContain("No failing checkpoints.");
  });
});

describe("formatCheckpointResult", () => {
  const cp = findCheckpoint(contractScan, "4.3") as Checkpoint;

  it("shows the status, failure and fail rate", () => {
    const result = strip(formatCheckpointResult("example.com", cp));
    expect(result).toContain("A2A Agent Card");
    expect(result).toContain("ia.a2a-agent-card · ACT · MAY");
    expect(result).toContain("fail  0/10");
    expect(result).toContain("Expected: JSON document with name, description, url, capabilities");
    expect(result).toContain("94% of 4210 scanned sites fail this");
    expect(result).toContain("isagentready explain ia.a2a-agent-card");
    expect(result).not.toContain("curl");
  });

  it("adds fix steps and verify in verbose mode", () => {
    const result = strip(formatCheckpointResult("example.com", cp, true));
    expect(result).toContain("2. Serve the file with Content-Type application/json.");
    expect(result).toContain("curl -sf https://example.com/.well-known/agent-card.json");
  });
});

describe("formatVerifyReport", () => {
  const report: VerifyReport = {
    domain: "example.com",
    checkpoint_id: "ia.a2a-agent-card",
    legacy_id: "4.3",
    name: "A2A Agent Card",
    status: "fail",
    passed: false,
    failure: { reason_code: "agent_card_missing", message: "No agent card found.", observed: {}, expected: null },
    details: "Legacy details",
    verify_source: "scan",
    verify: {
      command: "curl -sf https://example.com/.well-known/agent-card.json",
      expect: "exit code 0",
      rescan: "isagentready results example.com --checkpoint ia.a2a-agent-card",
    },
    command_executed: false,
    completed_at: "2026-10-20T10:30:00Z",
    methodology_version: "2026-09-02",
    exposure_status: null,
    outcome: "fail",
  };

  it("shows the status and prints the command without a claim that it ran", () => {
    const result = strip(formatVerifyReport(report));
    expect(result).toContain("A2A Agent Card  ia.a2a-agent-card");
    expect(result).toContain("No agent card found.");
    expect(result).toContain("Run this read-only check yourself. isagentready does not run it.");
    expect(result).toContain("curl -sf https://example.com/.well-known/agent-card.json");
    expect(result).toContain("Expect: exit code 0");
    expect(result).toContain("Scan from 2026-10-20T10:30:00Z");
  });

  it("shows the details when the server sends no failure", () => {
    expect(strip(formatVerifyReport({ ...report, failure: null }))).toContain("Legacy details");
  });

  it("says when the server has no verify data yet", () => {
    const result = strip(
      formatVerifyReport({ ...report, verify_source: null, verify: { ...report.verify, command: null } })
    );
    expect(result).toContain("The server sends no verify command for this checkpoint yet.");
    expect(result).not.toContain("No shell check exists");
  });

  it("adds no outcome note for a fail", () => {
    expect(strip(formatVerifyReport(report))).not.toContain("Nothing to fix");
  });

  it("says that a checkpoint that does not apply needs no fix", () => {
    const result = strip(formatVerifyReport({ ...report, outcome: "not_applicable" }));
    expect(result).toContain("This checkpoint does not apply to this site. Nothing to fix.");
    expect(result).not.toContain("✗");
  });

  it("says that a skipped checkpoint needs no fix now", () => {
    const result = strip(formatVerifyReport({ ...report, status: "skip", outcome: "skipped" }));
    expect(result).toContain("The scan did not run this checkpoint. Nothing to fix now.");
  });

  it("shows the server status of a training exposure check", () => {
    const result = strip(
      formatVerifyReport({ ...report, status: "skip", exposure_status: "not_found", outcome: "informational" })
    );
    expect(result).toContain("not_found on example.com");
    expect(result).toContain("Training exposure check. It has no score. Nothing to fix.");
  });

  it("explains when no shell check exists", () => {
    const result = strip(formatVerifyReport({ ...report, verify: { ...report.verify, command: null } }));
    expect(result).toContain("No shell check exists for this checkpoint.");
    expect(result).toContain("isagentready results example.com --checkpoint ia.a2a-agent-card");
  });
});

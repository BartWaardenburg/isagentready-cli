import { describe, it, expect } from "vitest";
import {
  formatScanResult,
  formatRankings,
  scoreColor,
  gradeBg,
  statusIcon,
  truncate,
} from "./format.js";
import type { ScanResult, RankingsResponse } from "./api.js";

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

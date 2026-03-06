import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getScanResults, startScan, getRankings, pollUntilComplete, ApiError } from "./api.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const completedScan = {
  id: "abc-123",
  domain: "example.com",
  status: "completed",
  overall_score: 72,
  letter_grade: "B",
  scan_duration_ms: 18500,
  completed_at: "2025-01-15T10:30:00Z",
  categories: [],
};

const pendingScan = {
  id: "def-456",
  domain: "example.com",
  status: "pending",
  message: "Scan is pending",
};

const enqueuedScan = {
  id: "ghi-789",
  domain: "example.com",
  status: "pending",
  poll_url: "/api/v1/scan/example.com",
  message: "Scan enqueued",
};

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getScanResults", () => {
  it("fetches scan results for a domain", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedScan));

    const result = await getScanResults("example.com");

    expect(result).toEqual(completedScan);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/api/v1/scan/example.com");
  });

  it("sends correct headers", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedScan));

    await getScanResults("example.com");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["User-Agent"]).toBe("isagentready-cli");
  });

  it("URL-encodes domain", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedScan));

    await getScanResults("ex ample.com");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("ex%20ample.com");
  });

  it("throws ApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "not_found", message: "No scan found" }, 404)
    );

    await expect(getScanResults("unknown.com")).rejects.toThrow(ApiError);
  });

  it("throws ApiError on 500", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Server error" }, 500)
    );

    try {
      await getScanResults("example.com");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
    }
  });

  it("handles non-JSON error responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    try {
      await getScanResults("example.com");
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe("HTTP 500");
    }
  });
});

describe("startScan", () => {
  it("sends POST with url in body", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(enqueuedScan, 202));

    await startScan("https://example.com");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/api/v1/scan");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com" });
  });

  it("returns enqueued scan on 202", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(enqueuedScan, 202));

    const result = await startScan("https://example.com");

    expect(result.status).toBe("pending");
    expect(result.domain).toBe("example.com");
  });

  it("returns cached scan on cooldown", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedScan));

    const result = await startScan("https://example.com");

    expect(result.status).toBe("completed");
  });

  it("throws on 422 invalid URL", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "validation_error", message: "Invalid URL" }, 422)
    );

    await expect(startScan("not-a-url")).rejects.toThrow(ApiError);
  });
});

describe("getRankings", () => {
  const rankingsResponse = {
    entries: [completedScan],
    total: 1,
    page: 1,
    per_page: 25,
    total_pages: 1,
  };

  it("fetches rankings with default params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(rankingsResponse));

    const result = await getRankings();

    expect(result.entries).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/api/v1/rankings");
  });

  it("builds query params correctly", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(rankingsResponse));

    await getRankings({
      page: 2,
      per_page: 10,
      grade_range: "high",
      search: "example",
      sort: "score_asc",
    });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("page=2");
    expect(url).toContain("per_page=10");
    expect(url).toContain("grade_range=high");
    expect(url).toContain("search=example");
    expect(url).toContain("sort=score_asc");
  });

  it("omits empty params", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(rankingsResponse));

    await getRankings({ page: 1 });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("page=1");
    expect(url).not.toContain("grade_range");
    expect(url).not.toContain("search");
  });
});

describe("pollUntilComplete", () => {
  it("returns immediately when scan is completed", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(completedScan));

    const result = await pollUntilComplete("example.com");

    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("polls until completed", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(pendingScan))
      .mockResolvedValueOnce(jsonResponse(completedScan));

    const onProgress = vi.fn();
    const result = await pollUntilComplete("example.com", onProgress);

    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith("pending");
  });

  it("throws on scan failure", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ...pendingScan, status: "failed" })
    );

    await expect(pollUntilComplete("example.com")).rejects.toThrow("Scan failed");
  });
});

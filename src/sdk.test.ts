import { describe, expect, it, vi } from "vitest";
import { createClient } from "./sdk.js";
import methodology from "./fixtures/methodology.json" with { type: "json" };

const json = (value: unknown, status = 200, headers: HeadersInit = {}): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("SDK clients", () => {
  it("returns methodology data using each client's own transport and origin", async () => {
    const firstFetch = vi.fn(async (): Promise<Response> => json(methodology));
    const secondFetch = vi.fn(async (): Promise<Response> =>
      json({ ...methodology, version: "2026-10-30" }),
    );
    const first = createClient({ baseUrl: "https://first.example/", fetch: firstFetch });
    const second = createClient({ baseUrl: "https://second.example", fetch: secondFetch });

    expect(await first.getMethodology()).toEqual({ ok: true, data: methodology });
    expect(await second.getMethodology()).toEqual({
      ok: true,
      data: { ...methodology, version: "2026-10-30" },
    });
    expect(String(firstFetch.mock.calls[0]?.[0])).toBe("https://first.example/api/v2/methodology");
    expect(String(secondFetch.mock.calls[0]?.[0])).toBe(
      "https://second.example/api/v2/methodology",
    );
  });
});

it("reads checkpoint, catalog, scoring, rankings and a cached report through the SDK", async () => {
  const definition = (
    await import("./fixtures/checkpoint-definition.json", { with: { type: "json" } })
  ).default;
  const report = {
    id: "scan-1",
    domain: "example.com",
    status: "completed",
    overall_score: 72,
    letter_grade: "B",
    categories: [],
  };
  const responses = [
    definition,
    { checkpoints: [definition] },
    { changelog: [{ version: "2026-10-30" }] },
    { version: "2026-10-30", grade_bands: [] },
    { entries: [report], total: 1, page: 1, per_page: 25, total_pages: 1 },
    report,
  ];
  const transport = vi.fn(async (): Promise<Response> => json(responses.shift()));
  const client = createClient({ fetch: transport });

  expect(await client.getCheckpoint("ia.a2a-agent-card")).toEqual({ ok: true, data: definition });
  expect(await client.listCheckpoints({ stage: "act" })).toEqual({
    ok: true,
    data: { checkpoints: [definition] },
  });
  expect(await client.getMethodologyChangelog()).toEqual({
    ok: true,
    data: { changelog: [{ version: "2026-10-30" }] },
  });
  expect(await client.getMethodologyScoring("2026-10-30")).toEqual({
    ok: true,
    data: { version: "2026-10-30", grade_bands: [] },
  });
  const rankings = await client.getRankings({ page: 1 });
  expect(rankings.ok && rankings.data.entries[0]?.domain).toBe("example.com");
  expect(await client.getScanResults("example.com", { contract: true })).toEqual({
    ok: true,
    data: report,
  });
  expect(transport.mock.calls.map((call) => String(call[0]))).toEqual([
    "https://isagentready.com/api/v2/checkpoints/ia.a2a-agent-card",
    "https://isagentready.com/api/v2/checkpoints?stage=act",
    "https://isagentready.com/api/v2/methodology/changelog",
    "https://isagentready.com/api/v2/methodology/2026-10-30/scoring",
    "https://isagentready.com/api/v1/rankings?page=1",
    "https://isagentready.com/api/v1/scan/example.com?include=contract",
  ]);
});

it("starts a scan and polls with the server wait hints without running commands", async () => {
  const pending = { id: "scan-2", domain: "example.com", status: "pending", retry_after: 2 };
  const running = { ...pending, status: "running", retry_after: 7 };
  const completed = { ...pending, status: "completed", overall_score: 72, letter_grade: "B" };
  const responses = [pending, running, completed];
  const transport = vi.fn(async (): Promise<Response> => json(responses.shift()));
  const client = createClient({ fetch: transport });
  const sleep = vi.fn(async (_milliseconds: number): Promise<void> => {});
  const progress = vi.fn();

  expect(await client.startScan("https://example.com/docs")).toEqual({ ok: true, data: pending });
  expect(
    await client.pollUntilComplete("example.com", progress, { firstWaitSeconds: 2, sleep }),
  ).toEqual({ ok: true, data: completed });
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 7000]);
  expect(progress.mock.calls).toEqual([["running"]]);
  expect(transport.mock.calls[0]?.[1]?.method).toBe("POST");
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
    url: "https://example.com/docs",
  });
});

it("uses a valid body retry hint when the 429 has no Retry-After header", async () => {
  const transport = vi.fn(async (): Promise<Response> =>
    json({ error: "limited", retry_after: 9 }, 429),
  );
  const result = await createClient({ fetch: transport }).getMethodology();
  expect(result).toEqual({
    ok: false,
    error: {
      kind: "http",
      message: "Rate limit exceeded. Retry after 9 seconds.",
      status: 429,
      retryAfter: 9,
    },
  });
});

it("rejects an unrecognized catalog body instead of inventing an empty result", async () => {
  const invalid = createClient({
    fetch: async (): Promise<Response> => json({ message: "not a catalog" }),
  });
  expect(await invalid.listCheckpoints()).toMatchObject({
    ok: false,
    error: { kind: "invalid_response" },
  });
  const empty = createClient({ fetch: async (): Promise<Response> => json({ checkpoints: [] }) });
  expect(await empty.listCheckpoints()).toEqual({ ok: true, data: { checkpoints: [] } });
});

it("rejects malformed domain inputs before fetch and still permits a valid cached read", async () => {
  const report = {
    id: "scan-1",
    domain: "example.com",
    status: "completed",
    overall_score: null,
    letter_grade: null,
    categories: [],
  };
  const transport = vi.fn(async (): Promise<Response> => json(report));
  const client = createClient({ fetch: transport });
  expect(await client.getScanResults("example.com?secret=value")).toMatchObject({
    ok: false,
    error: { kind: "invalid_input" },
  });
  expect(transport).not.toHaveBeenCalled();
  expect(await client.getScanResults("example.com")).toEqual({ ok: true, data: report });
});

it("returns structured HTTP, JSON and transport errors without throwing", async () => {
  const unauthorized = createClient({
    fetch: async (): Promise<Response> => json({ detail: "Not authorized" }, 401),
  });
  expect(await unauthorized.getMethodology()).toEqual({
    ok: false,
    error: { kind: "http", message: "Not authorized", status: 401, retryAfter: null },
  });
  const invalidJson = createClient({
    fetch: async (): Promise<Response> => new Response("not json"),
  });
  expect(await invalidJson.getMethodology()).toMatchObject({
    ok: false,
    error: { kind: "invalid_response" },
  });
  const offline = createClient({
    fetch: async (): Promise<Response> => {
      throw new Error("offline");
    },
  });
  expect(await offline.getMethodology()).toEqual({
    ok: false,
    error: { kind: "network", message: "offline", status: null, retryAfter: null },
  });
  const wrongShape = createClient({ fetch: async (): Promise<Response> => json([]) });
  expect(await wrongShape.getMethodology()).toMatchObject({
    ok: false,
    error: { kind: "invalid_response" },
  });
});

it("rejects unsafe client origins without exposing embedded credentials", async () => {
  const transport = vi.fn(async (): Promise<Response> => json(methodology));
  const client = createClient({ baseUrl: "https://user:secret@example.com", fetch: transport });
  const result = await client.getMethodology();
  expect(result).toMatchObject({ ok: false, error: { kind: "invalid_input" } });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(transport).not.toHaveBeenCalled();
  expect(await createClient({ fetch: transport }).getMethodology()).toEqual({
    ok: true,
    data: methodology,
  });
});

it("exposes an HTTP-date retry wait and rejects malformed retry hints", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T13:30:00Z"));
  try {
    const dated = createClient({
      fetch: async (): Promise<Response> =>
        json({ error: "limited" }, 429, { "retry-after": "Fri, 30 Oct 2026 13:30:12 GMT" }),
    });
    expect(await dated.getMethodology()).toMatchObject({
      ok: false,
      error: { status: 429, retryAfter: 12 },
    });
    for (const header of ["-1", "Invalid Date"]) {
      const malformed = createClient({
        fetch: async (): Promise<Response> =>
          json({ error: "limited", retry_after: -3 }, 429, { "retry-after": header }),
      });
      expect(await malformed.getMethodology()).toMatchObject({
        ok: false,
        error: { status: 429, retryAfter: null },
      });
    }
  } finally {
    vi.useRealTimers();
  }
});

it("validates every poll response before reporting progress or waiting", async () => {
  const completed = { id: "scan-4", domain: "example.com", status: "completed" };

  for (const malformed of [
    {},
    { ...completed, status: "mystery" },
    { ...completed, status: "running", retry_after: "soon" },
    { ...completed, status: "running", retry_after: -1 },
  ]) {
    const responses = [malformed, completed];
    const client = createClient({ fetch: async (): Promise<Response> => json(responses.shift()) });
    const progress = vi.fn();
    const sleep = vi.fn(async (): Promise<void> => {});

    expect(await client.pollUntilComplete("example.com", progress, { sleep })).toMatchObject({
      ok: false,
      error: { kind: "invalid_response" },
    });
    expect(progress).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  }

  const responses = [{ ...completed, status: "running", retry_after: 2 }, completed];
  const client = createClient({ fetch: async (): Promise<Response> => json(responses.shift()) });
  const progress = vi.fn();
  const sleep = vi.fn(async (_milliseconds: number): Promise<void> => {});

  expect(await client.pollUntilComplete("example.com", progress, { sleep })).toEqual({
    ok: true,
    data: completed,
  });
  expect(progress.mock.calls).toEqual([["running"]]);
  expect(sleep.mock.calls).toEqual([[2000]]);
});

it("bounds stalled poll requests and response decoding by the polling deadline", async () => {
  for (const stalled of ["request", "body"]) {
    vi.useFakeTimers();
    try {
      const signals: Array<AbortSignal | null> = [];
      const transport: typeof fetch = async (_input, init): Promise<Response> => {
        signals.push(init?.signal ?? null);
        if (stalled === "request") return new Promise<Response>(() => {});

        const response = json({ id: "scan-6", domain: "example.com", status: "running" });
        vi.spyOn(response, "json").mockReturnValue(new Promise<unknown>(() => {}));
        return response;
      };
      const client = createClient({ fetch: transport });
      let outcome: Awaited<ReturnType<typeof client.pollUntilComplete>> | null = null;
      void client.pollUntilComplete("example.com").then((result) => {
        outcome = result;
      });

      await vi.advanceTimersByTimeAsync(299_999);
      expect(outcome).toBeNull();
      await vi.advanceTimersByTimeAsync(2);
      expect(outcome).toMatchObject({
        ok: false,
        error: { kind: "operation", message: expect.stringContaining("timed out") },
      });
      expect(signals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }
});

it("preserves canceled reports and treats cancellation as a terminal operation", async () => {
  const canceled = { id: "scan-5", domain: "example.com", status: "canceled" };
  const client = createClient({ fetch: async (): Promise<Response> => json(canceled) });

  expect(await client.getScanResults("example.com")).toEqual({ ok: true, data: canceled });
  expect(await client.pollUntilComplete("example.com")).toMatchObject({
    ok: false,
    error: { kind: "operation" },
  });
});

it("distinguishes a failed scan from a network failure", async () => {
  const failed = createClient({
    fetch: async (): Promise<Response> =>
      json({ id: "scan-3", domain: "example.com", status: "failed" }),
  });
  expect(await failed.pollUntilComplete("example.com")).toEqual({
    ok: false,
    error: {
      kind: "operation",
      message: "Scan failed for example.com",
      status: null,
      retryAfter: null,
    },
  });
});

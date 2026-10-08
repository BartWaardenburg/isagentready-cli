const BASE_URL = "https://isagentready.com";

export interface Checkpoint {
  id: string;
  name: string;
  status: "pass" | "partial" | "fail" | "skip";
  score: number;
  max_score: number;
  details: string;
  recommendation?: string;
  why?: string;
  code_example?: string;
}

export interface Category {
  category: string;
  label: string;
  score: number;
  max_score: number;
  weight: number;
  checkpoints: Checkpoint[];
}

export interface ScanResult {
  id: string;
  domain: string;
  status: "pending" | "running" | "completed" | "failed";
  overall_score?: number;
  letter_grade?: string;
  scan_duration_ms?: number;
  completed_at?: string;
  categories?: Category[];
  message?: string;
  poll_url?: string;
  /** Seconds the server asks a client to wait before the next poll. */
  retry_after?: number;
}

export interface RankingsResponse {
  entries: ScanResult[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface RankingsOptions {
  page?: number;
  per_page?: number;
  grade_range?: "high" | "mid" | "low";
  search?: string;
  sort?: "score_desc" | "score_asc" | "domain" | "newest";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Seconds to wait before a retry, from Retry-After on a 429. */
    public readonly retryAfter: number | null = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const HTTP_TOO_MANY_REQUESTS = 429;

const parseRetryAfter = (response: Response, body: { retry_after?: unknown } | null): number | null => {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isInteger(header) && header >= 0) return header;
  return typeof body?.retry_after === "number" ? body.retry_after : null;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "isagentready-cli",
      ...options?.headers,
    },
  });

  if (!response.ok && response.status !== 202) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      retry_after?: unknown;
    } | null;
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;

    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      const retryAfter = parseRetryAfter(response, body);
      const wait = retryAfter === null ? "" : ` Retry after ${retryAfter} seconds.`;
      throw new ApiError(`Rate limit exceeded.${wait}`, response.status, retryAfter);
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
};

export const getScanResults = (domain: string): Promise<ScanResult> =>
  request<ScanResult>(`/api/v1/scan/${encodeURIComponent(domain)}`);

export const startScan = (url: string): Promise<ScanResult> =>
  request<ScanResult>("/api/v1/scan", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

export const getRankings = (options: RankingsOptions = {}): Promise<RankingsResponse> => {
  const params = new URLSearchParams();
  if (options.page) params.set("page", String(options.page));
  if (options.per_page) params.set("per_page", String(options.per_page));
  if (options.grade_range) params.set("grade_range", options.grade_range);
  if (options.search) params.set("search", options.search);
  if (options.sort) params.set("sort", options.sort);

  const query = params.toString();
  return request<RankingsResponse>(`/api/v1/rankings${query ? `?${query}` : ""}`);
};

/** Poll wait when the server sends no hint. Each poll uses API quota. */
const DEFAULT_POLL_SECONDS = 5;
const MAX_POLL_SECONDS = 60;
const POLL_DEADLINE_MS = 5 * 60 * 1000;

export interface PollOptions {
  /** Replaces the real wait, for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Seconds to wait before the first poll, from the scan start response. */
  firstWaitSeconds?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const pollWaitMs = (seconds: number | undefined): number =>
  Math.min(Math.max(seconds ?? DEFAULT_POLL_SECONDS, 1), MAX_POLL_SECONDS) * 1000;

/**
 * Polls the scan result until it completes. Waits the Retry-After seconds that
 * the server sends between polls and after a 429, so one scan does not use up
 * the hourly API quota.
 */
export const pollUntilComplete = async (
  domain: string,
  onProgress?: (status: string) => void,
  options: PollOptions = {}
): Promise<ScanResult> => {
  const sleep = options.sleep ?? realSleep;
  const deadline = Date.now() + POLL_DEADLINE_MS;

  if (options.firstWaitSeconds !== undefined) await sleep(pollWaitMs(options.firstWaitSeconds));

  while (Date.now() < deadline) {
    let waitMs: number;

    try {
      const result = await getScanResults(domain);

      if (result.status === "completed") return result;
      if (result.status === "failed") throw new Error(`Scan failed for ${domain}`);

      onProgress?.(result.status);
      waitMs = pollWaitMs(result.retry_after);
    } catch (err) {
      const limited = err instanceof ApiError && err.status === HTTP_TOO_MANY_REQUESTS;
      const retryMs = limited && err.retryAfter !== null ? err.retryAfter * 1000 : null;
      if (retryMs === null || Date.now() + retryMs >= deadline) throw err;
      waitMs = retryMs;
    }

    await sleep(waitMs);
  }

  throw new Error(`Scan timed out after ${POLL_DEADLINE_MS / 1000}s`);
};

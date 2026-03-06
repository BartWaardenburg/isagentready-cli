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
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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
    } | null;
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;
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

export const pollUntilComplete = async (
  domain: string,
  onProgress?: (status: string) => void
): Promise<ScanResult> => {
  const maxAttempts = 60;
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    const result = await getScanResults(domain);

    if (result.status === "completed") return result;
    if (result.status === "failed") throw new Error(`Scan failed for ${domain}`);

    onProgress?.(result.status);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Scan timed out after ${(maxAttempts * interval) / 1000}s`);
};

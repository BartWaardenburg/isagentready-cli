const BASE_URL = "https://isagentready.com";

/** Agent readiness stage from the agentready.org spec. */
export type Stage = "find" | "read" | "act";

/** Spec strength. `null` marks an informational checkpoint. */
export type Strength = "MUST" | "SHOULD" | "MAY" | null;

export type EvidenceType = "measured_study" | "scanner_data" | "recommendation";

export type ArMapping = "full" | "partial" | "none";

export type CheckpointStatus = "pass" | "partial" | "fail" | "skip";

export interface Reference {
  title: string;
  url: string;
  kind?: "spec" | "study" | "guide";
}

export interface FixStep {
  order: number;
  action: string;
  code_example: string | null;
  language: string | null;
}

export interface Fix {
  summary: string;
  steps: FixStep[];
  skill?: { name: string; anchor: string } | null;
}

/**
 * A read-only check that the user can run. The CLI prints the command and
 * never runs it. `command` is null when no shell check is possible.
 */
export interface Verify {
  command: string | null;
  expect: string | null;
  rescan: string;
}

export interface Lifecycle {
  introduced: string;
  revised: string[];
  retired: string | null;
  replaced_by: string | null;
}

/** Aggregate result rates from the latest published benchmark snapshot. */
export interface Aggregate {
  benchmark_version: string;
  denominator: number;
  rates: { pass: number; partial: number; fail: number; skip: number };
  source_url: string;
}

export interface Failure {
  reason_code: string;
  message: string;
  observed: Record<string, unknown>;
  expected: string | null;
}

export interface ScoreImpact {
  score_before: number;
  score_after: number;
  score_delta: number;
  exact_score_delta: number;
}

/** Checkpoint definition from the shared contract. `id` is the stable id. */
export interface CheckpointDefinition {
  id: string;
  legacy_id: string;
  ar_practice_ids: string[];
  ar_mapping: ArMapping;
  name: string;
  category: string;
  stage: Stage;
  strength: Strength;
  evidence_type: EvidenceType;
  evidence_source?: { title: string; url: string } | null;
  evidence_tier?: string;
  score_role?: string;
  maturity?: string;
  profiles?: string[];
  applicability?: { mode: string; surfaces: string[]; condition: string | null };
  why?: string;
  references?: Reference[];
  fix?: Fix;
  verify?: Verify;
  lifecycle?: Lifecycle;
  methodology_version: string;
  detail_url: string;
  aggregate?: Aggregate | null;
}

/**
 * Checkpoint in a scan result. The v1 payload keeps the legacy id in `id`.
 * The contract fields are present only when the server sends them.
 */
export interface Checkpoint
  extends Partial<Omit<CheckpointDefinition, "id" | "name" | "why" | "references">> {
  id: string;
  /** Stable id (`ia.<slug>`) when `id` holds the legacy id. */
  stable_id?: string;
  name: string;
  status: CheckpointStatus;
  score: number;
  max_score: number;
  details: string;
  recommendation?: string | null;
  why?: string;
  code_example?: string;
  references?: Reference[];
  applicable?: boolean;
  failure?: Failure | null;
  score_impact?: ScoreImpact | null;
  priority?: string | null;
}

/** Checkpoint result with the full contract fields. */
export type CheckpointResult = Checkpoint & Partial<CheckpointDefinition>;

export interface Category {
  category: string;
  label: string;
  score: number;
  max_score: number;
  weight: number;
  checkpoints: Checkpoint[];
}

export interface Issue {
  id: string;
  stable_id?: string;
  name: string;
  priority?: string;
  status: CheckpointStatus;
  category?: string;
  stage?: Stage;
  strength?: Strength;
  evidence?: string;
  recommendation?: string | null;
  references?: Reference[];
  score_role?: string;
  maturity?: string;
  potential_gain?: number;
  score_impact?: ScoreImpact | null;
}

export interface ProfileResult {
  applicable: boolean;
  completeness?: string;
  grade: string | null;
  score: number | null;
}

export interface ScoreContext {
  scope?: string;
  methodology_version?: string;
  completeness?: string;
  detected_surfaces?: string[];
  measured_coverage?: { applicable_points: number; earned_points: number };
  outcome_validation?: string;
}

export interface StageSummaryEntry {
  stage: Stage;
  name?: string;
  passed?: number;
  total?: number;
}

export interface SpecAlignment {
  agentready_spec: string;
  url: string;
  license?: string;
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
  issues?: Issue[];
  profiles?: Record<string, ProfileResult>;
  methodology_version?: string;
  score_context?: ScoreContext;
  stage_summary?: StageSummaryEntry[];
  spec_alignment?: SpecAlignment;
}

export interface ArPractice {
  id: string;
  name: string;
  stage: Stage;
  strength: Strength;
  evidence: string;
  checkpoint_ids: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  summary: string;
  introduced: string[];
  revised: string[];
  retired: string[];
}

export interface MethodologyDocument {
  version: string;
  supported_versions: string[];
  spec_alignment: SpecAlignment;
  stages: Array<{ id: Stage; name: string; summary: string }>;
  strength_rule: string;
  evidence_types: EvidenceType[];
  ar_practices: ArPractice[];
  changelog: ChangelogEntry[];
  scoring?: { href: string };
  checkpoints: CheckpointDefinition[];
}

/** Scoring weights. The methodology spec document holds none of these values. */
export interface ScoringDocument {
  version: string;
  categories?: Array<{ category: string; label?: string; weight: number }>;
  checkpoints?: Array<{ id: string; legacy_id?: string; max_score: number; score_role?: string }>;
  grade_bands?: Array<{ grade: string; min: number; max: number }>;
}

export interface CheckpointList {
  checkpoints: CheckpointDefinition[];
  total?: number;
  methodology_version?: string;
}

export interface ChangelogDocument {
  changelog: ChangelogEntry[];
}

export interface CheckpointFilters {
  stage?: string;
  strength?: string;
  category?: string;
  ar?: string;
}

export interface ScanResultOptions {
  /** Ask the server for the failing checkpoints only. */
  failing?: boolean;
  /** Ask the server for the full checkpoint contract fields. */
  contract?: boolean;
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
      detail?: string;
      title?: string;
      retry_after?: unknown;
    } | null;
    const message = body?.message ?? body?.detail ?? body?.error ?? body?.title ?? `HTTP ${response.status}`;

    if (response.status === HTTP_TOO_MANY_REQUESTS) {
      const retryAfter = parseRetryAfter(response, body);
      const wait = retryAfter === null ? "" : ` Retry after ${retryAfter} seconds.`;
      throw new ApiError(`Rate limit exceeded.${wait}`, response.status, retryAfter);
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
};

const queryString = (params: URLSearchParams): string => {
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const getScanResults = (domain: string, options: ScanResultOptions = {}): Promise<ScanResult> => {
  const params = new URLSearchParams();
  if (options.failing) params.set("checkpoints", "failing");
  if (options.contract) params.set("include", "contract");
  return request<ScanResult>(`/api/v1/scan/${encodeURIComponent(domain)}${queryString(params)}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Accepts a bare array or an object that holds the array under `key`. */
const unwrapList = (body: unknown, key: string): Record<string, unknown> => {
  if (Array.isArray(body)) return { [key]: body };
  if (isRecord(body) && Array.isArray(body[key])) return body;
  return { ...(isRecord(body) ? body : {}), [key]: [] };
};

/** Accepts a bare object or an object that holds it under `key`. */
const unwrapItem = <T>(body: unknown, key: string): T =>
  (isRecord(body) && isRecord(body[key]) ? body[key] : body) as T;

const CHECKPOINT_FILTER_KEYS = ["stage", "strength", "category", "ar"] as const;

/** Lists checkpoint definitions. The server filters on stage, strength, category and AR practice. */
export const listCheckpoints = async (filters: CheckpointFilters = {}): Promise<CheckpointList> => {
  const params = new URLSearchParams();
  for (const key of CHECKPOINT_FILTER_KEYS) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  const body = await request<unknown>(`/api/v2/checkpoints${queryString(params)}`);
  return unwrapList(body, "checkpoints") as unknown as CheckpointList;
};

/** Gets one checkpoint definition. The server accepts the stable id and the legacy id. */
export const getCheckpoint = async (id: string): Promise<CheckpointDefinition> =>
  unwrapItem<CheckpointDefinition>(
    await request<unknown>(`/api/v2/checkpoints/${encodeURIComponent(id)}`),
    "checkpoint"
  );

/** Gets the current methodology, or one version of it. */
export const getMethodology = (version?: string): Promise<MethodologyDocument> =>
  request<MethodologyDocument>(
    version ? `/api/v2/methodology/${encodeURIComponent(version)}` : "/api/v2/methodology"
  );

export const getMethodologyChangelog = async (): Promise<ChangelogDocument> =>
  unwrapList(await request<unknown>("/api/v2/methodology/changelog"), "changelog") as unknown as ChangelogDocument;

/** Gets the scoring weights of one methodology version. */
export const getMethodologyScoring = (version: string): Promise<ScoringDocument> =>
  request<ScoringDocument>(`/api/v2/methodology/${encodeURIComponent(version)}/scoring`);

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

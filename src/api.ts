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
  /** Whether the legacy strength follows AgentReady or an independent scoring policy. */
  strength_source?: "agentready" | "isagentready_policy" | "information" | null;
  /** Normative strengths per mapped AgentReady practice, separate from scoring policy. */
  ar_strengths?: Record<string, Strength>;
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
  /**
   * Set by the CLI for a training exposure check. These checks have no score,
   * so `status` is "skip" and this field holds the server status (for example not_found).
   */
  exposure_status?: string;
}

/** Checkpoint result with the full contract fields. */
export type CheckpointResult = Checkpoint & Partial<CheckpointDefinition>;

export interface Category {
  category: string;
  label: string;
  score: number | null;
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

/** One training exposure check (`te.1` to `te.5`). The server does not score these checks. */
export interface TrainingExposureCheck {
  id: string;
  stable_id?: string;
  legacy_id?: string;
  name: string;
  /** For example found, not_found, partial, fail or unknown. */
  status: string;
  details?: string;
  extra?: unknown;
}

export interface TrainingExposure {
  summary?: string;
  checks?: TrainingExposureCheck[];
}

/** Bounded technical evidence, not a conformance certificate or task execution result. */
export interface ArAssessment {
  conformance: "not_verified";
  methodology_version: string | null;
  evidence_scope: "bounded_scan" | "historical_scan";
  stage_order: Stage[];
  act_applicability: "unknown";
  interpretation: string;
  practices: Array<{
    id: string;
    stage: Stage;
    strength: Strength;
    verification_status: "not_verified";
    prerequisite_status: "not_applicable" | "not_verified";
    coverage: "partial";
    scope: string;
    limitations: string;
    checks: Array<{
      checkpoint_id: string;
      status: CheckpointStatus | "unverified";
      evidence_basis?: "checkpoint_outcome" | "discovery_links";
      observed?: Record<string, unknown>;
    }>;
    failed_checkpoint_ids: string[];
    partial_checkpoint_ids: string[];
    unverified_checkpoint_ids: string[];
  }>;
}

export interface ScanResult {
  id: string;
  domain: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  schema_version?: string;
  contract_version?: string;
  ar_assessment?: ArAssessment;
  overall_score?: number | null;
  letter_grade?: string | null;
  scan_duration_ms?: number;
  completed_at?: string;
  categories?: Category[];
  message?: string;
  poll_url?: string;
  /** Seconds the server asks a client to wait before the next poll. */
  retry_after?: number;
  issues?: Issue[];
  training_exposure?: TrainingExposure;
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
  /** Methodology version (YYYY-MM-DD). Default: current. */
  version?: string;
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
const MILLISECONDS_PER_SECOND = 1000;

const parseRetryAfter = (response: Response, body: { retry_after?: unknown } | null): number | null => {
  const value = response.headers.get("retry-after");
  if (value !== null && /^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds)) return seconds;
  }
  if (value !== null) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && date.toUTCString().toLowerCase() === value.trim().toLowerCase()) {
      return Math.max(0, Math.ceil((date.getTime() - Date.now()) / MILLISECONDS_PER_SECOND));
    }
  }
  return typeof body?.retry_after === "number" && Number.isSafeInteger(body.retry_after) && body.retry_after >= 0
    ? body.retry_after : null;
};

export interface PollOptions {
  /** Replaces the real wait, for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Seconds to wait before the first poll, from the scan start response. */
  firstWaitSeconds?: number;
}

/** Instance options shared by the CLI transport and SDK. */
export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}

/** Public API operations without process-global configuration. */
export interface ApiClient {
  getScanResults: (domain: string, options?: ScanResultOptions) => Promise<ScanResult>;
  listCheckpoints: (filters?: CheckpointFilters) => Promise<CheckpointList>;
  getCheckpoint: (id: string) => Promise<CheckpointDefinition>;
  getMethodology: (version?: string) => Promise<MethodologyDocument>;
  getMethodologyChangelog: () => Promise<ChangelogDocument>;
  getMethodologyScoring: (version: string) => Promise<ScoringDocument>;
  startScan: (url: string) => Promise<ScanResult>;
  getRankings: (options?: RankingsOptions) => Promise<RankingsResponse>;
  pollUntilComplete: (domain: string, onProgress?: (status: string) => void, options?: PollOptions) => Promise<ScanResult>;
}

/** Invalid client configuration, before any request is sent. */
export class ClientConfigError extends Error {}

/** A successful HTTP response with an unexpected body shape. */
export class ApiResponseError extends Error {}

/** Fetch could not reach the configured API. */
export class ApiTransportError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks a scan envelope before its status or polling hint can control a client. */
export const isScanResult = (value: unknown): value is ScanResult =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.domain === "string" &&
  typeof value.status === "string" &&
  ["pending", "running", "completed", "failed", "canceled"].includes(value.status) &&
  (value.retry_after === undefined ||
    (typeof value.retry_after === "number" &&
      Number.isFinite(value.retry_after) && value.retry_after >= 0));

/** Builds an isolated transport while retaining the CLI's existing API. */
export const createApiClient = (configuration: ApiClientOptions = {}): ApiClient => {
  let origin: URL;
  try {
    origin = new URL(configuration.baseUrl ?? BASE_URL);
  } catch {
    throw new ClientConfigError("baseUrl must be an HTTP or HTTPS origin");
  }
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password ||
      origin.search || origin.hash || origin.pathname !== "/") {
    throw new ClientConfigError("baseUrl must be an HTTP or HTTPS origin without credentials, path, query or fragment");
  }
  const baseUrl = origin.origin;
  const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const url = `${baseUrl}${path}`;
    let response: Response;
    try {
      response = await (configuration.fetch ?? globalThis.fetch)(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": configuration.userAgent ?? "isagentready-cli",
          ...options?.headers,
        },
      });
    } catch (error) {
      throw new ApiTransportError(error instanceof Error ? error.message : "Request failed");
    }

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

  const getScanResults = (domain: string, options: ScanResultOptions = {}, signal?: AbortSignal): Promise<ScanResult> => {
    const params = new URLSearchParams();
    if (options.failing) params.set("checkpoints", "failing");
    if (options.contract) params.set("include", "contract");
    return request<ScanResult>(`/api/v1/scan/${encodeURIComponent(domain)}${queryString(params)}`, { signal });
  };

  /** Accepts a bare array or an object that holds the array under `key`. */
  const unwrapList = (body: unknown, key: string): Record<string, unknown> => {
    if (Array.isArray(body)) return { [key]: body };
    if (isRecord(body) && Array.isArray(body[key])) return body;
    throw new ApiResponseError(`Expected an array or a ${key} array in the API response`);
  };

  /** Accepts a bare object or an object that holds it under `key`. */
  const unwrapItem = <T>(body: unknown, key: string): T =>
    (isRecord(body) && isRecord(body[key]) ? body[key] : body) as T;

  const CHECKPOINT_FILTER_KEYS = ["stage", "strength", "category", "ar", "version"] as const;

  /** Lists checkpoint definitions. The server filters on stage, strength, category, AR practice and methodology version. */
  const listCheckpoints = async (filters: CheckpointFilters = {}): Promise<CheckpointList> => {
    const params = new URLSearchParams();
    for (const key of CHECKPOINT_FILTER_KEYS) {
      const value = filters[key];
      if (value) params.set(key, value);
    }
    const body = await request<unknown>(`/api/v2/checkpoints${queryString(params)}`);
    return unwrapList(body, "checkpoints") as unknown as CheckpointList;
  };

  /** Gets one checkpoint definition. The server accepts the stable id and the legacy id. */
  const getCheckpoint = async (id: string): Promise<CheckpointDefinition> =>
    unwrapItem<CheckpointDefinition>(
      await request<unknown>(`/api/v2/checkpoints/${encodeURIComponent(id)}`),
      "checkpoint"
    );

  /** Gets the current methodology, or one version of it. */
  const getMethodology = (version?: string): Promise<MethodologyDocument> =>
    request<MethodologyDocument>(
      version ? `/api/v2/methodology/${encodeURIComponent(version)}` : "/api/v2/methodology"
    );

  const getMethodologyChangelog = async (): Promise<ChangelogDocument> =>
    unwrapList(await request<unknown>("/api/v2/methodology/changelog"), "changelog") as unknown as ChangelogDocument;

  /** Gets the scoring weights of one methodology version. */
  const getMethodologyScoring = (version: string): Promise<ScoringDocument> =>
    request<ScoringDocument>(`/api/v2/methodology/${encodeURIComponent(version)}/scoring`);

  const startScan = (url: string): Promise<ScanResult> =>
    request<ScanResult>("/api/v1/scan", {
      method: "POST",
      body: JSON.stringify({ url }),
    });

  const getRankings = (options: RankingsOptions = {}): Promise<RankingsResponse> => {
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


  const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const pollWaitMs = (seconds: number | undefined): number =>
    Math.min(Math.max(seconds ?? DEFAULT_POLL_SECONDS, 1), MAX_POLL_SECONDS) * 1000;

  /**
   * Polls the scan result until it completes. Waits the Retry-After seconds that
   * the server sends between polls and after a 429, so one scan does not use up
   * the hourly API quota.
   */
  const pollUntilComplete = async (
    domain: string,
    onProgress?: (status: string) => void,
    options: PollOptions = {}
  ): Promise<ScanResult> => {
    const sleep = options.sleep ?? realSleep;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    const controller = new AbortController();
    const timeoutMessage = `Scan timed out after ${POLL_DEADLINE_MS / 1000}s`;

    const poll = async (): Promise<ScanResult> => {
      if (options.firstWaitSeconds !== undefined) await sleep(pollWaitMs(options.firstWaitSeconds));

      while (Date.now() < deadline) {
        let waitMs: number;

        try {
          const result = await getScanResults(domain, {}, controller.signal);

          if (controller.signal.aborted) throw new Error(timeoutMessage);
          if (!isScanResult(result)) throw new ApiResponseError("Unexpected scan response");
          if (result.status === "completed") return result;
          if (result.status === "failed") throw new Error(`Scan failed for ${domain}`);
          if (result.status === "canceled") throw new Error(`Scan canceled for ${domain}`);

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

      throw new Error(timeoutMessage);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // Keep abort errors from replacing the operation's timeout result.
        reject(new Error(timeoutMessage));
        controller.abort();
      }, Math.max(0, deadline - Date.now()));
    });

    try {
      return await Promise.race([poll(), expired]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  return { getScanResults, listCheckpoints, getCheckpoint, getMethodology, getMethodologyChangelog, getMethodologyScoring, startScan, getRankings, pollUntilComplete };
};

const defaultClient = createApiClient();
export const getScanResults: ApiClient["getScanResults"] = defaultClient.getScanResults;
export const listCheckpoints: ApiClient["listCheckpoints"] = defaultClient.listCheckpoints;
export const getCheckpoint: ApiClient["getCheckpoint"] = defaultClient.getCheckpoint;
export const getMethodology: ApiClient["getMethodology"] = defaultClient.getMethodology;
export const getMethodologyChangelog: ApiClient["getMethodologyChangelog"] = defaultClient.getMethodologyChangelog;
export const getMethodologyScoring: ApiClient["getMethodologyScoring"] = defaultClient.getMethodologyScoring;
export const startScan: ApiClient["startScan"] = defaultClient.startScan;
export const getRankings: ApiClient["getRankings"] = defaultClient.getRankings;
export const pollUntilComplete: ApiClient["pollUntilComplete"] = defaultClient.pollUntilComplete;

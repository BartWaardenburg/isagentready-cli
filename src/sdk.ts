import {
  ValidationError,
  validateDomain,
  validateUrl,
  validateCheckpointId,
  validateMethodologyVersion,
  validateStage,
  validateStrength,
  validateCategory,
  validateArPractice,
} from "./validate.js";
import {
  ApiError,
  ApiResponseError,
  ApiTransportError,
  ClientConfigError,
  createApiClient,
} from "./api.js";
import type {
  ApiClient,
  ApiClientOptions,
  MethodologyDocument,
  CheckpointDefinition,
  CheckpointList,
  ChangelogDocument,
  ScoringDocument,
  RankingsResponse,
  RankingsOptions,
  ScanResult,
  ScanResultOptions,
  CheckpointFilters,
  PollOptions,
} from "./api.js";

export type {
  ArAssessment,
  Category,
  Checkpoint,
  CheckpointDefinition,
  CheckpointFilters,
  CheckpointList,
  ChangelogDocument,
  MethodologyDocument,
  PollOptions,
  RankingsOptions,
  RankingsResponse,
  ScanResult,
  ScanResultOptions,
  ScoringDocument,
} from "./api.js";

/** A successful response or a handled SDK error. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: SdkError };

/** HTTP, transport, configuration or response decoding failure. */
export interface SdkError {
  kind: "http" | "network" | "invalid_input" | "invalid_response" | "operation";
  message: string;
  status: number | null;
  retryAfter: number | null;
}

/** Per-client origin and native-fetch-compatible transport. Defaults to the public API. */
export type ClientOptions = Omit<ApiClientOptions, "userAgent">;

/** Typed SDK operations. Importing this module never starts the CLI. */
export interface Client {
  getMethodology: (version?: string) => Promise<Result<MethodologyDocument>>;
  getCheckpoint: (id: string) => Promise<Result<CheckpointDefinition>>;
  listCheckpoints: (filters?: CheckpointFilters) => Promise<Result<CheckpointList>>;
  getMethodologyChangelog: () => Promise<Result<ChangelogDocument>>;
  getMethodologyScoring: (version: string) => Promise<Result<ScoringDocument>>;
  getRankings: (options?: RankingsOptions) => Promise<Result<RankingsResponse>>;
  getScanResults: (domain: string, options?: ScanResultOptions) => Promise<Result<ScanResult>>;
  startScan: (url: string) => Promise<Result<ScanResult>>;
  pollUntilComplete: (
    domain: string,
    onProgress?: (status: string) => void,
    options?: PollOptions,
  ) => Promise<Result<ScanResult>>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const methodology = (value: unknown): value is MethodologyDocument =>
  record(value) && typeof value.version === "string" && Array.isArray(value.checkpoints);

const checkpoint = (value: unknown): value is CheckpointDefinition =>
  record(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.legacy_id === "string";
const catalog = (value: unknown): value is CheckpointList =>
  record(value) && Array.isArray(value.checkpoints) && value.checkpoints.every(checkpoint);
const changelog = (value: unknown): value is ChangelogDocument =>
  record(value) &&
  Array.isArray(value.changelog) &&
  value.changelog.every((entry: unknown) => record(entry) && typeof entry.version === "string");
const scoring = (value: unknown): value is ScoringDocument =>
  record(value) && typeof value.version === "string";
const scan = (value: unknown): value is ScanResult =>
  record(value) &&
  typeof value.id === "string" &&
  typeof value.domain === "string" &&
  ["pending", "running", "completed", "failed"].includes(String(value.status));
const rankings = (value: unknown): value is RankingsResponse =>
  record(value) &&
  Array.isArray(value.entries) &&
  value.entries.every(scan) &&
  typeof value.total === "number";

const checked = (value: unknown, validator: (input: string) => string, label: string): string => {
  if (typeof value !== "string") throw new ValidationError(`${label} must be a string`);
  return validator(value);
};

const filters = (input: CheckpointFilters = {}): CheckpointFilters => {
  if (!record(input)) throw new ValidationError("Checkpoint filters must be an object");
  return {
    ...(input.stage !== undefined ? { stage: checked(input.stage, validateStage, "stage") } : {}),
    ...(input.strength !== undefined
      ? { strength: checked(input.strength, validateStrength, "strength") }
      : {}),
    ...(input.category !== undefined
      ? { category: checked(input.category, validateCategory, "category") }
      : {}),
    ...(input.ar !== undefined ? { ar: checked(input.ar, validateArPractice, "ar") } : {}),
    ...(input.version !== undefined
      ? { version: checked(input.version, validateMethodologyVersion, "version") }
      : {}),
  };
};

const sdkError = (error: unknown): SdkError => ({
  kind:
    error instanceof ClientConfigError || error instanceof ValidationError
      ? "invalid_input"
      : error instanceof ApiError
        ? "http"
        : error instanceof SyntaxError || error instanceof ApiResponseError
          ? "invalid_response"
          : error instanceof ApiTransportError
            ? "network"
            : "operation",
  message: error instanceof Error ? error.message : "Request failed",
  status: error instanceof ApiError ? error.status : null,
  retryAfter: error instanceof ApiError ? error.retryAfter : null,
});

/** Creates an isolated SDK client. Public methods return Result and never run verification commands. */
export const createClient = (options: ClientOptions = {}): Client => {
  const configuration = { ...options, userAgent: "isagentready-sdk" };
  const execute = async <T>(
    action: (api: ApiClient) => Promise<T>,
    valid: (value: unknown) => value is T,
  ): Promise<Result<T>> => {
    try {
      const data = await action(createApiClient(configuration));
      if (!valid(data)) {
        return {
          ok: false,
          error: {
            kind: "invalid_response",
            message: "Unexpected API response",
            status: null,
            retryAfter: null,
          },
        };
      }
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: sdkError(error) };
    }
  };
  return {
    getMethodology: (version): Promise<Result<MethodologyDocument>> =>
      execute(
        (api) =>
          api.getMethodology(
            version === undefined
              ? undefined
              : checked(version, validateMethodologyVersion, "version"),
          ),
        methodology,
      ),
    getCheckpoint: (id): Promise<Result<CheckpointDefinition>> =>
      execute((api) => api.getCheckpoint(checked(id, validateCheckpointId, "id")), checkpoint),
    listCheckpoints: (input): Promise<Result<CheckpointList>> =>
      execute((api) => api.listCheckpoints(filters(input)), catalog),
    getMethodologyChangelog: (): Promise<Result<ChangelogDocument>> =>
      execute((api) => api.getMethodologyChangelog(), changelog),
    getMethodologyScoring: (version): Promise<Result<ScoringDocument>> =>
      execute(
        (api) => api.getMethodologyScoring(checked(version, validateMethodologyVersion, "version")),
        scoring,
      ),
    getRankings: (options): Promise<Result<RankingsResponse>> =>
      execute((api) => api.getRankings(options), rankings),
    getScanResults: (domain, options): Promise<Result<ScanResult>> =>
      execute(
        (api) => api.getScanResults(checked(domain, validateDomain, "domain"), options),
        scan,
      ),
    startScan: (url): Promise<Result<ScanResult>> =>
      execute((api) => api.startScan(checked(url, validateUrl, "url")), scan),
    pollUntilComplete: (domain, onProgress, options): Promise<Result<ScanResult>> =>
      execute(
        (api) =>
          api.pollUntilComplete(checked(domain, validateDomain, "domain"), onProgress, options),
        scan,
      ),
  };
};

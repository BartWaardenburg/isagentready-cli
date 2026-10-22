import {
  ApiError,
  getCheckpoint,
  getMethodology,
  getMethodologyChangelog,
  getMethodologyScoring,
  getScanResults,
  listCheckpoints,
  pollUntilComplete,
  startScan,
} from "./api.js";
import type {
  ChangelogDocument,
  Checkpoint,
  CheckpointDefinition,
  CheckpointFilters,
  CheckpointList,
  CheckpointStatus,
  Failure,
  MethodologyDocument,
  ScanResult,
  ScoringDocument,
  Verify,
} from "./api.js";
import {
  ValidationError,
  validateArPractice,
  validateCategory,
  validateCheckpointId,
  validateDomain,
  validateMethodologyVersion,
  validateStage,
  validateStrength,
} from "./validate.js";

/** Exit codes. Agents can read them without a parse of the output. */
export const EXIT = {
  SUCCESS: 0,
  ERROR: 1,
  VALIDATION: 2,
  SCAN_FAILED: 3,
  NOT_FOUND: 4,
  /** `verify` only: the checkpoint status is fail or partial. */
  CHECK_FAILED: 5,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface CommandError {
  message: string;
  exitCode: ExitCode;
}

export type CommandResult<T> = { ok: true; data: T; exitCode?: ExitCode } | { ok: false; error: CommandError };

type IdSource = Pick<Checkpoint, "id" | "stable_id" | "legacy_id">;

const STABLE_PREFIX = "ia.";
const FAILING_STATUSES: readonly CheckpointStatus[] = ["fail", "partial"];

const isStableId = (id: string): boolean => id.startsWith(STABLE_PREFIX);

/** The stable id (`ia.<slug>`), or null when the server sends only the legacy id. */
export const stableIdOf = (cp: IdSource): string | null =>
  cp.stable_id ?? (isStableId(cp.id) ? cp.id : null);

/** The legacy id (`4.3`), or null when the server sends only the stable id. */
export const legacyIdOf = (cp: IdSource): string | null =>
  cp.legacy_id ?? (isStableId(cp.id) ? null : cp.id);

export const isFailing = (cp: Pick<Checkpoint, "status">): boolean => FAILING_STATUSES.includes(cp.status);

const matchesId = (cp: IdSource, id: string): boolean =>
  cp.id === id || cp.stable_id === id || cp.legacy_id === id;

export const findCheckpoint = (scan: ScanResult, id: string): Checkpoint | null =>
  (scan.categories ?? []).flatMap((category) => category.checkpoints ?? []).find((cp) => matchesId(cp, id)) ??
  null;

/** Keeps the fail and partial checkpoints. Categories without one are left out. */
export const filterFailing = (scan: ScanResult): ScanResult => {
  if (!scan.categories) return scan;
  const categories = scan.categories
    .map((category) => ({ ...category, checkpoints: (category.checkpoints ?? []).filter(isFailing) }))
    .filter((category) => category.checkpoints.length > 0);
  return { ...scan, categories };
};

/** Fills the `{domain}` and `{origin}` placeholders of a contract template. */
export const fillPlaceholders = (template: string, domain: string): string =>
  template.replaceAll("{origin}", `https://${domain}`).replaceAll("{domain}", domain);

const fail = (message: string, exitCode: ExitCode): { ok: false; error: CommandError } => ({
  ok: false,
  error: { message, exitCode },
});

const isNotFound = (err: unknown): boolean => err instanceof ApiError && err.status === 404;

const toFailure = (err: unknown): { ok: false; error: CommandError } => {
  if (err instanceof ValidationError) return fail(err.message, EXIT.VALIDATION);
  if (isNotFound(err)) return fail((err as ApiError).message, EXIT.NOT_FOUND);
  return fail(err instanceof Error ? err.message : String(err), EXIT.ERROR);
};

const validateFilters = (filters: CheckpointFilters): CheckpointFilters => ({
  stage: filters.stage === undefined ? undefined : validateStage(filters.stage),
  strength: filters.strength === undefined ? undefined : validateStrength(filters.strength),
  category: filters.category === undefined ? undefined : validateCategory(filters.category),
  ar: filters.ar === undefined ? undefined : validateArPractice(filters.ar),
});

const CATALOG_MISSING = "The checkpoint catalog is not available on this server yet.";

/** A 404 on one id can also mean that the server has no catalog yet. */
const catalogExists = async (): Promise<boolean> => {
  try {
    await listCheckpoints();
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
};

export const runCheckpoints = async (filters: CheckpointFilters): Promise<CommandResult<CheckpointList>> => {
  try {
    return { ok: true, data: await listCheckpoints(validateFilters(filters)) };
  } catch (err) {
    if (isNotFound(err)) return fail(CATALOG_MISSING, EXIT.NOT_FOUND);
    return toFailure(err);
  }
};

export const runExplain = async (id: string): Promise<CommandResult<CheckpointDefinition>> => {
  try {
    const cleanId = validateCheckpointId(id);
    try {
      return { ok: true, data: await getCheckpoint(cleanId) };
    } catch (err) {
      if (!isNotFound(err)) throw err;
      if (!(await catalogExists())) return fail(CATALOG_MISSING, EXIT.NOT_FOUND);
      return fail(`Unknown checkpoint id: ${cleanId}. Run isagentready checkpoints for the list.`, EXIT.NOT_FOUND);
    }
  } catch (err) {
    return toFailure(err);
  }
};

export type MethodologyView =
  | { kind: "methodology"; document: MethodologyDocument }
  | { kind: "changelog"; document: ChangelogDocument }
  | { kind: "scoring"; document: ScoringDocument };

export interface MethodologyOptions {
  version?: string;
  changelog?: boolean;
  scoring?: boolean;
}

export const runMethodology = async (options: MethodologyOptions): Promise<CommandResult<MethodologyView>> => {
  try {
    const version = options.version === undefined ? undefined : validateMethodologyVersion(options.version);
    try {
      if (options.changelog) return { ok: true, data: { kind: "changelog", document: await getMethodologyChangelog() } };
      if (options.scoring) {
        const scoringVersion = version ?? (await getMethodology()).version;
        return { ok: true, data: { kind: "scoring", document: await getMethodologyScoring(scoringVersion) } };
      }
      return { ok: true, data: { kind: "methodology", document: await getMethodology(version) } };
    } catch (err) {
      if (!isNotFound(err)) throw err;
      const subject = version ? `Methodology version ${version}` : "The methodology document";
      return fail(`${subject} is not available on this server.`, EXIT.NOT_FOUND);
    }
  } catch (err) {
    return toFailure(err);
  }
};

const notCompleted = (scan: ScanResult, domain: string): { ok: false; error: CommandError } | null => {
  if (scan.status === "completed") return null;
  if (scan.status === "failed") return fail(`Scan failed for ${domain}`, EXIT.SCAN_FAILED);
  return fail(`Scan for ${domain} is ${scan.status}. Run: isagentready scan ${domain}`, EXIT.ERROR);
};

const fetchScan = async (
  domain: string,
  failing: boolean
): Promise<{ ok: true; scan: ScanResult; domain: string } | { ok: false; error: CommandError }> => {
  try {
    const cleanDomain = validateDomain(domain);
    const scan = await getScanResults(cleanDomain, { failing, contract: true });
    return notCompleted(scan, cleanDomain) ?? { ok: true, scan, domain: cleanDomain };
  } catch (err) {
    return toFailure(err);
  }
};

/** Gets the latest result with the contract fields, with only the fail and partial checkpoints. */
export const runResultsFailing = async (domain: string): Promise<CommandResult<ScanResult>> => {
  const fetched = await fetchScan(domain, true);
  if (!fetched.ok) return fetched;
  return { ok: true, data: filterFailing(fetched.scan) };
};

export interface CheckpointInScan {
  domain: string;
  completed_at: string | null;
  methodology_version: string | null;
  checkpoint: Checkpoint;
}

const scanContext = (scan: ScanResult, domain: string): Omit<CheckpointInScan, "checkpoint"> => ({
  domain,
  completed_at: scan.completed_at ?? null,
  methodology_version: scan.methodology_version ?? null,
});

const missingInScan = (id: string, domain: string): { ok: false; error: CommandError } =>
  fail(`No checkpoint ${id} in the scan result for ${domain}.`, EXIT.NOT_FOUND);

/** Gets one checkpoint from the latest result, with the contract fields. */
export const runResultsCheckpoint = async (domain: string, id: string): Promise<CommandResult<CheckpointInScan>> => {
  let cleanId: string;
  try {
    cleanId = validateCheckpointId(id);
  } catch (err) {
    return toFailure(err);
  }

  const fetched = await fetchScan(domain, false);
  if (!fetched.ok) return fetched;

  const checkpoint = findCheckpoint(fetched.scan, cleanId);
  if (!checkpoint) return missingInScan(cleanId, fetched.domain);
  return { ok: true, data: { ...scanContext(fetched.scan, fetched.domain), checkpoint } };
};

export interface VerifyReport {
  domain: string;
  checkpoint_id: string;
  legacy_id: string | null;
  name: string;
  status: CheckpointStatus;
  passed: boolean;
  failure: Failure | null;
  /** The scan details text. The current server sends it in place of `failure`. */
  details: string;
  /** Where the verify data comes from. Null when the server sends none. */
  verify_source: "scan" | "catalog" | null;
  /** Read-only check for the user. The CLI prints it and never runs it. */
  verify: Verify;
  command_executed: false;
  completed_at: string | null;
  methodology_version: string | null;
}

export interface VerifyOptions {
  /** Start a new scan before the check. */
  rescan?: boolean;
  onProgress?: (status: string) => void;
}

/** The scan result has no verify data on the current server. The catalog has it. */
const lookupVerify = async (
  cp: Checkpoint
): Promise<{ verify: Verify; stableId: string | null; source: "scan" | "catalog" } | null> => {
  if (cp.verify) return { verify: cp.verify, stableId: stableIdOf(cp), source: "scan" };
  try {
    const definition = await getCheckpoint(stableIdOf(cp) ?? cp.id);
    return definition.verify
      ? { verify: definition.verify, stableId: stableIdOf(definition), source: "catalog" }
      : null;
  } catch {
    return null;
  }
};

const fillVerify = (verify: Verify, domain: string): Verify => ({
  command: verify.command === null ? null : fillPlaceholders(verify.command, domain),
  expect: verify.expect ?? null,
  rescan: fillPlaceholders(verify.rescan, domain),
});

const rescan = async (domain: string, options: VerifyOptions): Promise<void> => {
  const initial = await startScan(`https://${domain}`);
  if (initial.status === "completed") return;
  await pollUntilComplete(domain, options.onProgress, { firstWaitSeconds: initial.retry_after });
};

/**
 * Gets the status of one checkpoint and the read-only verify command for it.
 * The command is data for the user. This function never runs it.
 */
export const runVerify = async (
  id: string,
  domain: string,
  options: VerifyOptions = {}
): Promise<CommandResult<VerifyReport>> => {
  let cleanId: string;
  let cleanDomain: string;
  try {
    cleanId = validateCheckpointId(id);
    cleanDomain = validateDomain(domain);
    if (options.rescan) await rescan(cleanDomain, options);
  } catch (err) {
    return toFailure(err);
  }

  const fetched = await fetchScan(cleanDomain, false);
  if (!fetched.ok) return fetched;

  const cp = findCheckpoint(fetched.scan, cleanId);
  if (!cp) return missingInScan(cleanId, cleanDomain);

  const found = await lookupVerify(cp);
  const checkpointId = stableIdOf(cp) ?? found?.stableId ?? cp.id;
  const verify = found
    ? fillVerify(found.verify, cleanDomain)
    : { command: null, expect: null, rescan: `isagentready verify ${checkpointId} ${cleanDomain} --rescan` };
  const passed = cp.status === "pass";

  return {
    ok: true,
    data: {
      ...scanContext(fetched.scan, cleanDomain),
      checkpoint_id: checkpointId,
      legacy_id: legacyIdOf(cp),
      name: cp.name,
      status: cp.status,
      passed,
      failure: cp.failure ?? null,
      details: cp.details,
      verify_source: found?.source ?? null,
      verify,
      command_executed: false,
    },
    exitCode: isFailing(cp) ? EXIT.CHECK_FAILED : EXIT.SUCCESS,
  };
};

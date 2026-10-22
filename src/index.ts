#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { getScanResults, startScan, pollUntilComplete, getRankings, ApiError } from "./api.js";
import type { ScanResult } from "./api.js";
import {
  formatScanResult,
  formatRankings,
  formatCheckpointList,
  formatCheckpointDefinition,
  formatMethodology,
  formatChangelog,
  formatScoring,
  formatFailingResult,
  formatCheckpointResult,
  formatVerifyReport,
  spinner,
} from "./format.js";
import { validateDomain, validateUrl, ValidationError } from "./validate.js";
import { isJsonMode, applyFieldMask } from "./output.js";
import {
  EXIT,
  runCheckpoints,
  runExplain,
  runMethodology,
  runResultsCheckpoint,
  runResultsFailing,
  runVerify,
} from "./checkpoints.js";
import type { CommandError, CommandResult, MethodologyView } from "./checkpoints.js";

const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as { version: string };

const EXIT_SUCCESS = EXIT.SUCCESS;
const EXIT_ERROR = EXIT.ERROR;
const EXIT_VALIDATION = EXIT.VALIDATION;
const EXIT_SCAN_FAILED = EXIT.SCAN_FAILED;
const EXIT_NOT_FOUND = EXIT.NOT_FOUND;

const FIELDS_HELP = "Comma-separated fields to include. Dot paths select nested fields (e.g. categories.checkpoints.status)";

type OutputOptions = { json?: boolean; output?: string; fields?: string };

const program = new Command();

program
  .name("isagentready")
  .description("Scan any website for AI agent readiness. Supports --json and piped output for AI agents.")
  .version(VERSION)
  .enablePositionalOptions();

// ── scan ──────────────────────────────────────────────────────────────────────

program
  .command("scan")
  .description("Scan a website for AI agent readiness")
  .argument("<url>", "URL to scan (e.g. example.com or https://example.com)")
  .option("-v, --verbose", "Show all checkpoints with details")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .option("--dry-run", "Validate the URL without starting a scan")
  .option("--no-poll", "Start scan without waiting for results")
  .action(
    async (
      url: string,
      options: { verbose?: boolean; poll?: boolean; dryRun?: boolean } & OutputOptions
    ) => {
      activeOutputOptions = options;
      const json = isJsonMode(options);
      const s = !json ? spinner() : null;
      try {
        const normalizedUrl = validateUrl(url);

        // --dry-run: validate locally, don't hit the API
        if (options.dryRun) {
          const result = { valid: true, url: normalizedUrl };
          if (json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(`\n  URL is valid: ${normalizedUrl}\n`);
          }
          process.exit(EXIT_SUCCESS);
        }

        s?.update("Starting scan...");

        const initial = await startScan(normalizedUrl);

        if (initial.status === "completed") {
          s?.stop("Scan complete (cached)");
          outputResult(initial, options);
          return;
        }

        if (options.poll === false) {
          s?.stop("Scan enqueued");
          if (json) {
            console.log(JSON.stringify(applyFieldMask(initial, options.fields), null, 2));
          } else {
            console.log(`  Scan started for ${initial.domain}`);
            console.log(`  Poll: isagentready results ${initial.domain}`);
          }
          return;
        }

        const domain = initial.domain ?? url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        s?.update(`Scanning ${domain}...`);

        const result = await pollUntilComplete(
          domain,
          (status) => {
            s?.update(`Scanning ${domain} (${status})...`);
          },
          { firstWaitSeconds: initial.retry_after }
        );

        if (result.status === "failed") {
          s?.stop();
          handleError(new Error(`Scan failed for ${domain}`), EXIT_SCAN_FAILED);
          return;
        }

        s?.stop("Scan complete");
        outputResult(result, options);
      } catch (err) {
        s?.stop();
        handleError(err);
      }
    }
  );

// ── results ───────────────────────────────────────────────────────────────────

program
  .command("results")
  .description("Get latest scan results for a domain")
  .argument("<domain>", "Domain to get results for (e.g. example.com)")
  .option("-v, --verbose", "Show all checkpoints with details")
  .option("--failing", "Show only fail and partial checkpoints that apply to the site, with the checkpoint contract fields")
  .option("--checkpoint <id>", "Show one checkpoint (stable id such as ia.robots-txt, or legacy id such as 1.1 or te.1)")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .action(
    async (
      domain: string,
      options: { verbose?: boolean; failing?: boolean; checkpoint?: string } & OutputOptions
    ) => {
      activeOutputOptions = options;
      const json = isJsonMode(options);

      if (options.failing && options.checkpoint) {
        handleError(new ValidationError("Use --failing or --checkpoint, not both."));
        return;
      }

      if (options.checkpoint) {
        const checkpointId = options.checkpoint;
        const result = await withSpinner(json, `Fetching ${checkpointId} for ${domain}...`, () =>
          runResultsCheckpoint(domain, checkpointId)
        );
        printResult(result, options, (data) => formatCheckpointResult(data.domain, data.checkpoint, options.verbose));
        return;
      }

      if (options.failing) {
        const result = await withSpinner(json, `Fetching failing checkpoints for ${domain}...`, () =>
          runResultsFailing(domain)
        );
        printResult(result, options, (data) => formatFailingResult(data, options.verbose));
        return;
      }

      const s = !json ? spinner() : null;
      try {
        const cleanDomain = validateDomain(domain);

        s?.update(`Fetching results for ${cleanDomain}...`);

        const result = await getScanResults(cleanDomain);
        s?.stop();

        if (result.status !== "completed") {
          if (json) {
            console.log(JSON.stringify(applyFieldMask(result, options.fields), null, 2));
          } else {
            console.log(`\n  Scan for ${cleanDomain} is ${result.status}.`);
            console.log(`  Run: isagentready scan ${cleanDomain}\n`);
          }
          return;
        }

        outputResult(result, options);
      } catch (err) {
        s?.stop();
        if (err instanceof ApiError && err.status === 404) {
          handleError(err, EXIT_NOT_FOUND);
        } else {
          handleError(err);
        }
      }
    }
  );

// ── checkpoints ───────────────────────────────────────────────────────────────

program
  .command("checkpoints")
  .description("List the checkpoint definitions: stable id, stage, strength and AR mapping")
  .option("--stage <stage>", "Filter by stage: find, read or act")
  .option("--strength <strength>", "Filter by strength: MUST, SHOULD or MAY")
  .option("--category <category>", "Filter by category key (e.g. agent_protocols)")
  .option("--ar <practice>", "Filter by agentready.org practice id (e.g. AR-FIND-01)")
  .option("--version <version>", "Methodology version (e.g. 2026-09-02). Default: current")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .action(
    async (
      options: { stage?: string; strength?: string; category?: string; ar?: string; version?: string } & OutputOptions
    ) => {
      activeOutputOptions = options;
      const result = await withSpinner(isJsonMode(options), "Loading checkpoints...", () =>
        runCheckpoints({
          stage: options.stage,
          strength: options.strength,
          category: options.category,
          ar: options.ar,
          version: options.version,
        })
      );
      printResult(result, options, formatCheckpointList);
    }
  );

// ── explain ───────────────────────────────────────────────────────────────────

program
  .command("explain")
  .description("Explain one checkpoint: why it matters, fix steps, verify command, AR mapping and fail rate")
  .argument("<id>", "Checkpoint id: stable (e.g. ia.robots-txt) or legacy (e.g. 1.1 or te.1)")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .action(async (id: string, options: OutputOptions) => {
    activeOutputOptions = options;
    const result = await withSpinner(isJsonMode(options), `Loading ${id}...`, () => runExplain(id));
    printResult(result, options, formatCheckpointDefinition);
  });

// ── methodology ───────────────────────────────────────────────────────────────

const formatMethodologyView = (view: MethodologyView): string => {
  switch (view.kind) {
    case "changelog":
      return formatChangelog(view.document);
    case "scoring":
      return formatScoring(view.document);
    case "methodology":
      return formatMethodology(view.document);
  }
};

program
  .command("methodology")
  .description("Show the versioned methodology, its changelog or its scoring weights")
  .option("--version <version>", "Methodology version (e.g. 2026-09-02). Default: current")
  .option("--changelog", "Show the methodology changelog")
  .option("--scoring", "Show the scoring weights and grade bands (separate from the spec)")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .action(async (options: { version?: string; changelog?: boolean; scoring?: boolean } & OutputOptions) => {
    activeOutputOptions = options;
    const result = await withSpinner(isJsonMode(options), "Loading methodology...", () =>
      runMethodology({ version: options.version, changelog: options.changelog, scoring: options.scoring })
    );
    printResult(result, options, formatMethodologyView, (view) => view.document);
  });

// ── verify ────────────────────────────────────────────────────────────────────

program
  .command("verify")
  .description("Check the status of one checkpoint and print its read-only verify command (never run)")
  .argument("<id>", "Checkpoint id: stable (e.g. ia.robots-txt) or legacy (e.g. 1.1 or te.1)")
  .argument("<domain>", "Domain to check (e.g. example.com)")
  .option("--rescan", "Start a new scan first (the server can return a cached result)")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", FIELDS_HELP)
  .action(async (id: string, domain: string, options: { rescan?: boolean } & OutputOptions) => {
    activeOutputOptions = options;
    const json = isJsonMode(options);
    const s = !json ? spinner() : null;
    s?.update(options.rescan ? `Scanning ${domain}...` : `Fetching ${id} for ${domain}...`);
    const result = await runVerify(id, domain, {
      rescan: options.rescan,
      onProgress: (status) => s?.update(`Scanning ${domain} (${status})...`),
    });
    s?.stop();
    printResult(result, options, formatVerifyReport);
  });

// ── rankings ──────────────────────────────────────────────────────────────────

program
  .command("rankings")
  .description("Browse AI agent readiness rankings")
  .option("-p, --page <number>", "Page number", "1")
  .option("-n, --per-page <number>", "Results per page", "25")
  .option("-g, --grade <range>", "Filter by grade range (high, mid, low)")
  .option("-s, --search <query>", "Search by domain")
  .option("--sort <field>", "Sort order (score_desc, score_asc, domain, newest)", "score_desc")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", "Comma-separated fields per entry (e.g. domain,overall_score,letter_grade)")
  .option("--page-all", "Stream all pages as NDJSON (one JSON object per line)")
  .action(
    async (options: {
      page: string;
      perPage: string;
      grade?: string;
      search?: string;
      sort: string;
      pageAll?: boolean;
    } & OutputOptions) => {
      activeOutputOptions = options;
      const json = isJsonMode(options);
      const s = !json ? spinner() : null;
      try {
        // --page-all: stream all pages as NDJSON
        if (options.pageAll) {
          let page = 1;
          let totalPages = 1;
          const perPage = Math.min(parseInt(options.perPage, 10) || 100, 100);

          do {
            const result = await getRankings({
              page,
              per_page: perPage,
              grade_range: options.grade as "high" | "mid" | "low" | undefined,
              search: options.search,
              sort: options.sort as "score_desc" | "score_asc" | "domain" | "newest",
            });

            totalPages = result.total_pages;

            for (const entry of result.entries) {
              console.log(JSON.stringify(applyFieldMask(entry, options.fields)));
            }

            page++;
          } while (page <= totalPages);

          return;
        }

        s?.update("Loading rankings...");

        const result = await getRankings({
          page: parseInt(options.page, 10),
          per_page: Math.min(parseInt(options.perPage, 10) || 25, 100),
          grade_range: options.grade as "high" | "mid" | "low" | undefined,
          search: options.search,
          sort: options.sort as "score_desc" | "score_asc" | "domain" | "newest",
        });

        s?.stop();

        if (json) {
          if (options.fields) {
            const filtered = {
              ...result,
              entries: result.entries.map((e) => applyFieldMask(e, options.fields)),
            };
            console.log(JSON.stringify(filtered, null, 2));
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        } else {
          console.log(formatRankings(result));
        }
      } catch (err) {
        s?.stop();
        handleError(err);
      }
    }
  );

// ── schema ────────────────────────────────────────────────────────────────────

program
  .command("schema")
  .description("Dump CLI schema as JSON for runtime introspection by AI agents")
  .argument("[command]", "Command to describe (e.g. scan, results, checkpoints). Omit for all commands.")
  .action((command?: string) => {
    const schema = getSchema();

    if (command) {
      const cmd = schema.commands.find((c) => c.name === command);
      if (!cmd) {
        handleError(new Error(`Unknown command: ${command}`), EXIT_VALIDATION);
        return;
      }
      console.log(JSON.stringify(cmd, null, 2));
    } else {
      console.log(JSON.stringify(schema, null, 2));
    }
  });

// ── helpers ───────────────────────────────────────────────────────────────────

const outputResult = (result: ScanResult, options: { verbose?: boolean } & OutputOptions): void => {
  if (isJsonMode(options)) {
    console.log(JSON.stringify(applyFieldMask(result, options.fields), null, 2));
  } else {
    console.log(formatScanResult(result, options.verbose));
  }
};

const withSpinner = async <T>(json: boolean, message: string, run: () => Promise<T>): Promise<T> => {
  const s = !json ? spinner() : null;
  s?.update(message);
  try {
    return await run();
  } finally {
    s?.stop();
  }
};

/** Prints the server data as JSON (with the field mask) or as text, then sets the exit code. */
const printResult = <T>(
  result: CommandResult<T>,
  options: OutputOptions,
  text: (data: T) => string,
  toJson: (data: T) => unknown = (data) => data
): void => {
  if (!result.ok) {
    exitWithError(result.error);
    return;
  }
  if (isJsonMode(options)) {
    console.log(JSON.stringify(applyFieldMask(toJson(result.data), options.fields), null, 2));
  } else {
    console.log(text(result.data));
  }
  process.exitCode = result.exitCode ?? EXIT_SUCCESS;
};

// Track current command's output options for error formatting
let activeOutputOptions: OutputOptions = {};

const handleError = (err: unknown, exitCode: number = EXIT_ERROR): void => {
  const isValidation = err instanceof ValidationError;
  const code = isValidation ? EXIT_VALIDATION : exitCode;
  const message = err instanceof Error ? err.message : String(err);
  const retryAfter = err instanceof ApiError ? err.retryAfter : null;
  printError(message, code, retryAfter);
};

const exitWithError = (error: CommandError): void => printError(error.message, error.exitCode, null);

const printError = (message: string, code: number, retryAfter: number | null): void => {
  if (isJsonMode(activeOutputOptions)) {
    console.error(
      JSON.stringify({
        error: true,
        message,
        exit_code: code,
        ...(retryAfter === null ? {} : { retry_after: retryAfter }),
      })
    );
  } else {
    console.error(`\n  \x1b[31mError:\x1b[0m ${message}\n`);
  }

  process.exit(code);
};

interface SchemaOutput {
  /** Name of the JSON shape. The API types in the package source use the same names. */
  type: string;
  description: string;
  /** Top-level fields. Nested fields use dot paths, as in --fields. */
  fields: string[];
}

interface SchemaCommand {
  name: string;
  description: string;
  arguments?: Array<{ name: string; required: boolean; description: string }>;
  options?: Array<{ flags: string; description: string; default?: string }>;
  output?: SchemaOutput | Record<string, SchemaOutput>;
}

const OUTPUT_OPTIONS = [
  { flags: "--json", description: "Output raw JSON (auto-enabled when piped)" },
  { flags: "--output <format>", description: "Output format: json or text" },
  { flags: "--fields <fields>", description: "Comma-separated fields. Dot paths select nested fields" },
];

const CHECKPOINT_ID_ARGUMENT = {
  name: "id",
  required: true,
  description: "Checkpoint id: stable (ia.<slug>) or legacy (e.g. 1.1 or te.1)",
};

const CONTRACT_FIELDS = [
  "id",
  "legacy_id",
  "ar_practice_ids",
  "ar_mapping",
  "name",
  "category",
  "stage",
  "strength",
  "evidence_type",
  "why",
  "references",
  "fix.summary",
  "fix.steps",
  "fix.skill",
  "verify.command",
  "verify.expect",
  "verify.rescan",
  "lifecycle",
  "methodology_version",
  "detail_url",
  "aggregate",
];

const RESULT_FIELDS = ["status", "score", "max_score", "applicable", "failure", "score_impact", "priority", "aggregate"];

const SCAN_RESULT_OUTPUT: SchemaOutput = {
  type: "ScanResult",
  description:
    "Server scan result, passed through. Checkpoints are in categories.checkpoints; their id is the legacy id. Contract fields are optional.",
  fields: [
    "id",
    "domain",
    "status",
    "overall_score",
    "letter_grade",
    "completed_at",
    "methodology_version",
    "categories.checkpoints",
    "issues",
    "profiles",
    "score_context",
    "stage_summary",
    "spec_alignment",
  ],
};

const getSchema = (): {
  name: string;
  version: string;
  description: string;
  api_base: string;
  exit_codes: Record<string, number>;
  commands: SchemaCommand[];
} => ({
  name: "isagentready",
  version: VERSION,
  description: "Scan any website for AI agent readiness",
  api_base: "https://isagentready.com",
  exit_codes: {
    success: EXIT.SUCCESS,
    error: EXIT.ERROR,
    validation: EXIT.VALIDATION,
    scan_failed: EXIT.SCAN_FAILED,
    not_found: EXIT.NOT_FOUND,
    check_failed: EXIT.CHECK_FAILED,
  },
  commands: [
    {
      name: "scan",
      description: "Scan a website for AI agent readiness. Starts a scan and polls until complete.",
      arguments: [
        { name: "url", required: true, description: "URL to scan (e.g. example.com or https://example.com)" },
      ],
      options: [
        { flags: "-v, --verbose", description: "Show all checkpoints with details" },
        ...OUTPUT_OPTIONS,
        { flags: "--dry-run", description: "Validate URL without starting a scan" },
        { flags: "--no-poll", description: "Start scan without waiting for results" },
      ],
      output: SCAN_RESULT_OUTPUT,
    },
    {
      name: "results",
      description: "Get latest scan results for a domain.",
      arguments: [
        { name: "domain", required: true, description: "Domain to get results for (e.g. example.com)" },
      ],
      options: [
        { flags: "-v, --verbose", description: "Show all checkpoints with details, fix steps and verify commands" },
        { flags: "--failing", description: "Only fail and partial checkpoints that apply to the site, with the contract fields" },
        { flags: "--checkpoint <id>", description: "One checkpoint, by stable or legacy id" },
        ...OUTPUT_OPTIONS,
      ],
      output: {
        default: SCAN_RESULT_OUTPUT,
        failing: { ...SCAN_RESULT_OUTPUT, description: "ScanResult with only the fail and partial checkpoints that apply to the site." },
        checkpoint: {
          type: "CheckpointInScan",
          description: "One checkpoint result with the scan context.",
          fields: [
            "domain",
            "completed_at",
            "methodology_version",
            "checkpoint.stable_id",
            ...RESULT_FIELDS.map((field) => `checkpoint.${field}`),
          ],
        },
      },
    },
    {
      name: "checkpoints",
      description: "List the checkpoint definitions from the versioned methodology.",
      options: [
        { flags: "--stage <stage>", description: "Filter: find, read or act" },
        { flags: "--strength <strength>", description: "Filter: MUST, SHOULD or MAY" },
        { flags: "--category <category>", description: "Filter by category key" },
        { flags: "--ar <practice>", description: "Filter by agentready.org practice id (e.g. AR-FIND-01)" },
        { flags: "--version <version>", description: "Methodology version (YYYY-MM-DD). Default: current" },
        ...OUTPUT_OPTIONS,
      ],
      output: {
        type: "CheckpointList",
        description: "Server data, passed through. Each entry is a CheckpointDefinition.",
        fields: ["checkpoints", "total", "methodology_version", ...CONTRACT_FIELDS.map((f) => `checkpoints.${f}`)],
      },
    },
    {
      name: "explain",
      description: "Explain one checkpoint: why, fix steps, verify command, AR mapping and fail rate.",
      arguments: [CHECKPOINT_ID_ARGUMENT],
      options: OUTPUT_OPTIONS,
      output: { type: "CheckpointDefinition", description: "Server data, passed through.", fields: CONTRACT_FIELDS },
    },
    {
      name: "methodology",
      description: "Show the versioned methodology (spec), its changelog, or its scoring weights.",
      options: [
        { flags: "--version <version>", description: "Methodology version (YYYY-MM-DD). Default: current" },
        { flags: "--changelog", description: "Show the changelog of all versions. Cannot be used with --version or --scoring" },
        { flags: "--scoring", description: "Show the scoring weights and grade bands" },
        ...OUTPUT_OPTIONS,
      ],
      output: {
        default: {
          type: "MethodologyDocument",
          description: "Server data, passed through. Holds no scoring weights.",
          fields: [
            "version",
            "supported_versions",
            "spec_alignment",
            "stages",
            "strength_rule",
            "evidence_types",
            "ar_practices",
            "changelog",
            "scoring.href",
            "checkpoints",
          ],
        },
        changelog: {
          type: "ChangelogDocument",
          description: "Server data, passed through.",
          fields: ["changelog.version", "changelog.date", "changelog.summary", "changelog.introduced", "changelog.revised", "changelog.retired"],
        },
        scoring: {
          type: "ScoringDocument",
          description: "Server data, passed through.",
          fields: ["version", "categories", "checkpoints", "grade_bands"],
        },
      },
    },
    {
      name: "verify",
      description:
        "Get the status of one checkpoint and its read-only verify command. The CLI prints the command and never runs it. Exits 5 only when outcome is fail. Exits 0 for pass, not_applicable, skipped and informational: read outcome.",
      arguments: [CHECKPOINT_ID_ARGUMENT, { name: "domain", required: true, description: "Domain to check" }],
      options: [{ flags: "--rescan", description: "Start a new scan first" }, ...OUTPUT_OPTIONS],
      output: {
        type: "VerifyReport",
        description: "Built by the CLI from the scan result and the checkpoint definition.",
        fields: [
          "domain",
          "checkpoint_id",
          "legacy_id",
          "name",
          "status",
          "exposure_status",
          "passed",
          "outcome",
          "failure",
          "details",
          "verify_source",
          "verify.command",
          "verify.expect",
          "verify.rescan",
          "command_executed",
          "completed_at",
          "methodology_version",
        ],
      },
    },
    {
      name: "rankings",
      description: "Browse AI agent readiness rankings with filtering and sorting.",
      options: [
        { flags: "-p, --page <number>", description: "Page number", default: "1" },
        { flags: "-n, --per-page <number>", description: "Results per page", default: "25" },
        { flags: "-g, --grade <range>", description: "Filter by grade range: high, mid, low" },
        { flags: "-s, --search <query>", description: "Search by domain" },
        { flags: "--sort <field>", description: "Sort: score_desc, score_asc, domain, newest", default: "score_desc" },
        ...OUTPUT_OPTIONS,
        { flags: "--page-all", description: "Stream all pages as NDJSON (one JSON per line)" },
      ],
      output: {
        type: "RankingsResponse",
        description: "Server data, passed through. With --page-all, one entry per line.",
        fields: ["entries", "total", "page", "per_page", "total_pages"],
      },
    },
    {
      name: "schema",
      description: "Dump CLI schema as JSON for runtime introspection by AI agents.",
      arguments: [
        { name: "command", required: false, description: "Command to describe. Omit for full schema." },
      ],
    },
  ],
});

program.parse();

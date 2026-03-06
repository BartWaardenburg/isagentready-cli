#!/usr/bin/env node

import { Command } from "commander";
import { getScanResults, startScan, pollUntilComplete, getRankings } from "./api.js";
import type { ScanResult } from "./api.js";
import { formatScanResult, formatRankings, spinner } from "./format.js";
import { validateDomain, validateUrl, ValidationError } from "./validate.js";
import { isJsonMode, applyFieldMask } from "./output.js";

// Exit codes (meaningful for agents)
const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_VALIDATION = 2;
const EXIT_SCAN_FAILED = 3;
const EXIT_NOT_FOUND = 4;

type OutputOptions = { json?: boolean; output?: string; fields?: string };

const program = new Command();

program
  .name("isagentready")
  .description("Scan any website for AI agent readiness. Supports --json and piped output for AI agents.")
  .version("0.1.0");

// ── scan ──────────────────────────────────────────────────────────────────────

program
  .command("scan")
  .description("Scan a website for AI agent readiness")
  .argument("<url>", "URL to scan (e.g. example.com or https://example.com)")
  .option("-v, --verbose", "Show all checkpoints with details")
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", "Comma-separated fields to include (e.g. domain,overall_score,letter_grade)")
  .option("--dry-run", "Validate the URL without starting a scan")
  .option("--no-poll", "Start scan without waiting for results")
  .action(
    async (
      url: string,
      options: { verbose?: boolean; poll?: boolean; dryRun?: boolean } & OutputOptions
    ) => {
      try {
        const normalizedUrl = validateUrl(url);
        const json = isJsonMode(options);

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

        const s = !json ? spinner() : null;
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
            console.log(JSON.stringify(applyFieldMask(initial as unknown as Record<string, unknown>, options.fields), null, 2));
          } else {
            console.log(`  Scan started for ${initial.domain}`);
            console.log(`  Poll: isagentready results ${initial.domain}`);
          }
          return;
        }

        const domain = initial.domain ?? url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        s?.update(`Scanning ${domain}...`);

        const result = await pollUntilComplete(domain, (status) => {
          s?.update(`Scanning ${domain} (${status})...`);
        });

        if (result.status === "failed") {
          s?.stop();
          handleError(new Error(`Scan failed for ${domain}`), EXIT_SCAN_FAILED);
          return;
        }

        s?.stop("Scan complete");
        outputResult(result, options);
      } catch (err) {
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
  .option("--json", "Output raw JSON (machine-readable)")
  .option("--output <format>", "Output format: json or text (default: auto-detect)")
  .option("--fields <fields>", "Comma-separated fields to include (e.g. domain,overall_score,letter_grade)")
  .action(async (domain: string, options: { verbose?: boolean } & OutputOptions) => {
    try {
      const cleanDomain = validateDomain(domain);
      const json = isJsonMode(options);

      const s = !json ? spinner() : null;
      s?.update(`Fetching results for ${cleanDomain}...`);

      const result = await getScanResults(cleanDomain);
      s?.stop();

      if (result.status !== "completed") {
        if (json) {
          console.log(JSON.stringify(applyFieldMask(result as unknown as Record<string, unknown>, options.fields), null, 2));
        } else {
          console.log(`\n  Scan for ${cleanDomain} is ${result.status}.`);
          console.log(`  Run: isagentready scan ${cleanDomain}\n`);
        }
        return;
      }

      outputResult(result, options);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not_found")) {
        handleError(err, EXIT_NOT_FOUND);
      } else {
        handleError(err);
      }
    }
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
      try {
        const json = isJsonMode(options);

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
              const data = options.fields
                ? applyFieldMask(entry as unknown as Record<string, unknown>, options.fields)
                : entry;
              console.log(JSON.stringify(data));
            }

            page++;
          } while (page <= totalPages);

          return;
        }

        const s = !json ? spinner() : null;
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
              entries: result.entries.map((e) =>
                applyFieldMask(e as unknown as Record<string, unknown>, options.fields)
              ),
            };
            console.log(JSON.stringify(filtered, null, 2));
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        } else {
          console.log(formatRankings(result));
        }
      } catch (err) {
        handleError(err);
      }
    }
  );

// ── schema ────────────────────────────────────────────────────────────────────

program
  .command("schema")
  .description("Dump CLI schema as JSON for runtime introspection by AI agents")
  .argument("[command]", "Command to describe (scan, results, rankings). Omit for all commands.")
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
    const data = options.fields
      ? applyFieldMask(result as unknown as Record<string, unknown>, options.fields)
      : result;
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatScanResult(result, options.verbose));
  }
};

const handleError = (err: unknown, exitCode = EXIT_ERROR): void => {
  const isValidation = err instanceof ValidationError;
  const code = isValidation ? EXIT_VALIDATION : exitCode;
  const message = err instanceof Error ? err.message : String(err);

  if (!process.stdout.isTTY || process.env["OUTPUT_FORMAT"] === "json") {
    // Machine-readable error
    console.error(JSON.stringify({ error: true, message, exit_code: code }));
  } else {
    console.error(`\n  \x1b[31mError:\x1b[0m ${message}\n`);
  }

  process.exit(code);
};

const getSchema = (): {
  name: string;
  version: string;
  description: string;
  api_base: string;
  commands: Array<{
    name: string;
    description: string;
    arguments?: Array<{ name: string; required: boolean; description: string }>;
    options?: Array<{ flags: string; description: string; default?: string }>;
  }>;
} => ({
  name: "isagentready",
  version: "0.1.0",
  description: "Scan any website for AI agent readiness",
  api_base: "https://isagentready.com",
  commands: [
    {
      name: "scan",
      description: "Scan a website for AI agent readiness. Starts a scan and polls until complete.",
      arguments: [
        { name: "url", required: true, description: "URL to scan (e.g. example.com or https://example.com)" },
      ],
      options: [
        { flags: "-v, --verbose", description: "Show all checkpoints with details" },
        { flags: "--json", description: "Output raw JSON (auto-enabled when piped)" },
        { flags: "--output <format>", description: "Output format: json or text" },
        { flags: "--fields <fields>", description: "Comma-separated fields to include in output" },
        { flags: "--dry-run", description: "Validate URL without starting a scan" },
        { flags: "--no-poll", description: "Start scan without waiting for results" },
      ],
    },
    {
      name: "results",
      description: "Get latest scan results for a domain.",
      arguments: [
        { name: "domain", required: true, description: "Domain to get results for (e.g. example.com)" },
      ],
      options: [
        { flags: "-v, --verbose", description: "Show all checkpoints with details" },
        { flags: "--json", description: "Output raw JSON (auto-enabled when piped)" },
        { flags: "--output <format>", description: "Output format: json or text" },
        { flags: "--fields <fields>", description: "Comma-separated fields to include in output" },
      ],
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
        { flags: "--json", description: "Output raw JSON (auto-enabled when piped)" },
        { flags: "--output <format>", description: "Output format: json or text" },
        { flags: "--fields <fields>", description: "Comma-separated fields per entry" },
        { flags: "--page-all", description: "Stream all pages as NDJSON (one JSON per line)" },
      ],
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

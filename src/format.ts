import type {
  Aggregate,
  ChangelogDocument,
  ChangelogEntry,
  Checkpoint,
  CheckpointDefinition,
  CheckpointList,
  Fix,
  MethodologyDocument,
  RankingsResponse,
  ScanResult,
  ScoringDocument,
  Verify,
} from "./api.js";
import { fillPlaceholders, isFailing, legacyIdOf, stableIdOf } from "./checkpoints.js";
import type { VerifyReport } from "./checkpoints.js";

const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const white = (s: string): string => `\x1b[37m${s}\x1b[0m`;
const bgGreen = (s: string): string => `\x1b[42m\x1b[30m${s}\x1b[0m`;
const bgYellow = (s: string): string => `\x1b[43m\x1b[30m${s}\x1b[0m`;
const bgRed = (s: string): string => `\x1b[41m\x1b[37m${s}\x1b[0m`;

export const scoreColor = (score: number): ((s: string) => string) => {
  if (score >= 70) return green;
  if (score >= 40) return yellow;
  return red;
};

export const gradeBg = (grade: string): ((s: string) => string) => {
  if (grade === "A+" || grade === "A" || grade === "B") return bgGreen;
  if (grade === "C") return bgYellow;
  return bgRed;
};

export const statusIcon = (status: string): string => {
  switch (status) {
    case "pass":
      return green("✓");
    case "partial":
      return yellow("◐");
    case "fail":
      return red("✗");
    case "skip":
      return dim("○");
    default:
      return " ";
  }
};

const scoreBar = (score: number, max: number, width = 20): string => {
  const filled = max > 0 ? Math.round((score / max) * width) : 0;
  const empty = width - filled;
  const color = scoreColor(max > 0 ? Math.round((score / max) * 100) : 0);
  return color("█".repeat(filled)) + dim("░".repeat(empty));
};

const pad = (s: string, width: number): string => {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, width - visible.length));
};

export const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 1) + "…" : s;

const TAG_SEPARATOR = " · ";
const MESSAGE_WIDTH = 100;

type TagSource = Pick<Checkpoint, "id" | "stable_id" | "legacy_id" | "stage" | "strength">;

/** Stable id, stage and strength, when the server sends them. */
const specTags = (cp: TagSource): string[] =>
  [stableIdOf(cp), cp.stage?.toUpperCase(), cp.strength].filter((tag): tag is string => Boolean(tag));

/** Like specTags, with the legacy id when there is no stable id. */
const idTags = (cp: TagSource): string =>
  (stableIdOf(cp) ? specTags(cp) : [cp.id, ...specTags(cp)]).join(TAG_SEPARATOR);

/** "94% of 4210 scanned sites fail this (benchmark 2026-q3)" */
export const failRate = (aggregate: Aggregate): string =>
  `${Math.round(aggregate.rates.fail * 100)}% of ${aggregate.denominator} scanned sites fail this (benchmark ${aggregate.benchmark_version})`;

const fixLines = (fix: Fix | undefined, verify: Verify | undefined, domain: string | null, indent: string): string[] => {
  const lines: string[] = [];
  if (fix) {
    lines.push(`${indent}${bold("Fix")} ${fix.summary}`);
    for (const step of [...fix.steps].sort((a, b) => a.order - b.order)) {
      lines.push(`${indent}  ${step.order}. ${step.action}`);
    }
  }
  if (verify?.command) {
    const command = domain ? fillPlaceholders(verify.command, domain) : verify.command;
    lines.push(`${indent}${bold("Verify")} ${cyan(command)}`);
  }
  return lines;
};

const headerLines = (scan: ScanResult): string[] => {
  const score = scan.overall_score;
  const grade = scan.letter_grade ?? "?";
  const display = typeof score === "number" ? `${scoreColor(score)(String(score))}/100` : dim("Score unavailable");
  const lines = ["", `  ${gradeBg(grade)(` ${grade} `)}  ${bold(scan.domain)}  ${display}`];
  if (scan.scan_duration_ms) {
    lines.push(dim(`  Scanned in ${(scan.scan_duration_ms / 1000).toFixed(1)}s`));
  }
  return lines;
};

const allCheckpoints = (scan: ScanResult): Checkpoint[] =>
  (scan.categories ?? []).flatMap((c) => c.checkpoints ?? []);

const verboseCheckpointLines = (cp: Checkpoint, domain: string): string[] => {
  const tags = specTags(cp).join(TAG_SEPARATOR);
  const lines = [
    `    ${statusIcon(cp.status)} ${dim(cp.id)} ${cp.name} ${dim(`${cp.score}/${cp.max_score}`)}${tags ? `  ${dim(tags)}` : ""}`,
  ];
  if (cp.details) {
    lines.push(`      ${dim(truncate(cp.details, 80))}`);
  }
  if (isFailing(cp)) lines.push(...fixLines(cp.fix, cp.verify, domain, "      "));
  return lines;
};

export const formatScanResult = (scan: ScanResult, verbose = false): string => {
  const lines: string[] = headerLines(scan);

  lines.push("");

  if (scan.categories?.length) {
    lines.push(bold("  Categories"));
    lines.push("");

    for (const cat of scan.categories) {
      if (typeof cat.score === "number") {
        const pct = cat.max_score > 0 ? Math.round((cat.score / cat.max_score) * 100) : 0;
        lines.push(
          `  ${scoreBar(cat.score, cat.max_score, 15)} ${pad(scoreColor(pct)(`${pct}%`), 12)} ${white(cat.label)} ${dim(`(${cat.weight}% weight)`)}`
        );
      } else {
        lines.push(`  ${white(cat.label)} ${dim("score unavailable")}`);
      }

      if (verbose && cat.checkpoints?.length) {
        for (const cp of cat.checkpoints) {
          lines.push(...verboseCheckpointLines(cp, scan.domain));
        }
        lines.push("");
      }
    }

    if (!verbose) {
      lines.push("");
    }
  }

  if (!verbose && scan.categories?.length) {
    const fails = allCheckpoints(scan)
      .map((cp) => ({ cp, advice: cp.recommendation ?? cp.fix?.summary ?? null }))
      .filter((item): item is { cp: Checkpoint; advice: string } => item.cp.status === "fail" && item.advice != null)
      .slice(0, 5);

    if (fails.length > 0) {
      lines.push(bold("  Top recommendations"));
      lines.push("");
      for (const { cp, advice } of fails) {
        lines.push(`  ${red("✗")} ${cp.name}  ${dim(idTags(cp))}`);
        lines.push(`    ${dim(truncate(advice, 80))}`);
      }
      lines.push("");
    }
  }

  lines.push(dim(`  Full report: https://isagentready.com/scan/${scan.domain}`));
  lines.push("");

  return lines.join("\n");
};

const explainHint = (cp: TagSource): string => dim(`  Details: isagentready explain ${stableIdOf(cp) ?? cp.id}`);

/** Text for `results <domain> --failing`. */
export const formatFailingResult = (scan: ScanResult, verbose = false): string => {
  const failing = allCheckpoints(scan).filter(isFailing);
  const lines = headerLines(scan);
  lines.push("");

  if (failing.length === 0) {
    lines.push(`  ${green("✓")} No failing checkpoints.`, "");
    return lines.join("\n");
  }

  lines.push(bold(`  ${failing.length} failing checkpoints`), "");
  for (const cp of failing) {
    lines.push(`  ${statusIcon(cp.status)} ${cp.name}  ${dim(idTags(cp))}`);
    lines.push(`    ${dim(truncate(cp.failure?.message ?? cp.details, MESSAGE_WIDTH))}`);
    if (verbose) lines.push(...fixLines(cp.fix, cp.verify, scan.domain, "    "));
  }
  lines.push("", dim("  Details: isagentready explain <id>"), "");
  return lines.join("\n");
};

/** Text for `results <domain> --checkpoint <id>`. */
export const formatCheckpointResult = (domain: string, cp: Checkpoint, verbose = false): string => {
  const icon = statusIcon(cp.applicable === false ? "skip" : cp.status);
  const lines = ["", `  ${icon} ${bold(cp.name)}`, `    ${dim(idTags(cp))}`];
  lines.push(
    cp.exposure_status === undefined
      ? `    ${cp.status}  ${cp.score}/${cp.max_score}${cp.applicable === false ? `  ${dim("not applicable")}` : ""}`
      : `    ${cp.exposure_status}  ${dim("training exposure, not scored")}`
  );

  const message = cp.failure?.message ?? cp.details;
  if (message) lines.push(`    ${truncate(message, MESSAGE_WIDTH)}`);
  if (cp.failure?.expected) lines.push(`    ${dim(`Expected: ${cp.failure.expected}`)}`);
  if (cp.aggregate) lines.push(`    ${dim(failRate(cp.aggregate))}`);
  if (verbose) lines.push(...fixLines(cp.fix, cp.verify, domain, "    "));

  lines.push("", explainHint(cp), "");
  return lines.join("\n");
};

/** A short note for each outcome that is not a plain pass or fail. Exit code 0 means nothing to fix. */
const OUTCOME_NOTES: Record<VerifyReport["outcome"], string | null> = {
  pass: null,
  fail: null,
  not_applicable: "This checkpoint does not apply to this site. Nothing to fix.",
  skipped: "The scan did not run this checkpoint. Nothing to fix now.",
  informational: "Training exposure check. It has no score. Nothing to fix.",
};

/** Text for `verify <id> <domain>`. The command is printed, never run. */
export const formatVerifyReport = (report: VerifyReport): string => {
  const lines = [
    "",
    `  ${statusIcon(report.outcome === "not_applicable" ? "skip" : report.status)} ${bold(report.name)}  ${dim(report.checkpoint_id)}`,
    `    ${report.exposure_status ?? report.status} on ${report.domain}`,
  ];
  const note = OUTCOME_NOTES[report.outcome];
  if (note) lines.push(`    ${dim(note)}`);
  const message = report.failure?.message ?? report.details;
  if (message) lines.push(`    ${truncate(message, MESSAGE_WIDTH)}`);
  lines.push("");

  if (report.verify.command) {
    lines.push("  Run this read-only check yourself. isagentready does not run it.");
    lines.push(`    ${cyan(report.verify.command)}`);
    if (report.verify.expect) lines.push(`    ${dim(`Expect: ${report.verify.expect}`)}`);
  } else if (report.verify_source === null) {
    lines.push("  The server sends no verify command for this checkpoint yet.");
  } else {
    lines.push("  No shell check exists for this checkpoint.");
  }
  lines.push(`  ${dim(`Rescan: ${report.verify.rescan}`)}`);

  const context = [
    report.completed_at ? `Scan from ${report.completed_at}` : null,
    report.methodology_version ? `methodology ${report.methodology_version}` : null,
  ].filter((part): part is string => part !== null);
  if (context.length > 0) lines.push(`  ${dim(context.join(TAG_SEPARATOR))}`);
  lines.push("");
  return lines.join("\n");
};

const ID_COLUMN = 34;
const LEGACY_COLUMN = 7;
const STAGE_COLUMN = 5;
const STRENGTH_COLUMN = 8;

/** Text for `checkpoints`. */
export const formatCheckpointList = (list: CheckpointList): string => {
  if (list.checkpoints.length === 0) return "\n  No checkpoints match the filters.\n";

  const lines = [
    "",
    `  ${dim(pad("ID", ID_COLUMN))} ${dim(pad("Legacy", LEGACY_COLUMN))} ${dim(pad("Stage", STAGE_COLUMN))} ${dim(pad("Strength", STRENGTH_COLUMN))} ${dim("Name")}`,
  ];
  for (const cp of list.checkpoints) {
    lines.push(
      `  ${pad(cp.id, ID_COLUMN)} ${dim(pad(legacyIdOf(cp) ?? "", LEGACY_COLUMN))} ${pad(cp.stage.toUpperCase(), STAGE_COLUMN)} ${pad(cp.strength ?? "-", STRENGTH_COLUMN)} ${cp.name}`
    );
  }

  const version = list.methodology_version ? `${TAG_SEPARATOR}methodology ${list.methodology_version}` : "";
  lines.push("", dim(`  ${list.checkpoints.length} checkpoints${version}`));
  lines.push(dim("  Details: isagentready explain <id>"), "");
  return lines.join("\n");
};

const section = (title: string, body: string[]): string[] => (body.length > 0 ? ["", bold(`  ${title}`), ...body] : []);

/** Text for `explain <id>`: the full detail of one checkpoint definition. */
export const formatCheckpointDefinition = (def: CheckpointDefinition): string => {
  const legacy = legacyIdOf(def);
  const lines = ["", `  ${bold(def.name)}`, `  ${dim(`${def.id}${legacy ? ` (legacy ${legacy})` : ""}`)}`];
  lines.push(
    `  ${[def.stage.toUpperCase(), def.strength ?? "informational", def.evidence_type, def.category].filter(Boolean).join(TAG_SEPARATOR)}`
  );

  const practices = def.ar_practice_ids?.length ? `${def.ar_practice_ids.join(", ")} (${def.ar_mapping})` : "none";
  lines.push(`  AR practices: ${practices}`);
  if (def.aggregate) lines.push(`  ${failRate(def.aggregate)}`);
  if (def.lifecycle?.retired) {
    const replaced = def.lifecycle.replaced_by ? ` Replaced by ${def.lifecycle.replaced_by}.` : "";
    lines.push(`  ${yellow(`Retired ${def.lifecycle.retired}.${replaced}`)}`);
  }

  lines.push(...section("Why", def.why ? [`    ${def.why}`] : []));

  const fix: string[] = [];
  if (def.fix) {
    fix.push(`    ${def.fix.summary}`);
    for (const step of [...def.fix.steps].sort((a, b) => a.order - b.order)) {
      fix.push(`    ${step.order}. ${step.action}`);
      if (step.code_example) fix.push(...step.code_example.split("\n").map((line) => `       ${dim(line)}`));
    }
    if (def.fix.skill) fix.push(dim(`    Skill: ${def.fix.skill.name}#${def.fix.skill.anchor}`));
  }
  lines.push(...section("Fix", fix));

  const verify: string[] = [];
  if (def.verify) {
    verify.push(def.verify.command ? `    ${cyan(def.verify.command)}` : "    No shell check exists for this checkpoint.");
    if (def.verify.expect) verify.push(dim(`    Expect: ${def.verify.expect}`));
    verify.push(dim(`    Rescan: ${def.verify.rescan}`));
  }
  lines.push(...section("Verify (read-only, replace {domain})", verify));

  lines.push(...section("References", (def.references ?? []).map((ref) => `    ${ref.title}  ${dim(ref.url)}`)));
  lines.push("", dim(`  Details: ${def.detail_url}`), "");
  return lines.join("\n");
};

const changelogLines = (entry: ChangelogEntry): string[] => {
  const lines = [`  ${bold(entry.version)}  ${entry.summary}`];
  const groups: Array<[string, string[]]> = [
    ["Introduced", entry.introduced],
    ["Revised", entry.revised],
    ["Retired", entry.retired],
  ];
  for (const [label, ids] of groups) {
    if (ids?.length) lines.push(dim(`    ${label}: ${ids.join(", ")}`));
  }
  return lines;
};

/** Text for `methodology`: the short view, with hints to the deeper commands. */
export const formatMethodology = (doc: MethodologyDocument): string => {
  const lines = ["", bold(`  Methodology ${doc.version}`)];
  if (doc.spec_alignment) {
    lines.push(dim(`  Aligned with agentready.org spec ${doc.spec_alignment.agentready_spec}`));
  }
  lines.push(...section("Stages", (doc.stages ?? []).map((stage) => `    ${pad(stage.name, 6)} ${dim(stage.summary)}`)));

  const latest = doc.changelog?.[0];
  if (latest) lines.push("", bold("  Latest change"), `    ${latest.version}  ${latest.summary}`);

  lines.push(
    "",
    dim("  Changelog:   isagentready methodology --changelog"),
    dim("  Scoring:     isagentready methodology --scoring"),
    dim("  Checkpoints: isagentready checkpoints"),
    ""
  );
  return lines.join("\n");
};

/** Text for `methodology --changelog`. */
export const formatChangelog = (doc: ChangelogDocument): string =>
  ["", bold("  Methodology changelog"), "", ...doc.changelog.flatMap(changelogLines), ""].join("\n");

/** Text for `methodology --scoring`. */
export const formatScoring = (doc: ScoringDocument): string => {
  const lines = ["", bold(`  Scoring ${doc.version}`)];
  lines.push(
    ...section(
      "Category weights",
      (doc.categories ?? []).map((c) => `    ${pad(c.label ?? c.category, 24)} ${c.weight}%`)
    )
  );
  lines.push(...section("Grades", (doc.grade_bands ?? []).map((band) => `    ${pad(band.grade, 3)} ${band.min}-${band.max}`)));
  lines.push("");
  return lines.join("\n");
};

export const formatRankings = (data: RankingsResponse): string => {
  const lines: string[] = [];

  lines.push("");
  lines.push(bold(`  AI Agent Readiness Rankings`));
  lines.push(dim(`  ${data.total} websites ranked  |  Page ${data.page}/${data.total_pages}`));
  lines.push("");

  lines.push(
    `  ${dim(pad("#", 5))} ${pad(dim("Grade"), 12)} ${pad(dim("Score"), 10)} ${dim("Domain")}`
  );
  lines.push(dim("  " + "─".repeat(60)));

  const startRank = (data.page - 1) * data.per_page;

  for (let i = 0; i < data.entries.length; i++) {
    const scan = data.entries[i]!;
    const rank = startRank + i + 1;
    const grade = scan.letter_grade ?? "?";
    const score = scan.overall_score;
    const display = typeof score === "number" ? scoreColor(score)(String(score) + "/100") : dim("unavailable");

    lines.push(
      `  ${pad(dim(String(rank)), 5)} ${pad(gradeBg(grade)(` ${grade} `), 12)} ${pad(display, 10)} ${white(scan.domain)}`
    );
  }

  lines.push("");

  if (data.page < data.total_pages) {
    lines.push(dim(`  Next page: isagentready rankings --page ${data.page + 1}`));
    lines.push("");
  }

  return lines.join("\n");
};

export const spinner = (): { update: (msg: string) => void; stop: (msg?: string) => void } => {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let interval: ReturnType<typeof setInterval>;

  const update = (msg: string): void => {
    clearInterval(interval);
    interval = setInterval(() => {
      process.stderr.write(`\r  ${cyan(frames[i++ % frames.length]!)} ${msg}`);
    }, 80);
  };

  const stop = (msg?: string): void => {
    clearInterval(interval);
    process.stderr.write("\r" + " ".repeat(60) + "\r");
    if (msg) process.stderr.write(`  ${green("✓")} ${msg}\n`);
  };

  return { update, stop };
};

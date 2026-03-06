import type { ScanResult, Checkpoint, RankingsResponse } from "./api.js";

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

export const formatScanResult = (scan: ScanResult, verbose = false): string => {
  const lines: string[] = [];
  const score = scan.overall_score ?? 0;
  const grade = scan.letter_grade ?? "?";

  lines.push("");
  lines.push(
    `  ${gradeBg(grade)(` ${grade} `)}  ${bold(scan.domain)}  ${scoreColor(score)(String(score))}/100`
  );

  if (scan.scan_duration_ms) {
    lines.push(dim(`  Scanned in ${(scan.scan_duration_ms / 1000).toFixed(1)}s`));
  }

  lines.push("");

  if (scan.categories?.length) {
    lines.push(bold("  Categories"));
    lines.push("");

    for (const cat of scan.categories) {
      const pct = cat.max_score > 0 ? Math.round((cat.score / cat.max_score) * 100) : 0;
      lines.push(
        `  ${scoreBar(cat.score, cat.max_score, 15)} ${pad(scoreColor(pct)(`${pct}%`), 12)} ${white(cat.label)} ${dim(`(${cat.weight}% weight)`)}`
      );

      if (verbose && cat.checkpoints?.length) {
        for (const cp of cat.checkpoints) {
          lines.push(`    ${statusIcon(cp.status)} ${dim(cp.id)} ${cp.name} ${dim(`${cp.score}/${cp.max_score}`)}`);
          if (cp.details) {
            lines.push(`      ${dim(truncate(cp.details, 80))}`);
          }
        }
        lines.push("");
      }
    }

    if (!verbose) {
      lines.push("");
    }
  }

  if (!verbose && scan.categories?.length) {
    const fails = scan.categories
      .flatMap((c) => c.checkpoints ?? [])
      .filter((cp): cp is Checkpoint & { recommendation: string } =>
        cp.status === "fail" && cp.recommendation != null
      )
      .slice(0, 5);

    if (fails.length > 0) {
      lines.push(bold("  Top recommendations"));
      lines.push("");
      for (const cp of fails) {
        lines.push(`  ${red("✗")} ${cp.name}`);
        lines.push(`    ${dim(truncate(cp.recommendation, 80))}`);
      }
      lines.push("");
    }
  }

  lines.push(dim(`  Full report: https://isagentready.com/scan/${scan.domain}`));
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
    const score = scan.overall_score ?? 0;

    lines.push(
      `  ${pad(dim(String(rank)), 5)} ${pad(gradeBg(grade)(` ${grade} `), 12)} ${pad(scoreColor(score)(String(score) + "/100"), 10)} ${white(scan.domain)}`
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

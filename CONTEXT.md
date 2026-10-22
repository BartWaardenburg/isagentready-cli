---
name: isagentready
description: CLI for scanning websites for AI agent readiness
version: 0.1.0
tools:
  - scan
  - results
  - checkpoints
  - explain
  - methodology
  - verify
  - rankings
  - schema
---

# IsAgentReady CLI: Agent Guidance

## Quick Start

```bash
# Scan a website (auto-detects JSON when piped)
isagentready scan example.com

# Get results as JSON
isagentready results example.com --json

# Browse rankings
isagentready rankings --grade high --json
```

## Fix Loop

Use these steps to improve a site:

1. Get the failing checkpoints with the full contract fields:
   `isagentready results example.com --failing --json`
2. Read the detail of one checkpoint: `isagentready explain ia.a2a-agent-card --json`
3. Apply the steps in `fix.steps`.
4. Check the result: `isagentready verify ia.a2a-agent-card example.com --json`

Each checkpoint has a stable id (`ia.<slug>`) and a legacy id (`4.3`). All commands accept both. In scan results, `id` is the legacy id and `stable_id` is the stable id.

The contract fields for each checkpoint are `stage` (find, read, act), `strength` (MUST, SHOULD, MAY or null), `evidence_type`, `ar_practice_ids`, `ar_mapping`, `failure`, `fix`, `verify`, `aggregate` and `methodology_version`. These fields are optional. An older server does not send them.

### Verify commands

`verify.command` is a read-only `curl` and `jq` check from the server. The CLI prints it and never runs it. Read the command before you run it. `verify.command` is null when no shell check is possible. `verify.rescan` is always present.

`isagentready verify` exits 5 when the checkpoint status is fail or partial, and 0 when it is pass or skip.

## Important Patterns

### Always use `--fields` to limit response size
Scan results include all checkpoints with details, recommendations, code examples and more. This output can be very large. Always use `--fields` to get only the data that you need. A dot path selects a nested field:

```bash
# Just the score and grade
isagentready results example.com --json --fields domain,overall_score,letter_grade

# Category labels and checkpoint status only
isagentready results example.com --json --fields domain,categories.label,categories.checkpoints.id,categories.checkpoints.status

# Failing checkpoints with the failure reason
isagentready results example.com --failing --json --fields categories.checkpoints.stable_id,categories.checkpoints.failure
```

### Use `--dry-run` before scanning
The `scan` command starts a real HTTP scan that takes 15-30 seconds. Use `--dry-run` to validate the URL first:

```bash
isagentready scan example.com --dry-run
```

### Use `--no-poll` for async workflows
If you do not need to wait for results, use `--no-poll`. The CLI starts the scan and stops immediately:

```bash
isagentready scan example.com --no-poll --json
# Later:
isagentready results example.com --json
```

### Use `--page-all` for complete rankings data
Stream all ranked websites as NDJSON (one JSON object per line):

```bash
isagentready rankings --page-all --fields domain,overall_score,letter_grade
```

### Runtime introspection
Use the `schema` command to discover available commands and parameters:

```bash
isagentready schema          # Full CLI schema as JSON
isagentready schema scan     # Schema for scan command only
```

The schema also gives the exit codes and the output JSON shape of each command.

## Output Modes

- **TTY (interactive terminal):** Human-friendly colored output with progress spinners
- **Non-TTY (piped/redirected):** JSON output. You do not need the `--json` flag
- **`OUTPUT_FORMAT=json`:** Environment variable to force JSON output
- **`--output json|text`:** Explicit output format override

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (network, API error) |
| 2 | Validation error (invalid input) |
| 3 | Scan failed |
| 4 | Not found (no scan for the domain, or an unknown checkpoint id) |
| 5 | `verify` only: the checkpoint status is fail or partial |

## Invariants

- Domains are automatically normalized (lowercase, no www, no trailing slash)
- URLs without a protocol are assumed to be `https://`
- The server caches scan results for about 1 hour. A repeated scan can return cached data, also with `verify --rescan`.
- Rankings are sorted by score (descending) by default
- The API is rate-limited (100 requests per IP per hour, and every poll counts). On HTTP 429 the JSON error has `retry_after` in seconds: wait that long, then retry. `scan` waits the server poll hint between polls and waits out a short 429 by itself.
- All timestamps are UTC ISO 8601

## Methodology and Scoring

- **Checkpoints:** a versioned set. Run `isagentready checkpoints` for the live list.
- **Stages:** Find, Read and Act, from the [agentready.org](https://www.agentready.org/) spec.
- **Strength and stage do not change the score.** The spec is separate from the scoring weights.
- **Score:** 0-100 (weighted average)
- **Weights and grade bands:** run `isagentready methodology --scoring`.
- **Changes:** run `isagentready methodology --changelog`.
- **Fail rates:** `aggregate.rates` comes from the latest published benchmark. `aggregate.benchmark_version` names it.

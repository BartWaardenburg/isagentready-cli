---
name: isagentready
description: CLI for scanning websites for AI agent readiness
version: 0.1.0
tools:
  - scan
  - results
  - rankings
  - schema
---

# IsAgentReady CLI — Agent Guidance

## Quick Start

```bash
# Scan a website (auto-detects JSON when piped)
isagentready scan example.com

# Get results as JSON
isagentready results example.com --json

# Browse rankings
isagentready rankings --grade high --json
```

## Important Patterns

### Always use `--fields` to limit response size
Scan results include 47 checkpoints with details, recommendations, code examples, and more. This can be very large. Always use `--fields` to request only what you need:

```bash
# Just the score and grade
isagentready results example.com --json --fields domain,overall_score,letter_grade

# Categories without checkpoints
isagentready results example.com --json --fields domain,overall_score,letter_grade,categories
```

### Use `--dry-run` before scanning
The `scan` command triggers a real HTTP scan that takes 15-30 seconds. Use `--dry-run` to validate the URL first:

```bash
isagentready scan example.com --dry-run
```

### Use `--no-poll` for async workflows
If you don't need to wait for results, use `--no-poll` to enqueue the scan and return immediately:

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

## Output Modes

- **TTY (interactive terminal):** Human-friendly colored output with progress spinners
- **Non-TTY (piped/redirected):** Automatically outputs JSON — no `--json` flag needed
- **`OUTPUT_FORMAT=json`:** Environment variable to force JSON output
- **`--output json|text`:** Explicit output format override

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (network, API error) |
| 2 | Validation error (invalid input) |
| 3 | Scan failed |
| 4 | Not found (no scan exists for domain) |

## Invariants

- Domains are automatically normalized (lowercase, no www, no trailing slash)
- URLs without a protocol are assumed to be `https://`
- Scan results are cached for ~1 hour — repeated scans may return cached data
- Rankings are sorted by score (descending) by default
- The API is rate-limited (100 requests per IP per hour, and every poll counts). On HTTP 429 the JSON error has `retry_after` in seconds: wait that long, then retry. `scan` waits the server poll hint between polls and waits out a short 429 by itself.
- All timestamps are UTC ISO 8601

## Scoring

- **47 checkpoints** across 5 weighted categories
- **Score:** 0-100 (weighted average)
- **Grades:** F (0-19), D (20-39), C (40-69), B (70-79), A (80-94), A+ (95-100)
- **Categories:** AI Content Discovery (30%), AI Search Signals (20%), Content & Semantics (20%), Agent Protocols (15%), Security & Trust (15%)

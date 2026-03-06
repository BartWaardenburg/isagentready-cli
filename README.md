# @isagentready/cli

Scan any website for AI agent readiness from your terminal. Get scores, letter grades, and actionable recommendations across 47 checkpoints.

Built for both humans and AI agents — auto-detects when piped and switches to JSON output.

```
$ isagentready scan example.com

  A+  example.com  98/100
  Scanned in 1.7s

  Categories

  ███████████████ 100%  AI Content Discovery (30% weight)
  █████████████░░  89%  AI Search Signals (20% weight)
  ███████████████ 100%  Content & Semantics (20% weight)
  ███████████████ 100%  Agent Protocols (15% weight)
  ███████████████ 100%  Security & Trust (15% weight)
```

## Install

```bash
npm install -g @isagentready/cli
```

Or use directly with npx:

```bash
npx @isagentready/cli scan example.com
```

## Commands

### `isagentready scan <url>`

Scan a website and wait for results.

```bash
isagentready scan example.com
isagentready scan https://example.com --verbose      # Show all 47 checkpoints
isagentready scan example.com --json                 # Machine-readable JSON output
isagentready scan example.com --dry-run              # Validate URL without scanning
isagentready scan example.com --no-poll              # Start scan without waiting
isagentready scan example.com --fields domain,overall_score,letter_grade
```

### `isagentready results <domain>`

Get the latest scan results for a domain.

```bash
isagentready results example.com
isagentready results example.com --verbose
isagentready results example.com --json --fields domain,overall_score,letter_grade
```

### `isagentready rankings`

Browse the AI agent readiness leaderboard.

```bash
isagentready rankings
isagentready rankings --page 2 --per-page 10
isagentready rankings --grade high                   # A/A+ only
isagentready rankings --search "example"
isagentready rankings --sort newest --json
isagentready rankings --page-all --fields domain,overall_score   # Stream all as NDJSON
```

### `isagentready schema [command]`

Dump CLI schema as JSON for runtime introspection by AI agents.

```bash
isagentready schema              # Full CLI schema
isagentready schema scan         # Schema for scan command only
```

## Agent-friendly features

This CLI follows the patterns from [Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/):

### Auto-detect non-TTY

When stdout is piped or redirected, the CLI automatically outputs JSON — no `--json` flag needed:

```bash
# Piped → auto-JSON
isagentready results example.com | jq '.overall_score'

# Interactive terminal → human-friendly colored output
isagentready results example.com
```

### Output format control

```bash
--json                       # Explicit JSON flag
--output json|text           # Explicit format override
OUTPUT_FORMAT=json           # Environment variable
```

### Field masks

Limit response size to stay within context windows:

```bash
isagentready results example.com --fields domain,overall_score,letter_grade
```

### NDJSON streaming

Stream all ranked websites as newline-delimited JSON:

```bash
isagentready rankings --page-all --fields domain,overall_score | wc -l
```

### Dry run

Validate inputs without hitting the API:

```bash
isagentready scan example.com --dry-run
```

### Runtime introspection

AI agents can discover capabilities at runtime:

```bash
isagentready schema          # All commands as JSON
isagentready schema scan     # Single command schema
```

### Input validation

All inputs are validated against adversarial patterns (path traversal, control characters, URL-encoded sequences, embedded query params).

### Meaningful exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (network, API) |
| 2 | Validation error (invalid input) |
| 3 | Scan failed |
| 4 | Not found |

### Agent guidance

Ships with `CONTEXT.md` — a structured guidance file that AI agents can read to understand CLI conventions, invariants, and best practices.

## What it checks

The scanner evaluates 47 checkpoints across 5 weighted categories:

| Category | Weight | What it checks |
|---|---|---|
| AI Content Discovery | 30% | robots.txt, AI crawlers, sitemap, llms.txt, meta robots |
| AI Search Signals | 20% | JSON-LD, Schema.org, entity linking, FAQPage, author attribution |
| Content & Semantics | 20% | SSR, heading hierarchy, semantic HTML, ARIA, accessibility |
| Agent Protocols | 15% | WebMCP, A2A, MCP discovery, OpenAPI, agents.json |
| Security & Trust | 15% | HTTPS, HSTS, CSP, security headers, CORS |

## Requirements

- Node.js 18+ (uses native `fetch`)

## License

MIT

# isagentready

Scan any website for AI agent readiness from your terminal. Get scores, letter grades, and fix steps for each checkpoint. Run `isagentready checkpoints` for the live list of checkpoints.

Built for both humans and AI agents. When you pipe the output, the CLI changes to JSON output.

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
npm install -g isagentready
```

Or use directly with npx:

```bash
npx isagentready scan example.com
```

## SDK

The same package also provides a typed SDK for Node.js 18 and later. Import
`isagentready/sdk` to use it without starting the CLI.

```bash
npm install isagentready
```

```javascript
import { createClient } from "isagentready/sdk";

const client = createClient();
const result = await client.getCheckpoint("ia.robots-txt");

if (result.ok) {
  console.log(result.data.name, result.data.fix?.summary);
} else {
  console.error(result.error.message, result.error.retryAfter);
}
```

Each method returns `{ ok: true, data }` or `{ ok: false, error }`. Errors
include `kind`, `message`, HTTP `status` when available, and a `retryAfter`
wait in seconds when the server supplies one. The SDK checks response envelopes;
it does not certify report content or execute checkpoint verification commands.
Unavailable scores remain `null`, distinct from measured zeroes.

Use `getScanResults(domain, { contract: true })` to read a cached report.
`listCheckpoints`, `getCheckpoint`, `getMethodology`,
`getMethodologyChangelog`, `getMethodologyScoring` and `getRankings` read the
public API. These calls need no API key. `getScanResults` accepts
`{ failing: true }`, and `listCheckpoints` accepts the CLI's catalog filters.

```javascript
const started = await client.startScan("https://example.com");
if (started.ok) {
  const report = await client.pollUntilComplete(started.data.domain, undefined, {
    firstWaitSeconds: started.data.retry_after,
  });
  if (report.ok) console.log(report.data.overall_score);
}
```

Starting and polling scans consume API quota. Polling respects server wait
hints and has a deadline. Set a separate origin or fetch-compatible transport
with `createClient({ baseUrl, fetch })`; each client keeps its own configuration.
`baseUrl` must be an HTTP(S) origin without credentials, a path, query or fragment.

## Commands

### `isagentready scan <url>`

Scan a website and wait for results.

```bash
isagentready scan example.com
isagentready scan https://example.com --verbose      # Show all checkpoints, fix steps and verify commands
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
isagentready results example.com --failing                       # Only fail and partial checkpoints that apply
isagentready results example.com --checkpoint ia.a2a-agent-card  # One checkpoint (stable or legacy id)
```

For failing checkpoints, the text output shows the stable id, the stage and the strength. `--verbose` adds the fix steps and the verify command.

### `isagentready checkpoints`

List the checkpoint definitions of the current methodology: stable id, legacy id, stage (Find, Read, Act), strength (MUST, SHOULD, MAY) and name.

```bash
isagentready checkpoints
isagentready checkpoints --stage act --strength MUST
isagentready checkpoints --category agent_protocols --json
isagentready checkpoints --ar AR-FIND-01
```

### `isagentready explain <id>`

Show one checkpoint: why it matters, the fix steps, the verify command, the [agentready.org](https://www.agentready.org/) practice mapping and the fail rate in the latest benchmark. The id can be a stable id (`ia.robots-txt`) or a legacy id (`1.1`, or `te.1` for a training exposure check).

```bash
isagentready explain ia.a2a-agent-card
isagentready explain 4.3 --json
```

### `isagentready methodology`

Show the versioned methodology. The scoring weights are a separate document.

```bash
isagentready methodology                       # Current version, stages, latest change
isagentready methodology --version 2026-09-02
isagentready methodology --changelog
isagentready methodology --scoring             # Category weights and grade bands
```

### `isagentready verify <id> <domain>`

Get the status of one checkpoint and print its read-only verify command. The CLI prints the command for you to run. It never runs the command. The exit code is 5 when the checkpoint applies to the site and its status is fail or partial. In all other cases the exit code is 0. The `outcome` field in the JSON output tells you why: `pass`, `fail`, `not_applicable`, `skipped` or `informational`.

```bash
isagentready verify ia.a2a-agent-card example.com
isagentready verify ia.a2a-agent-card example.com --rescan   # Start a new scan first
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

The schema also describes the output JSON shape of each command.

## Agent-friendly features

This CLI follows the patterns from [Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/):

### Auto-detect non-TTY

When you pipe or redirect stdout, the CLI writes JSON. You do not need the `--json` flag:

```bash
# Piped: JSON output
isagentready results example.com | jq '.overall_score'

# Interactive terminal: colored text output
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
isagentready results example.com --failing --fields domain,categories.checkpoints.stable_id,categories.checkpoints.failure
```

A dot path selects a nested field. A path step into an array applies the rest of the path to each element.

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
| 5 | `verify`: the checkpoint applies to the site and its status is fail or partial |

### Agent guidance

The package includes `CONTEXT.md`. This file tells AI agents the CLI conventions, invariants and good practices.

## What it checks

The scanner uses a versioned set of checkpoints. It puts each checkpoint in one stage of the [agentready.org](https://www.agentready.org/) spec: Find, Read or Act. Run `isagentready checkpoints` for the live list, and `isagentready methodology --scoring` for the current category weights.

| Category | Examples |
|---|---|
| AI Content Discovery | robots.txt, AI crawlers, sitemap, llms.txt, meta robots |
| AI Search Signals | JSON-LD, Schema.org, entity linking, FAQPage, author attribution |
| Content & Semantics | SSR, heading hierarchy, semantic HTML, ARIA, accessibility |
| Agent Protocols | WebMCP, A2A, MCP discovery, OpenAPI, agents.json |
| Security & Trust | HTTPS, HSTS, CSP, security headers, CORS |

## Requirements

- Node.js 18+ (uses native `fetch`)

## License

MIT

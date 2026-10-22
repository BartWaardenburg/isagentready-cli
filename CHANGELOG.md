# Changelog

## Unreleased

### Features

* add the `checkpoints` command. It lists the checkpoint definitions with stable id, legacy id, stage, strength and AR mapping. Filters: `--stage`, `--strength`, `--category` and `--ar`.
* add the `explain <id>` command. It shows why a checkpoint matters, the fix steps, the verify command, the agentready.org mapping and the benchmark fail rate.
* add the `methodology` command with `--version`, `--changelog` and `--scoring`.
* add the `verify <id> <domain>` command. It shows the status of one checkpoint and prints the read-only verify command. The CLI never runs the command. The exit code is 5 when the status is fail or partial.
* add `--failing` and `--checkpoint <id>` to `results`.
* `--fields` accepts dot paths, for example `categories.checkpoints.status`.
* the text output shows the stable id, stage and strength of failing checkpoints. `--verbose` adds fix steps and verify commands. The default output has the same length as before.
* `schema` lists the exit codes and the output JSON shape of each command.
* all checkpoint contract fields are optional, so the CLI works with servers that do not send them.

### Bug Fixes

* `methodology --version` no longer prints the CLI version. Subcommand options are now parsed by the subcommand.

## [0.2.2](https://github.com/BartWaardenburg/isagentready-cli/compare/v0.2.1...v0.2.2) (2026-10-09)


### Bug Fixes

* respect Retry-After when polling and on rate limits ([#1](https://github.com/BartWaardenburg/isagentready-cli/issues/1)) ([392cc9a](https://github.com/BartWaardenburg/isagentready-cli/commit/392cc9a99154ee8c9b9ecce077be027fbd0cffb9))

## [0.2.1](https://github.com/BartWaardenburg/isagentready-cli/compare/v0.2.0...v0.2.1) (2026-03-06)


### Bug Fixes

* resolve 5 bugs found during exhaustive CLI option testing ([c73f596](https://github.com/BartWaardenburg/isagentready-cli/commit/c73f596a67f9d82e1ddca5d3b8c46ed28316ebc5))

# 0.2.0 (2026-03-06)


### Features

* initial release — AI agent readiness CLI ([c912e82](https://github.com/BartWaardenburg/isagentready-cli/commit/c912e82f76e21e001736fbdeb579a854e71bccf9))

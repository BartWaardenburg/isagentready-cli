# Changelog

# [0.3.0](https://github.com/BartWaardenburg/isagentready-cli/compare/v0.2.2...v0.3.0) (2026-10-23)


### Bug Fixes

* give clearer verify and explain messages on the current server ([58684c2](https://github.com/BartWaardenburg/isagentready-cli/commit/58684c212edbdfe6c4664de037d694e9a00a6dcb))
* handle te ids, non-applicable checkpoints and unsafe placeholder values ([5018f52](https://github.com/BartWaardenburg/isagentready-cli/commit/5018f5252e8ad4eeddcd2ef57ad99e31f4e8ff4f))


### Features

* add the `checkpoints` command. It lists the checkpoint definitions with stable id, legacy id, stage, strength and AR mapping. Filters: `--stage`, `--strength`, `--category`, `--ar` and `--version`.
* add the `explain <id>` command. It shows why a checkpoint matters, the fix steps, the verify command, the agentready.org mapping and the benchmark fail rate.
* add the `methodology` command with `--version`, `--changelog` and `--scoring`. `--changelog` covers all versions, so it cannot be used with `--version` or `--scoring`.
* add the `verify <id> <domain>` command. It shows the status of one checkpoint and prints the read-only verify command. The CLI never runs the command. The exit code is 5 when the checkpoint applies to the site and its status is fail or partial. The `outcome` field tells an agent why the exit code is 0: `pass`, `not_applicable`, `skipped` or `informational`.
* `explain`, `verify` and `results --checkpoint` accept the training exposure ids `te.1` to `te.5`. `verify` and `results --checkpoint` find these checks in `training_exposure.checks`.
* add `--failing` and `--checkpoint <id>` to `results`. `--failing` leaves out checkpoints that do not apply to the site.
* `--fields` accepts dot paths, for example `categories.checkpoints.status`.
* the text output shows the stable id, stage and strength of failing checkpoints. `--verbose` adds fix steps and verify commands. The default output has the same length as before.
* `schema` lists the exit codes and the output JSON shape of each command.
* all checkpoint contract fields are optional, so the CLI works with servers that do not send them.
* the CLI fills `{domain}` and `{origin}` in a verify command only with a strict host name or origin. For any other value the placeholder stays in the command.

### Breaking Changes

* options after a subcommand now belong to that subcommand. This lets `methodology --version` select a methodology version. As a result, `isagentready results example.com --version` now gives an unknown option error. Use `isagentready --version` for the CLI version.

## [0.2.2](https://github.com/BartWaardenburg/isagentready-cli/compare/v0.2.1...v0.2.2) (2026-10-09)


### Bug Fixes

* respect Retry-After when polling and on rate limits ([#1](https://github.com/BartWaardenburg/isagentready-cli/issues/1)) ([392cc9a](https://github.com/BartWaardenburg/isagentready-cli/commit/392cc9a99154ee8c9b9ecce077be027fbd0cffb9))

## [0.2.1](https://github.com/BartWaardenburg/isagentready-cli/compare/v0.2.0...v0.2.1) (2026-03-06)


### Bug Fixes

* resolve 5 bugs found during exhaustive CLI option testing ([c73f596](https://github.com/BartWaardenburg/isagentready-cli/commit/c73f596a67f9d82e1ddca5d3b8c46ed28316ebc5))

# 0.2.0 (2026-03-06)


### Features

* initial release — AI agent readiness CLI ([c912e82](https://github.com/BartWaardenburg/isagentready-cli/commit/c912e82f76e21e001736fbdeb579a854e71bccf9))

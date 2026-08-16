<!--
Copyright (c) 2026 wordgitet

SPDX-License-Identifier: 0BSD
-->

# Contributing

`tsed` is a POSIX-platform research toy with a deliberately serious
implementation. Contributions should preserve both halves of that description:
the documentation may smile, while observable editor behavior stays precise.

## Development workflow

The minimum Bun version is not known. The current development environment uses
Bun 1.3.14.

From the repository root:

```console
$ bun install
$ bun run build
$ bun test
$ bun run typecheck
$ bun run check:style
```

Build before testing. The `TOUR` transcript tests intentionally execute the
built `dist/ed` command and fail when it is absent or stale.

Useful aggregate and focused commands are:

```console
$ bun run check
$ bun run test:tour
```

`bun run check` type-checks, builds, runs all tests, and checks source style.
`bun run test:tour` runs the executable documentation examples and also
requires a prior build.

## Changes

- Follow [AGENTS.md](AGENTS.md). In particular, project-owned TypeScript names
  use `snake_case`, functions use style(9) brace placement, and source lines
  should remain within 80 columns.
- Add or update tests when observable editor behavior changes.
- Update [TOUR](TOUR) when a command, option, module boundary, limitation,
  or transcript changes.
- Keep POSIX-platform assumptions explicit. Do not add accidental Windows
  compatibility code to an otherwise POSIX interface.
- Keep private or restrictively licensed test suites, assertion text, journals,
  and derived artifacts outside this repository. Public tests must stand on
  repository-owned fixtures and behavior.

## Submitting a change

Before submitting, build the editor and run `bun run check`. Explain behavior
changes and validation in the commit or pull request. Keep style-only work
separate from behavior changes when practical.

## Commit messages

Use imperative, short subjects without a required prefix such as `feat:` or
`fix:`. Do not end the subject with a period. Leave one blank line after the
subject, wrap the body to about 72 columns, and explain both what changed and
why.

For a focused change:

```text
Add pending input interruption

Wake the line reader when a signal requests editor shutdown so the process
can leave a terminal without waiting for another input byte.

Signed-off-by: wordgitet <wordatet@linuxmail.org>
```

When a commit touches multiple meaningful areas, finish the body with an
`Areas:` section. Trailers follow that section, with `Signed-off-by:` last:

```text
Add initial TypeScript ed implementation

Build a POSIX-oriented editor with Bun, tests, executable tour transcripts,
and project documentation. Establish the implementation and its validation
workflow before publishing the repository.

Areas:
- editor and parser
- tests and tour
- documentation and project policy

AI-assisted-by: OpenAI Codex (GPT-5.6 Sol, GPT-5.6 Luna)
Signed-off-by: wordgitet <wordatet@linuxmail.org>
```

## AI disclosure policy

Meaningful AI assistance used for code, tests, documentation, or review must be
disclosed in the associated commit message or pull request. Ordinary
autocomplete and spelling correction do not require a disclosure.

At minimum, name:

1. the AI tool; and
2. the model.

The human contributor remains responsible for correctness, security, licensing,
tests, and final review. Disclosure does not transfer authorship or
responsibility to the tool.

Example:

```text
AI-assisted-by: OpenAI Codex (GPT-5)
```

### Existing project disclosure

OpenAI Codex has assisted with implementation, tests, documentation, and
repository housekeeping under human direction and review. The documentation
and transcript-test contribution that introduced this policy used OpenAI Codex
with GPT-5. Earlier sessions did not consistently preserve model identifiers,
so this notice does not guess at them.

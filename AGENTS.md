STYLE(9-TS)                                  TypeScript Developer's Manual

NAME
     style9-typescript — style guide for TypeScript and Bun source files

DESCRIPTION
     This file adapts the discipline of FreeBSD style(9) to TypeScript.  It is
     intended for serious command-line and systems-oriented programs, including
     terminal editors.  The preferred line width is 80 characters, but a
     slightly longer line is acceptable when it is clearer.  Do not split text
     that is frequently grepped for, such as diagnostics, command names, or
     protocol strings.

     The rules in this document are defaults.  Existing code may use a
     different style; keep each logical unit internally consistent, and avoid
     style-only changes mixed with functional changes.

     /*
      * Style guide for TypeScript and Bun.
      * Based on FreeBSD KNF/style(9).
      */

COMMENTS
     Use // for short comments and /* ... */ for paragraphs or comments that
     must remain attached to a declaration.  Use /** ... */ only for exported
     API documentation.  Comments are real sentences and end with punctuation
     unless they are labels or fragments.

     // Read one complete command from the input stream.

     /*
      * Restore the terminal before returning control to the shell.  This must
      * also happen when the editor exits because of an exception or signal.
      */

     Comments that explain why code exists are preferred to comments that
     restate what the code does.  Diagnostic strings should be complete,
     stable, and kept on one source line whenever practical.
     Use one comment style consistently for single-line comments within a file
     and one style consistently for multiline comments within a file.

     Copyright and license headers use a block comment, followed by one blank
     line:

     /*
      * Copyright (c) 2026 John Q. Public
      *
      * SPDX-License-Identifier: BSD-2-Clause
      */

     Do not add copyright lines for trivial changes.  Preserve required
     copyright, SPDX, and foreign revision-identification lines when modifying
     imported code.  Do not add duplicate revision tags.

FILES AND MODULES
     Use .ts for TypeScript source files.  Use .tsx only when JSX is required.
     Keep one principal responsibility per file.  Names should describe the
     abstraction, not its implementation history.

     Imports are grouped, with one blank line between groups:

     1. External packages.
     2. Bun and Node built-ins.
     3. Local modules.

     Sort imports alphabetically within a group when doing so does not obscure
     a deliberate dependency order.  Prefer named exports and named imports.
     Avoid default exports because they make renaming and searching harder.

     Do not create global variables or rely on import-time side effects unless
     the module is explicitly an application entry point.  Keep initialization
     behind a function so tests and library users can control its lifetime.
     Do not import an entire namespace merely to avoid naming individual
     imports.  Import the smallest explicit surface needed by the module.

     import { describe, expect, test } from "bun:test";
     import { readFile } from "node:fs/promises";

     import { editor } from "./editor";
     import { parse_command } from "./parser";

     Do not use a barrel module merely to shorten imports.  A module should
     expose the smallest useful public surface.

NAMING
     Use snake_case (style(9)'s internal underscores) for variables, functions,
     methods, classes, interfaces, type aliases, namespaces, and module-local
     values.  Do not use camelCase or TitleCase for names owned by this
     project.  Use SCREAMING_SNAKE_CASE only for genuine constants whose names
     are part of a protocol or fixed external interface.

     Preserve the spelling of external APIs and formats.  For example,
     Bun.file, Array.prototype.forEach, noUncheckedIndexedAccess, and a JSON
     field required by another program keep their externally defined casing.

     Use descriptive names.  One-letter names are reserved for short-lived
     indices, coordinates, or conventional parser variables.

     const current_line = buffer.current_line();
     function parse_address(input: string): address { ... }
     class terminal_renderer { ... }

     Prefer names that distinguish related values:

     let start_line: number;
     let end_line: number;

     Do not use abbreviations unless they are well-known in the domain, such as
     fd, tty, cwd, POSIX, or UTF8.  Do not encode types in names.

TYPES
     Enable strict type checking.  The project must type-check without errors:

     {
             "compilerOptions": {
                     "strict": true,
                     "noUncheckedIndexedAccess": true,
                     "noImplicitOverride": true,
                     "noFallthroughCasesInSwitch": true
             }
     }

     Use const by default and let when reassignment is required.  Never use
     var.  Prefer inferred types for obvious local values and explicit types at
     module boundaries, exported declarations, and non-obvious state.

     Avoid any.  Use unknown at untrusted boundaries, then narrow it with a
     type guard or validation function.  Do not silence a type error with an
     assertion unless the invariant is established immediately beside it.

     Prefer undefined for absent values.  Use null only when required by an
     external API or when null is a meaningful value distinct from absence.
     Test nullable values explicitly when the distinction matters.

     type result<T> =
             | { ok: true; value: T }
             | { ok: false; error: Error };

     Discriminated unions are preferred to boolean combinations whose valid
     states cannot be expressed by the type system.  Keep impossible states
     unrepresentable where practical.

     Use interfaces for extendable object contracts and type aliases for unions,
     tuples, mapped types, and local structural compositions.  Do not create a
     type alias solely to rename a primitive.

     Major interfaces, classes, and state types belong near the top of the
     file where they are used, or in a separate module when shared.  List class
     and interface members in use order, keeping related members together and
     implementation details after the public contract.

     Enum members and fixed discriminant values are uppercase when they are
     declared as named constants.  Prefer string-literal unions when an enum
     would add no runtime behavior.  Use satisfies to check object shapes
     without widening the object's useful inferred type.

     TypeScript supplies declarations through modules and exported types; it
     does not need C-style function prototypes.  Export the narrowest public
     contract.  Avoid declarations inside functions unless the nested function
     must close over local state; otherwise define it at module scope.

FUNCTIONS AND METHODS
     Function declarations follow style(9).  Put the function keyword on its
     own line, put the declaration and return type on the following line(s),
     and put the opening brace on its own line:

     function
     advance_cursor(buffer: buffer, count: number): void
     {
             buffer.cursor += count;
     }

     Keep functions short enough that their complete control flow is visible.
     A function should have one clear responsibility.  Prefer early returns
     for invalid or exceptional cases, but do not obscure the normal path with
     excessive guard clauses.

     Use function declarations for named operations and arrow functions for
     callbacks, small expressions, and functions that intentionally capture
     lexical this.  Do not use arrow functions merely as a general replacement
     for declarations.

     Class methods use the same brace placement as function declarations:

     class editor {
             move_cursor(count: number): void
             {
                     this.cursor += count;
             }
     }

     Public functions must document their inputs, outputs, and failure modes
     when those facts are not obvious from their types.  Avoid optional
     parameters when separate functions or an options object make the contract
     clearer.

     Long parameter lists are wrapped with a four-space continuation indent:

     function
     open_file(
         path: string,
         flags: open_flags,
     ): Promise<file_handle>
     {
             return open(path, flags);
     }

     Variable arguments use rest parameters.  The rest parameter should be
     readonly when the function does not mutate the received values:

     function
     format_message(format: string, ...values: readonly unknown[]): string
     {
             return interpolate(format, values);
     }

     Prefer readonly parameters and data where mutation is not required:

     function
     render_lines(lines: readonly string[]): string
     {
             return lines.join("\n");
     }

CONTROL FLOW
     Use braces for all multi-statement branches.  Single-statement branches
     may omit braces only when doing so improves clarity and the file is
     consistent.  Braces are required when a branch contains a comment, spans
     multiple lines, or is likely to gain another statement.

     if (command == null)
             return;

     if (range.start > range.end) {
             throw new Error("invalid address range");
     }

     Put else and catch on the closing brace of the preceding block:

     if (result.ok) {
             use(result.value);
     } else {
             report(result.error);
     }

     Use strict equality.  A deliberate nullish check may use == null when
     both null and undefined are valid absent values; otherwise use === and !==.
     Do not rely on truthiness for numbers, strings, or objects when zero, an
     empty string, or an empty collection has a different meaning.

     switch statements must be exhaustive for discriminated unions.  Do not
     fall through.  If fallthrough is intentional, use a comment that says
     FALLTHROUGH immediately before the next case and configure the checker to
     accept that convention.  Case labels are not indented; case bodies are
     indented one level:

     switch (command.kind) {
     case "append":
             append_lines(command.lines);
             break;
     case "quit":
             quit_editor();
             break;
     default:
             assert_never(command);
     }

     for (;;) {
             process_input();
     }

     Use for (;;) for forever loops.  Do not use while (true) for that purpose.

     Declare local values near their first use, before the statements that
     depend on them.  Do not hide a declaration in a nested block merely to
     shorten its apparent lifetime.  Avoid shadowing an outer name.

     Use for...of for values and for...in only for deliberately enumerating
     object keys.  Do not use Array.prototype.forEach for control flow that
     needs await, break, continue, or exception handling.

WHITESPACE AND PUNCTUATION
     Indentation is an eight-column tab.  Continuation lines use four spaces
     when that improves alignment.  Do not put spaces before tabs or use more
     spaces than a tab would produce.  Do not add trailing whitespace.  Use one
     blank line between logical sections and no unnecessary blank lines inside
     a small function.

     Use semicolons.  Use double-quoted strings by default and single quotes
     only when they avoid escaping or match an external format.  Use template
     literals for interpolation, not string concatenation.

     Put a space after commas and around binary operators.  Do not put spaces
     inside parentheses, brackets, or braces used for expressions.  Keep a
     trailing comma in multiline arrays, objects, imports, parameters, and
     argument lists.

     Do not put whitespace between a function name and its opening parenthesis.
     Do not parenthesize a return expression unless the parentheses clarify
     precedence or are required by the expression.

     Unary operators do not take spaces; binary and conditional operators do.
     Avoid type assertions and non-null assertions.  When an assertion is
     unavoidable, keep the invariant that justifies it next to the assertion.
     Use ! only for boolean negation; do not use it as a substitute for an
     explicit empty, zero, null, or undefined check.

     Wrap long expressions at a logical operator and indent continuation lines
     by four spaces.  Keep operators at the end of the preceding line.

     const command = parse(input, { allow_comments: false });
     const lines = [
             "one",
             "two",
     ];

     Parentheses should express precedence or clarify a potentially confusing
     expression.  Do not add redundant parentheses mechanically.

OBJECTS, ARRAYS, AND MUTATION
     Prefer const objects and arrays.  Do not mutate an object owned by another
     module unless mutation is part of its documented contract.  For editor
     state, centralize mutation in the state-owning class or reducer so that
     undo, redraw, and invariants cannot be bypassed.

     Prefer readonly views at boundaries.  Copy data when ownership is unclear;
     do not spread large buffers merely to appear immutable.

     Use Map and Set when their semantics are required.  Do not use plain
     objects as maps for arbitrary user-controlled keys.

ERRORS AND ASYNC CODE
     Throw Error instances, never strings.  Add context while preserving the
     original cause:

     throw new Error(`cannot open ${path}`, { cause: error });

     Catch errors only when the caller can recover, translate the error, or add
     useful context.  Do not catch an error merely to log and rethrow it.

     Handle every Promise.  Await asynchronous operations or explicitly mark a
     deliberately detached operation with a comment explaining its lifetime
     and error handling.  Prefer async/await over promise chains for sequences
     of operations.

     Use Bun.file(path).text() for simple reads and Bun.write(path, data) for
     simple writes.  Use node:fs/promises when lower-level file flags,
     descriptors, or directory operations are required.  File writes that
     replace user data must define their behavior for partial failure.

COMMAND-LINE PROGRAMS
     The main routine should validate arguments, initialize resources, run the
     program, and arrange cleanup.  Keep parsing and business logic outside
     main so they can be tested independently.

     The comment before main should describe what the program does.  Options
     without operands are listed first in alphabetical order, followed by
     options with operands in alphabetical order, required arguments, and
     optional arguments.  Validate numeric arguments completely; reject
     trailing characters and values outside the supported range.

     Exit with status 0 on success and status 1 on ordinary failure unless a
     documented interface requires another status.  Diagnostics go to stderr.
     Exact machine-readable or editor output goes to stdout.  Use
     process.stdout.write when automatic spacing or a newline from console.log
     would change the protocol.  Do not mix debug logging into a terminal
     protocol or screen renderer.

     Usage text should be stable and concise.  Options should be documented in
     the same order in which they are presented by the program.

TERMINAL PROGRAMS
     Terminal state is a resource.  If raw mode, an alternate screen, hidden
     cursor state, or signal handlers are enabled, restore all of them in a
     finally block and on every relevant termination path.

     Keep input decoding, editor state transitions, and rendering separate:

     bytes -> key events -> state transition -> screen model -> terminal output

     Do not write directly to the terminal from command handlers.  Render from
     state so redraws are deterministic and testable.  Treat escape sequences
     as input data until they have been completely decoded; never assume that
     one read contains one key.

     Resize handling must update the terminal dimensions and redraw from the
     current state.  Unicode display width is not the same as JavaScript string
     length.  Cursor movement and horizontal scrolling must use display cells.

     A terminal editor must not leave the user's shell in raw mode after an
     exception, SIGINT, SIGTERM, or normal exit.

TESTING AND CHECKING
     New code should pass all of the following before review:

     bun test
     bunx tsc --noEmit

     Add unit tests for parsers, address calculations, state transitions,
     substitutions, and rendering decisions.  Add integration tests for file
     I/O and process behavior.  Use a PTY for interactive terminal tests; a
     pipe is not an adequate substitute for raw-mode, resize, or signal tests.

     For POSIX utilities and editors, test against the relevant conformance
     suite.  Record the suite revision, target path, command, environment, PTY
     mode, and journal result.  Do not treat a runner exit status alone as
     evidence of conformance; distinguish PASS, FAIL, UNTESTED, and harness or
     environment failures.

     Keep licensed suite sources, assertion text, credentials, and journals
     private.  Do not vendor them into the source repository.

TOOLING AND REVIEW
     Run the compiler, tests, and an appropriate static checker before review.
     Any formatter must be configured not to rewrite the function-brace,
     snake_case, indentation, or line-width rules in this document.  Do not
     combine formatting-only changes with functional changes.  If a
     formatting-only commit is necessary, record it in .git-blame-ignore-revs.

COMMIT MESSAGES
     Use imperative mood in the subject.  Keep the subject short, do not end
     it with a period, and leave one blank line after it.  Do not use a
     required prefix such as feat: or fix:.

     Wrap body text to about 72 columns.  The body explains both what changed
     and why it changed.  When a commit touches multiple meaningful areas,
     finish the body with an Areas: section.  Keep Signed-off-by: as the last
     trailer.  Put required AI disclosure in an AI-assisted-by: trailer before
     it or in the associated pull request.

     A focused commit has this shape:

     Add pending input interruption

     Wake the line reader when a signal requests editor shutdown so the
     process can leave a terminal without waiting for another input byte.

     Signed-off-by: wordgitet <wordatet@linuxmail.org>

     A commit covering multiple meaningful areas has this shape:

     Add initial TypeScript ed implementation

     Build a POSIX-oriented editor with Bun, tests, executable tour
     transcripts, and project documentation.  Establish the implementation
     and its validation workflow before publishing the repository.

     Areas:
     - editor and parser
     - tests and tour
     - documentation and project policy

     AI-assisted-by: OpenAI Codex (GPT-5.6 Sol, GPT-5.6 Luna)
     Signed-off-by: wordgitet <wordatet@linuxmail.org>

IMPLEMENTATION DISCIPLINE
     Prefer the simplest data structure that preserves the required semantics.
     Do not optimize terminal rendering, parsing, or buffer operations without
     a measured problem and a regression test.

     Keep compatibility behavior at the boundary.  The editor core should use
     clear internal types; POSIX command syntax, exit codes, diagnostic text,
     and terminal escape sequences should be handled by explicit adapters.

     Do not mix broad formatting changes with functional changes.  When a
     substantial portion of a logical unit is changed, bring that unit into
     compliance as part of the same review or make the style-only change in a
     separate commit.

NON-APPLICABLE C RULES
     The following style(9) rules are intentionally not copied literally:
     preprocessor directives, C include ordering, pointers and references,
     NULL, malloc/free, sizeof, err(3)/warn(3), C prototypes, typedef rules,
     queue(3) macros, K&R declarations, and compiler branch-prediction hints.
     Their TypeScript equivalents are module imports, strict types, managed
     object ownership, Error instances, exported contracts, Map/Set, and the
     runtime and compiler rules above.  Do not reintroduce a C rule merely to
     make TypeScript look like C.

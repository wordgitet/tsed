/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface encoded_data {
	encoding: "utf8" | "base64";
	data: string;
}

export interface portable_fixture {
	path: string;
	data: encoded_data;
}

export type portable_action =
	| { kind: "wait"; text: string }
	| { kind: "write"; data: encoded_data }
	| { kind: "signal"; signal: "SIGINT" | "SIGQUIT" | "SIGHUP" };

export interface expected_file {
	path: string;
	data: encoded_data;
}

export interface expected_outcome {
	status: expected_status;
	stdout?: encoded_data;
	stderr?: encoded_data;
	stdout_contains?: readonly encoded_data[];
	stderr_contains?: readonly encoded_data[];
	stdout_minimum_bytes?: number;
	stderr_minimum_bytes?: number;
	transcript_contains?: readonly string[];
	files?: readonly expected_file[];
}

export type expected_status = number | "nonzero" | "any";

export interface portable_case_v2 {
	name: string;
	requirement: string;
	mode: "pipe" | "pty";
	arguments: readonly string[];
	environment?: Readonly<Record<string, string>>;
	stdin?: encoded_data;
	actions?: readonly portable_action[];
	fixtures?: readonly portable_fixture[];
	expect: readonly expected_outcome[];
	timeout_ms?: number;
}

export interface portable_corpus_v2 {
	format: "portable-ed-corpus";
	version: 2;
	license: "0BSD";
	standard: "POSIX.1-2024";
	placeholder: "@TMP@";
	cases: readonly portable_case_v2[];
}

export interface posix_requirement {
	id: string;
	section: string;
	summary: string;
	disposition: "covered" | "platform-dependent" | "permitted-choice";
	coverage: readonly string[];
}

export interface posix_requirements {
	format: "tsed-posix-requirements";
	version: 1;
	standard: "POSIX.1-2024";
	source: string;
	requirements: readonly posix_requirement[];
}

const STANDARD_SOURCE =
	"https://pubs.opengroup.org/onlinepubs/9799919799.2024edition/" +
	"utilities/ed.html";

export function
build_posix_corpus(): portable_corpus_v2
{
	const cases: portable_case_v2[] = [];

	add_address_cases(cases);
	add_change_state_cases(cases);
	add_delimiter_cases(cases);
	add_input_and_regex_cases(cases);
	add_command_semantics_cases(cases);
	add_file_cases(cases);
	add_output_cases(cases);
	add_process_cases(cases);
	add_shell_cases(cases);
	add_terminal_cases(cases);

	return {
		format: "portable-ed-corpus",
		version: 2,
		license: "0BSD",
		standard: "POSIX.1-2024",
		placeholder: "@TMP@",
		cases,
	};
}

export function
build_posix_requirements(): posix_requirements
{
	return {
		format: "tsed-posix-requirements",
		version: 1,
		standard: "POSIX.1-2024",
		source: STANDARD_SOURCE,
		requirements: requirement_rows.map((row) => ({
			id: row[0],
			section: row[1],
			summary: row[2],
			disposition: row[3],
			coverage: row[4],
		})),
	};
}

function
add_address_cases(cases: portable_case_v2[]): void
{
	const rows: readonly (readonly [string, string, string])[] = [
		[",,p", "four\n", "repeated-leading-comma"],
		[";;p", "four\n", "repeated-leading-semicolon"],
		[",;p", "four\n", "mixed-leading-comma-semicolon"],
		[";,p", "four\n", "mixed-leading-semicolon-comma"],
		["1,,3p", "one\ntwo\nthree\n", "omitted-middle-comma"],
		["1;;3p", "one\ntwo\nthree\n", "omitted-middle-semicolon"],
		["1,2,4p", "two\nthree\nfour\n", "discard-leading-address"],
		["1;/three/;+1p", "three\nfour\n", "evaluate-before-discard"],
		["1 +1 +1p", "three\n", "blank-separated-positive-offsets"],
		["4 -1 -1p", "two\n", "blank-separated-negative-offsets"],
	];

	for (const [command, stdout, name] of rows) {
		add_pipe_case(cases, {
			name: `issue8/address/${name}`,
			requirement: "address.separators",
			stdin: `${four_line_setup()}${command}\nQ\n`,
			stdout,
		});
	}
}

function
add_change_state_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "issue8/change-state/warning-survives-print",
		requirement: "buffer.change-state",
		stdin: "a\nabc\n.\nq\np\nq\n",
		stdout: "?\nabc\n",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/new-change-rearms-warning",
		requirement: "buffer.change-state",
		stdin: "a\nabc\n.\nq\ns/a/a/\nq\nq\n",
		stdout: "?\n?\n",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/undo-is-a-change",
		requirement: "command.undo",
		stdin: "a\nabc\n.\nu\nq\nq\n",
		stdout: "?\n",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/global-no-change-undo-noop",
		requirement: "command.undo",
		stdin: "a\none\ntwo\n.\ng/missing/d\nu\n1,$p\nQ\n",
		stdout: "one\ntwo\n",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/empty-append-is-unchanged",
		requirement: "command.append",
		stdin: "a\n.\nq\n",
		stdout: "",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/empty-insert-is-unchanged",
		requirement: "command.insert",
		stdin: "0i\n.\nq\n",
		stdout: "",
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/full-write-clears-change",
		requirement: "command.write",
		stdin: "a\nabc\n.\nw @TMP@/saved\nq\n",
		stdout: "",
		files: [{ path: "saved", data: utf8("abc\n") }],
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/warned-edit-takes-effect",
		requirement: "command.edit",
		stdin: "a\nold\n.\nq\ne @TMP@/replacement\np\nq\n",
		stdout: "?\nnew\n",
		fixtures: [
			{ path: "replacement", data: utf8("new\n") },
		],
	});
	add_pipe_case(cases, {
		name: "issue8/change-state/no-op-substitution-is-a-change",
		requirement: "command.substitute",
		arguments: ["-s", "@TMP@/input"],
		stdin: "s/a/a/\nq\nq\n",
		stdout: "?\n",
		fixtures: [{ path: "input", data: utf8("a\n") }],
	});
}

function
add_delimiter_cases(cases: portable_case_v2[]): void
{
	const rows: readonly (readonly [string, string, string, string])[] = [
		["s/abc/ABC", "ABC\n", "command.substitute", "substitute"],
		["g/a", "alpha\nbeta\nabc\n", "command.global", "global"],
		["v/z", "alpha\nbeta\nabc\n", "command.global", "inverse-global"],
		["/beta", "beta\n", "address.search", "forward-search"],
		["?alpha", "alpha\n", "address.search", "backward-search"],
	];
	for (const [command, stdout, requirement, name] of rows) {
		add_pipe_case(cases, {
			name: `issue8/delimiter/omitted-${name}`,
			requirement,
			stdin: `a\nalpha\nbeta\nabc\n.\n${command}\nQ\n`,
			stdout,
		});
	}
	for (const [command, name] of [
		["G/alpha", "interactive-global"],
		["V/z", "interactive-inverse-global"],
	] as const) {
		add_pipe_case(cases, {
			name: `issue8/delimiter/omitted-${name}`,
			requirement: "command.global",
			stdin: `a\nalpha\n.\n${command}\np\nQ\n`,
			stdout: "alpha\nalpha\n",
		});
	}
	add_pipe_case(cases, {
		name: "issue8/delimiter/reject-omitted-substitute-pattern",
		requirement: "command.substitute",
		stdin: "a\nabc\n.\ns/abc\n",
		stdout: "?\n",
		status: "nonzero",
	});
}

function
add_input_and_regex_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "input/command-looking-lines-are-text",
		requirement: "input.text",
		stdin: "a\np\nq\nw\n!\n\\.\n.\n,p\nQ\n",
		stdout: "p\nq\nw\n!\n\\.\n",
	});
	add_pipe_case(cases, {
		name: "regex/delimiter-in-bracket-expression",
		requirement: "regex.bre",
		stdin: "a\na%b\nplain\n.\ng%[%]%p\nQ\n",
		stdout: "a%b\n",
	});
	add_pipe_case(cases, {
		name: "regex/escaped-address-delimiter",
		requirement: "regex.bre",
		stdin: "a\na/b\nplain\n.\n/a\\/b/p\nQ\n",
		stdout: "a/b\n",
	});
	add_pipe_case(cases, {
		name: "regex/null-expression-in-substitute",
		requirement: "regex.bre",
		stdin: "a\none two\n.\ns/o/O/\ns//X/\np\nQ\n",
		stdout: "One twX\n",
	});
}

function
add_command_semantics_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "address/intermediate-out-of-range",
		requirement: "address.basic",
		stdin: `${four_line_setup()}3 ---- 2p\nQ\n`,
		stdout: "one\n",
	});
	add_pipe_case(cases, {
		name: "address/mark-follows-moved-line",
		requirement: "address.mark",
		stdin: `${four_line_setup()}2ka\n2m$\n'ap\nQ\n`,
		stdout: "two\n",
	});
	add_pipe_case(cases, {
		name: "command/mark-preserves-current-line",
		requirement: "command.mark",
		stdin: `${four_line_setup()}2ka\n.=\nQ\n`,
		stdout: "4\n",
	});
	add_pipe_case(cases, {
		name: "command/delete-selects-following-line",
		requirement: "command.delete",
		stdin: `${four_line_setup()}2,3d\n.=\n,p\nQ\n`,
		stdout: "2\none\nfour\n",
	});
	add_pipe_case(cases, {
		name: "command/change-empty-final-range",
		requirement: "command.change",
		stdin: `${four_line_setup()}4c\n.\n.=\n,p\nQ\n`,
		stdout: "3\none\ntwo\nthree\n",
	});
	add_pipe_case(cases, {
		name: "command/one-address-join-is-noop",
		requirement: "command.join",
		stdin: `${four_line_setup()}2j\n.=\n,p\nQ\n`,
		stdout: "4\none\ntwo\nthree\nfour\n",
	});
	add_pipe_case(cases, {
		name: "command/join-selects-joined-line",
		requirement: "command.join",
		stdin: `${four_line_setup()}2,3j\n.=\n2p\nQ\n`,
		stdout: "2\ntwothree\n",
	});
	add_pipe_case(cases, {
		name: "command/move-range-to-start",
		requirement: "command.move",
		stdin: `${four_line_setup()}3,4m0\n.=\n,p\nQ\n`,
		stdout: "2\nthree\nfour\none\ntwo\n",
	});
	add_pipe_case(cases, {
		name: "command/copy-range-to-start",
		requirement: "command.copy",
		stdin: `${four_line_setup()}3,4t0\n.=\n,p\nQ\n`,
		stdout: "2\nthree\nfour\none\ntwo\nthree\nfour\n",
	});
	add_pipe_case(cases, {
		name: "command/delete-print-suffix",
		requirement: "command.suffix",
		stdin: `${four_line_setup()}2dp\nQ\n`,
		stdout: "three\n",
	});
	add_pipe_case(cases, {
		name: "command/move-number-suffix",
		requirement: "command.suffix",
		stdin: `${four_line_setup()}2m4n\nQ\n`,
		stdout: "4\ttwo\n",
	});
	add_pipe_case(cases, {
		name: "command/print-updates-current-line",
		requirement: "command.print",
		stdin: `${four_line_setup()}1,3p\n.=\nQ\n`,
		stdout: "one\ntwo\nthree\n3\n",
	});
	add_pipe_case(cases, {
		name: "command/equals-preserves-current-line",
		requirement: "command.equals",
		stdin: `${four_line_setup()}2=\n.=\nQ\n`,
		stdout: "2\n4\n",
	});
	add_pipe_case(cases, {
		name: "command/address-and-null-command",
		requirement: "command.null",
		stdin: `${four_line_setup()}2\n\nQ\n`,
		stdout: "two\nthree\n",
	});
	add_pipe_case(cases, {
		name: "command/quit-without-checking-discards-change",
		requirement: "command.quit",
		stdin: "a\none\n.\nQ\n",
		stdout: "",
	});
}

function
add_shell_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "shell/pathname-substitution",
		requirement: "command.shell",
		stdin: "f token\n!echo %\nQ\n",
		stdout: "token\necho token\ntoken\n",
	});
	add_pipe_case(cases, {
		name: "shell/repeat-previous-command",
		requirement: "command.shell",
		stdin: "!echo first\n!!\nQ\n",
		stdout: "first\necho first\nfirst\n",
	});
	add_pipe_case(cases, {
		name: "shell/write-does-not-clear-change-state",
		requirement: "command.write",
		stdin: "a\none\n.\nw !cat >/dev/null\nq\nq\n",
		stdout: "?\n",
		status: "any",
	});
	add_pipe_case(cases, {
		name: "shell/read-does-not-remember-pathname",
		requirement: "command.read",
		stdin: "f @TMP@/remembered\nr !printf 'one\\n'\nf\n,p\nQ\n",
		stdout: "@TMP@/remembered\n@TMP@/remembered\none\n",
	});
}

function
add_file_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "file/initial-byte-count",
		requirement: "operand.file",
		arguments: ["@TMP@/input"],
		stdin: "q\n",
		stdout: "4\n",
		fixtures: [{ path: "input", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "file/read-byte-count",
		requirement: "command.read",
		arguments: [],
		stdin: "r @TMP@/input\nQ\n",
		stdout: "4\n",
		fixtures: [{ path: "input", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "file/write-byte-count-and-content",
		requirement: "command.write",
		arguments: [],
		stdin: "a\none\n.\nw @TMP@/output\nq\n",
		stdout: "4\n",
		files: [{ path: "output", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "file/partial-write-preserves-change-state",
		requirement: "command.write",
		stdin: `${four_line_setup()}1,2w @TMP@/partial\nq\nq\n`,
		stdout: "?\n",
		status: "any",
		files: [{ path: "partial", data: utf8("one\ntwo\n") }],
	});
	add_pipe_case(cases, {
		name: "file/filename-set-and-print",
		requirement: "command.filename",
		stdin: "f @TMP@/name\nf\nq\n",
		stdout: "@TMP@/name\n@TMP@/name\n",
	});
	add_pipe_case(cases, {
		name: "file/filename-without-memory-errors",
		requirement: "command.filename",
		stdin: "f\n",
		stdout: "?\n",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "file/read-remembers-first-pathname",
		requirement: "command.read",
		stdin: "r @TMP@/input\nf\nQ\n",
		stdout: "@TMP@/input\n",
		fixtures: [{ path: "input", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "file/read-at-address-zero",
		requirement: "command.read",
		stdin: "a\ntwo\n.\n0r @TMP@/input\n,p\nQ\n",
		stdout: "one\ntwo\n",
		fixtures: [{ path: "input", data: utf8("one\n") }],
	});
}

function
add_output_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "output/list-preserves-carriage-return",
		requirement: "command.list",
		stdin: "a\ntext\r\n.\nl\nQ\n",
		stdout: "text\\r$\n",
	});
	add_pipe_case(cases, {
		name: "output/list-escapes-controls",
		requirement: "command.list",
		stdin: "a\n\u0007\b\t\u000b\f\r\\$\n.\nl\nQ\n",
		stdout: "\\a\\b\\t\\v\\f\\r\\\\\\$$\n",
	});
	add_pipe_case(cases, {
		name: "output/numbered-lines",
		requirement: "command.number",
		stdin: `${four_line_setup()}2,3n\nQ\n`,
		stdout: "2\ttwo\n3\tthree\n",
	});
	add_pipe_case(cases, {
		name: "output/prompt-string",
		requirement: "option.prompt",
		arguments: ["-p", "prompt> "],
		stdin: "q\n",
		stdout: "prompt> ",
	});
	add_pipe_case(cases, {
		name: "output/silent-suppresses-counts",
		requirement: "option.silent",
		stdin: "r @TMP@/input\nQ\n",
		stdout: "",
		fixtures: [{ path: "input", data: utf8("one\n") }],
	});
}

function
add_process_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "process/non-terminal-error-stops-input",
		requirement: "errors.non-terminal",
		stdin: "a\none\n.\n0p\np\n",
		stdout: "?\n",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "process/help-mode-explains-terminal-error",
		requirement: "command.help",
		stdin: "H\n0p\n",
		stdout_contains: ["?\n"],
		stdout_minimum_bytes: 3,
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "process/rejects-unknown-option",
		requirement: "option.syntax",
		arguments: ["-z"],
		stdin: "",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "process/rejects-too-many-operands",
		requirement: "operand.file",
		arguments: ["one", "two"],
		stdin: "",
		status: "nonzero",
	});
}

function
add_terminal_cases(cases: portable_case_v2[]): void
{
	cases.push({
		name: "terminal/error-recovers-to-command-mode",
		requirement: "errors.terminal",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("0p\n") },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: "nonzero", transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "terminal/prompt-and-quit",
		requirement: "option.prompt",
		mode: "pty",
		arguments: ["-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("q\n") },
		],
		expect: [{ status: 0, transcript_contains: [": ", "q\r\n"] }],
	});
	cases.push({
		name: "terminal/modified-warning",
		requirement: "buffer.change-state",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\none\n.\nq\n") },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "terminal/sigint-interrupts-input",
		requirement: "signal.int",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\npartial\n") },
			{ kind: "wait", text: "partial\r\n" },
			{ kind: "signal", signal: "SIGINT" },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "terminal/sigquit-is-ignored",
		requirement: "signal.quit",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "signal", signal: "SIGQUIT" },
			{ kind: "write", data: utf8("q\n") },
		],
		expect: [{ status: 0, transcript_contains: [": "] }],
	});
	cases.push({
		name: "terminal/sighup-saves-buffer",
		requirement: "signal.hup",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\none\n.\n") },
			{ kind: "wait", text: ".\r\n: " },
			{ kind: "signal", signal: "SIGHUP" },
		],
		expect: [{
			status: "any",
			files: [{ path: "ed.hup", data: utf8("one\n") }],
		}],
	});
	cases.push({
		name: "terminal/sighup-falls-back-to-home",
		requirement: "signal.hup",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		environment: { HOME: "@TMP@/home" },
		fixtures: [
			{ path: "ed.hup/sentinel", data: utf8("") },
			{ path: "home/.keep", data: utf8("") },
		],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\none\n.\n") },
			{ kind: "wait", text: ".\r\n: " },
			{ kind: "signal", signal: "SIGHUP" },
		],
		expect: [{
			status: "any",
			files: [{ path: "home/ed.hup", data: utf8("one\n") }],
		}],
	});
}

interface pipe_case_options {
	name: string;
	requirement: string;
	stdin: string;
	stdout?: string;
	stderr?: string;
	stdout_contains?: readonly string[];
	stderr_contains?: readonly string[];
	stdout_minimum_bytes?: number;
	stderr_minimum_bytes?: number;
	status?: expected_status;
	arguments?: readonly string[];
	fixtures?: readonly portable_fixture[];
	files?: readonly expected_file[];
}

function
add_pipe_case(
	cases: portable_case_v2[],
	options: pipe_case_options,
): void
{
	cases.push({
		name: options.name,
		requirement: options.requirement,
		mode: "pipe",
		arguments: options.arguments ?? ["-s"],
		stdin: utf8(options.stdin),
		...(options.fixtures === undefined
			? {}
			: { fixtures: options.fixtures }),
		expect: [{
			status: options.status ?? 0,
			...(options.stdout === undefined
				? {}
				: { stdout: utf8(options.stdout) }),
			...(options.stderr === undefined
				? {}
				: { stderr: utf8(options.stderr) }),
			...(options.stdout_contains === undefined
				? {}
				: {
					stdout_contains: options.stdout_contains.map(utf8),
				}),
			...(options.stderr_contains === undefined
				? {}
				: {
					stderr_contains: options.stderr_contains.map(utf8),
				}),
			...(options.stdout_minimum_bytes === undefined
				? {}
				: {
					stdout_minimum_bytes: options.stdout_minimum_bytes,
				}),
			...(options.stderr_minimum_bytes === undefined
				? {}
				: {
					stderr_minimum_bytes: options.stderr_minimum_bytes,
				}),
			...(options.files === undefined ? {} : { files: options.files }),
		}],
	});
}

function
four_line_setup(): string
{
	return "a\none\ntwo\nthree\nfour\n.\n";
}

function
utf8(data: string): encoded_data
{
	return { encoding: "utf8", data };
}

type requirement_row = readonly [
	string,
	string,
	string,
	posix_requirement["disposition"],
	readonly string[],
];

const requirement_rows: readonly requirement_row[] = [
	["option.syntax", "OPTIONS", "Parse the specified option forms.",
		"covered", ["process/rejects-unknown-option", "test/main.test.ts"]],
	["option.prompt", "OPTIONS", "Use and toggle the requested prompt.",
		"covered", ["output/prompt-string", "terminal/prompt-and-quit"]],
	["option.silent", "OPTIONS", "Suppress counts and shell completion.",
		"covered", ["output/silent-suppresses-counts", "test/editor.test.ts"]],
	["operand.file", "OPERANDS", "Load at most one initial file operand.",
		"covered", [
			"file/initial-byte-count", "process/rejects-too-many-operands",
		]],
	["environment.locale", "ENVIRONMENT VARIABLES",
		"Apply locale rules to text and BRE processing.",
		"platform-dependent", [
			"test/locale.test.ts", "private locale conformance campaign",
		]],
	["signal.int", "ASYNCHRONOUS EVENTS",
		"Interrupt input and return to command mode.", "covered",
		["terminal/sigint-interrupts-input"]],
	["signal.quit", "ASYNCHRONOUS EVENTS", "Ignore SIGQUIT.", "covered",
		["terminal/sigquit-is-ignored"]],
	["signal.hup", "ASYNCHRONOUS EVENTS", "Save changed text on SIGHUP.",
		"covered", ["terminal/sighup-saves-buffer"]],
	["input.text", "STDIN", "Read command and input text as lines.",
		"covered", [
			"input/command-looking-lines-are-text", "test/io.test.ts",
			"output/list-preserves-carriage-return",
		]],
	["buffer.change-state", "EXTENDED DESCRIPTION",
		"Maintain unchanged, changed, and warned buffer states.", "covered",
		["issue8/change-state/", "terminal/modified-warning"]],
	["regex.bre", "Regular Expressions in ed", "Use POSIX BRE matching.",
		"covered", [
			"regex/", "test/bre.test.ts",
			"test/regression/bre_substitute.test.ts",
		]],
	["regex.locale", "Regular Expressions in ed",
		"Use locale classes, collation, and multibyte characters.",
		"platform-dependent", ["test/locale.test.ts", "native/posix_regex.c"]],
	["address.basic", "Addresses in ed",
		"Resolve current, last, numeric, and offset addresses.", "covered",
		["address/intermediate-out-of-range", "address/",
			"test/regression/address.test.ts"]],
	["address.mark", "Addresses in ed", "Resolve lowercase marked lines.",
		"covered", ["address/mark-follows-moved-line",
			"test/regression/address.test.ts"]],
	["address.search", "Addresses in ed",
		"Search forward and backward with wraparound and null BRE reuse.",
		"covered", ["issue8/delimiter/omitted-forward-search",
			"test/regression/address.test.ts"]],
	["address.separators", "Addresses in ed",
		"Expand omitted addresses and evaluate excess addresses in order.",
		"covered", ["issue8/address/"]],
	["command.suffix", "Commands in ed", "Apply l, n, and p suffixes.",
		"covered", ["command/delete-print-suffix",
			"command/move-number-suffix", "test/regression/command.test.ts"]],
	["command.append", "Append Command", "Append input after an address.",
		"covered", ["edit/append/", "empty-append-is-unchanged"]],
	["command.change", "Change Command", "Replace an addressed range.",
		"covered", ["command/change-empty-final-range", "edit/change/"]],
	["command.delete", "Delete Command", "Delete an addressed range.",
		"covered", ["command/delete-selects-following-line", "edit/delete/"]],
	["command.edit", "Edit Commands", "Replace the buffer from a file.",
		"covered", ["warned-edit-takes-effect", "test/editor.test.ts"]],
	["command.filename", "Filename Command", "Set and print the pathname.",
		"covered", ["file/filename-"]],
	["command.global", "Global Commands", "Execute commands on selected lines.",
		"covered", ["test/regression/global.test.ts", "omitted-global"]],
	["command.help", "Help Commands", "Report and toggle error explanations.",
		"covered", ["process/help-mode", "test/regression/command.test.ts"]],
	["command.insert", "Insert Command", "Insert input before an address.",
		"permitted-choice", [
			"edit/insert/", "empty-insert-is-unchanged",
			"test/regression/command.test.ts",
		]],
	["command.join", "Join Command", "Join addressed lines.", "covered",
		["command/one-address-join-is-noop",
			"command/join-selects-joined-line", "edit/join/",
			"test/regression/command.test.ts"]],
	["command.mark", "Mark Command", "Set lowercase line marks.", "covered",
		["command/mark-preserves-current-line",
			"test/regression/command.test.ts"]],
	["command.list", "List Command", "Write visually unambiguous lines.",
		"covered", ["output/list-", "test/regression/command.test.ts"]],
	["command.move", "Move Command", "Move lines after a destination.",
		"covered", ["command/move-range-to-start",
			"test/regression/command.test.ts"]],
	["command.number", "Number Command", "Write numbered lines.", "covered",
		["output/numbered-lines"]],
	["command.print", "Print Command", "Write addressed lines.", "covered",
		["command/print-updates-current-line", "address/",
			"test/regression/command.test.ts"]],
	["command.quit", "Quit Commands", "Quit with or without change checks.",
		"covered", ["command/quit-without-checking-discards-change",
			"issue8/change-state/", "terminal/modified-warning"]],
	["command.read", "Read Command", "Append file or shell output.", "covered",
		["file/read-"]],
	["command.substitute", "Substitute Command",
		"Replace BRE matches and apply substitute flags.", "covered",
		["test/regression/bre_substitute.test.ts", "issue8/delimiter/"]],
	["command.copy", "Copy Command", "Copy lines after a destination.",
		"covered", ["command/copy-range-to-start",
			"test/regression/command.test.ts"]],
	["command.undo", "Undo Command", "Toggle the most recent real change.",
		"covered", ["undo-is-a-change", "global-no-change-undo-noop",
			"test/regression/command.test.ts"]],
	["command.write", "Write Command", "Write complete addressed lines.",
		"covered", ["file/write-", "file/partial-write-preserves-change-state",
			"shell/write-does-not-clear-change-state",
			"full-write-clears-change"]],
	["command.equals", "Line Number Command", "Write an addressed number.",
		"covered", ["command/equals-preserves-current-line",
			"test/regression/address.test.ts"]],
	["command.shell", "Shell Escape Command", "Execute POSIX shell commands.",
		"covered", ["shell/", "test/editor.test.ts", "TOUR"]],
	["command.null", "Null Command", "Print the addressed or next line.",
		"covered", ["command/address-and-null-command", "test/editor.test.ts",
			"test/regression/address.test.ts"]],
	["errors.non-terminal", "CONSEQUENCES OF ERRORS",
		"Stop non-terminal input after an ordinary error.", "covered",
		["process/non-terminal-error-stops-input"]],
	["errors.terminal", "CONSEQUENCES OF ERRORS",
		"Report terminal errors and read another command.", "covered",
		["terminal/error-recovers-to-command-mode",
			"test/integration/process.test.ts"]],
];

async function
main(): Promise<void>
{
	const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
	const portable_directory = join(project_root, "test", "portable");
	const corpus = build_posix_corpus();
	const requirements = build_posix_requirements();

	await Bun.write(
		join(portable_directory, "cases-v2.json"),
		`${JSON.stringify(corpus, null, 2)}\n`,
	);
	await Bun.write(
		join(portable_directory, "requirements.json"),
		`${JSON.stringify(requirements, null, 2)}\n`,
	);
	process.stdout.write(
		`generated ${corpus.cases.length} POSIX cases and ` +
			`${requirements.requirements.length} requirement groups\n`,
	);
}

if (import.meta.main) {
	await main();
}

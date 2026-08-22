/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import type {
	encoded_data,
	expected_file,
	expected_status,
	portable_capability,
	portable_case_v2,
	portable_fixture,
} from "./generate_posix_corpus";

const BASE_LINES = ["one", "two", "three", "four", "five", "six"];

interface torture_pipe_options {
	name: string;
	requirement: string;
	stdin: string;
	stdout?: string;
	status?: expected_status;
	arguments?: readonly string[];
	environment?: Readonly<Record<string, string>>;
	requires?: readonly portable_capability[];
	fixtures?: readonly portable_fixture[];
	files?: readonly expected_file[];
}

type undo_row = readonly [
	string,
	string,
	readonly portable_fixture[],
];

export function
build_torture_cases(): portable_case_v2[]
{
	const cases: portable_case_v2[] = [];

	add_separator_matrix(cases);
	add_offset_matrix(cases);
	add_edit_matrix(cases);
	add_substitute_matrix(cases);
	add_global_matrix(cases);
	add_undo_matrix(cases);
	add_file_matrix(cases);
	add_requirement_depth_cases(cases);
	add_locale_matrix(cases);
	add_terminal_matrix(cases);

	return cases;
}

function
add_requirement_depth_cases(cases: portable_case_v2[]): void
{
	add_option_depth_cases(cases);
	add_address_and_command_depth_cases(cases);
	add_input_and_output_depth_cases(cases);
	add_error_and_shell_depth_cases(cases);
}

function
add_option_depth_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "torture/options/combined-silent-prompt",
		requirement: "option.syntax",
		arguments: ["-sp", "prompt> "],
		stdin: "q\n",
		stdout: "prompt> ",
	});
	add_pipe_case(cases, {
		name: "torture/options/attached-prompt",
		requirement: "option.syntax",
		arguments: ["-pprompt> "],
		stdin: "q\n",
		stdout: "prompt> ",
	});
	add_pipe_case(cases, {
		name: "torture/options/end-options-before-hyphen-file",
		requirement: "option.syntax",
		arguments: ["-s", "--", "-input"],
		stdin: "p\nq\n",
		stdout: "one\n",
		fixtures: [{ path: "-input", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/options/silent-write-count",
		requirement: "option.silent",
		stdin: "a\none\n.\nw @TMP@/output\nq\n",
		stdout: "",
		files: [{ path: "output", data: utf8("one\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/options/silent-shell-completion",
		requirement: "option.silent",
		stdin: "!:\nQ\n",
		stdout: "",
		requires: ["posix-shell"],
	});
}

function
add_address_and_command_depth_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "torture/mark/reassign-mark",
		requirement: "address.mark",
		stdin: `${line_setup(BASE_LINES)}2ka\n5ka\n'ap\nQ\n`,
		stdout: "five\n",
	});
	add_pipe_case(cases, {
		name: "torture/mark/deleted-mark-errors",
		requirement: "address.mark",
		stdin: `${line_setup(BASE_LINES)}2ka\n2d\n'ap\n`,
		stdout: "?\n",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "torture/mark/multiple-names",
		requirement: "command.mark",
		stdin: `${line_setup(BASE_LINES)}1ka\n6kz\n'ap\n'zp\nQ\n`,
		stdout: "one\nsix\n",
	});
	add_pipe_case(cases, {
		name: "torture/mark/current-line-stays-put",
		requirement: "command.mark",
		stdin: `${line_setup(BASE_LINES)}2ka\n.=\nQ\n`,
		stdout: "6\n",
	});
	add_pipe_case(cases, {
		name: "torture/edit-command/unchanged-load",
		requirement: "command.edit",
		stdin: "e @TMP@/replacement\n.=\np\nq\n",
		stdout: "2\nnew-two\n",
		fixtures: [{
			path: "replacement",
			data: utf8("new-one\nnew-two\n"),
		}],
	});
	add_pipe_case(cases, {
		name: "torture/edit-command/unchecked-discards-change",
		requirement: "command.edit",
		stdin: "a\nold\n.\nE @TMP@/replacement\np\nq\n",
		stdout: "new\n",
		fixtures: [{ path: "replacement", data: utf8("new\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/edit-command/discards-marks",
		requirement: "command.edit",
		stdin: "a\nold\n.\nka\nE @TMP@/replacement\n'ap\n",
		stdout: "?\n",
		status: "nonzero",
		fixtures: [{ path: "replacement", data: utf8("new\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/equals/default-last-line",
		requirement: "command.equals",
		stdin: `${line_setup(BASE_LINES)}=\nQ\n`,
		stdout: "6\n",
	});
	add_pipe_case(cases, {
		name: "torture/equals/explicit-preserves-current",
		requirement: "command.equals",
		stdin: `${line_setup(BASE_LINES)}2=\n.=\nQ\n`,
		stdout: "2\n6\n",
	});
	add_pipe_case(cases, {
		name: "torture/null/blank-advances",
		requirement: "command.null",
		stdin: `${line_setup(BASE_LINES)}2p\n\n\nQ\n`,
		stdout: "two\nthree\nfour\n",
	});
	add_pipe_case(cases, {
		name: "torture/null/address-alone",
		requirement: "command.null",
		stdin: `${line_setup(BASE_LINES)}3\nQ\n`,
		stdout: "three\n",
	});
	add_pipe_case(cases, {
		name: "torture/number/range",
		requirement: "command.number",
		stdin: `${line_setup(BASE_LINES)}2,4n\nQ\n`,
		stdout: "2\ttwo\n3\tthree\n4\tfour\n",
	});
	add_pipe_case(cases, {
		name: "torture/number/default-current",
		requirement: "command.number",
		stdin: `${line_setup(BASE_LINES)}2p\nn\nQ\n`,
		stdout: "two\n2\ttwo\n",
	});
	add_pipe_case(cases, {
		name: "torture/print/default-current",
		requirement: "command.print",
		stdin: `${line_setup(BASE_LINES)}2p\np\nQ\n`,
		stdout: "two\ntwo\n",
	});
	add_pipe_case(cases, {
		name: "torture/print/range-selects-last",
		requirement: "command.print",
		stdin: `${line_setup(BASE_LINES)}2,4p\n.=\nQ\n`,
		stdout: "two\nthree\nfour\n4\n",
	});
	add_pipe_case(cases, {
		name: "torture/quit/warn-then-quit",
		requirement: "command.quit",
		stdin: "a\none\n.\nq\nq\n",
		stdout: "?\n",
	});
	add_pipe_case(cases, {
		name: "torture/quit/unchecked-never-warns",
		requirement: "command.quit",
		stdin: "a\none\n.\nQ\n",
		stdout: "",
	});
}

function
add_input_and_output_depth_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "torture/input/empty-lines-are-text",
		requirement: "input.text",
		stdin: "a\n\n\n.\n,n\nQ\n",
		stdout: "1\t\n2\t\n",
	});
	add_pipe_case(cases, {
		name: "torture/input/backslash-period-is-literal",
		requirement: "input.text",
		stdin: "a\n\\.\n.\np\nQ\n",
		stdout: "\\.\n",
	});
	const long_line = "x".repeat(4096);
	add_pipe_case(cases, {
		name: "torture/input/long-line",
		requirement: "input.text",
		stdin: `a\n${long_line}\n.\np\nQ\n`,
		stdout: `${long_line}\n`,
	});
	add_pipe_case(cases, {
		name: "torture/list/printable-and-trailing-space",
		requirement: "command.list",
		stdin: "a\nplain \n.\nl\nQ\n",
		stdout: "plain $\n",
	});
	add_pipe_case(cases, {
		name: "torture/list/dollar-and-backslash",
		requirement: "command.list",
		stdin: "a\n$\\\n.\nl\nQ\n",
		stdout: "\\$\\\\$\n",
	});
	for (const [suffix, output, name] of [
		["p", "three\n", "print"],
		["n", "2\tthree\n", "number"],
		["l", "three$\n", "list"],
	] as const) {
		add_pipe_case(cases, {
			name: `torture/suffix/delete-${name}`,
			requirement: "command.suffix",
			stdin: `${line_setup(BASE_LINES)}2d${suffix}\nQ\n`,
			stdout: output,
		});
	}
}

function
add_error_and_shell_depth_cases(cases: portable_case_v2[]): void
{
	add_pipe_case(cases, {
		name: "torture/error/non-terminal-invalid-command-stops",
		requirement: "errors.non-terminal",
		stdin: `${line_setup(BASE_LINES)}xp\np\n`,
		stdout: "?\n",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "torture/error/non-terminal-substitute-failure-stops",
		requirement: "errors.non-terminal",
		stdin: `${line_setup(BASE_LINES)}s/missing/X/\np\n`,
		stdout: "?\n",
		status: "nonzero",
	});
	add_pipe_case(cases, {
		name: "torture/shell/completion-marker",
		requirement: "command.shell",
		arguments: [],
		stdin: "!printf 'ok\\n'\nQ\n",
		stdout: "ok\n!\n",
		requires: ["posix-shell"],
	});
	add_pipe_case(cases, {
		name: "torture/shell/escaped-percent-is-literal",
		requirement: "command.shell",
		arguments: [],
		stdin: "f remembered\n!echo \\%\nQ\n",
		stdout: "remembered\n%\n!\n",
		requires: ["posix-shell"],
	});
}

function
add_separator_matrix(cases: portable_case_v2[]): void
{
	for (let length = 1; length <= 7; length += 1) {
		for (const separators of separator_sequences(length)) {
			const stdout = length === 1 && separators === ","
				? lines_output(BASE_LINES)
				: "six\n";
			add_pipe_case(cases, {
				name: "torture/address/separators/omitted-" +
					separator_name(separators),
				requirement: "address.separators",
				stdin: `${line_setup(BASE_LINES)}${separators}p\nQ\n`,
				stdout,
			});
		}
	}
	for (let length = 1; length <= 5; length += 1) {
		for (const separators of separator_sequences(length)) {
			add_pipe_case(cases, {
				name: "torture/address/separators/prefixed-" +
					separator_name(separators),
				requirement: "address.separators",
				stdin: `${line_setup(BASE_LINES)}2${separators}p\nQ\n`,
				stdout: "two\n",
			});
		}
	}
}

function
add_offset_matrix(cases: portable_case_v2[]): void
{
	for (let target = 1; target <= BASE_LINES.length; target += 1) {
		const from_end = BASE_LINES.length - target;
		const from_start = target - 1;
		const rows = [
			`$-${from_end}`,
			`. -${from_end}`,
			`1+${from_start}`,
			`1 ${from_start}`,
			`1${"+".repeat(from_start)}`,
		];
		for (const [index, address] of rows.entries()) {
			add_pipe_case(cases, {
				name: `torture/address/offset/target-${target}-form-${index + 1}`,
				requirement: "address.basic",
				stdin: `${line_setup(BASE_LINES)}${address}p\nQ\n`,
				stdout: `${BASE_LINES[target - 1]}\n`,
			});
		}
	}
}

function
add_edit_matrix(cases: portable_case_v2[]): void
{
	add_append_matrix(cases);
	add_insert_matrix(cases);
	for (let start = 1; start <= BASE_LINES.length; start += 1) {
		for (let end = start; end <= BASE_LINES.length; end += 1) {
			add_delete_case(cases, start, end);
			add_change_case(cases, start, end);
			if (start !== end) {
				add_join_case(cases, start, end);
			}
			for (let destination = 0;
			    destination <= BASE_LINES.length;
			    destination += 1) {
				if (destination < start || destination > end) {
					add_move_case(cases, start, end, destination);
				}
				add_copy_case(cases, start, end, destination);
			}
		}
	}
}

function
add_append_matrix(cases: portable_case_v2[]): void
{
	for (let address = 0; address <= BASE_LINES.length; address += 1) {
		const lines = [...BASE_LINES];
		lines.splice(address, 0, "APPEND");
		add_inspected_case(cases, {
			name: `torture/edit/append/address-${address}`,
			requirement: "command.append",
			command: `${address}a\nAPPEND\n.`,
			current: address + 1,
			lines,
		});
	}
}

function
add_insert_matrix(cases: portable_case_v2[]): void
{
	for (let address = 0; address <= BASE_LINES.length; address += 1) {
		const index = address === 0 ? 0 : address - 1;
		const lines = [...BASE_LINES];
		lines.splice(index, 0, "INSERT");
		add_inspected_case(cases, {
			name: `torture/edit/insert/address-${address}`,
			requirement: "command.insert",
			command: `${address}i\nINSERT\n.`,
			current: index + 1,
			lines,
		});
	}
}

function
add_delete_case(
    cases: portable_case_v2[],
    start: number,
    end: number,
): void
{
	const lines = [...BASE_LINES];
	lines.splice(start - 1, end - start + 1);
	const current = lines.length === 0
		? 0
		: Math.min(start, lines.length);
	add_inspected_case(cases, {
		name: `torture/edit/delete/${range_name(start, end)}`,
		requirement: "command.delete",
		command: `${start},${end}d`,
		current,
		lines,
	});
}

function
add_change_case(
    cases: portable_case_v2[],
    start: number,
    end: number,
): void
{
	const lines = [...BASE_LINES];
	lines.splice(start - 1, end - start + 1, "CHANGE");
	add_inspected_case(cases, {
		name: `torture/edit/change/${range_name(start, end)}`,
		requirement: "command.change",
		command: `${start},${end}c\nCHANGE\n.`,
		current: start,
		lines,
	});
}

function
add_join_case(
    cases: portable_case_v2[],
    start: number,
    end: number,
): void
{
	const lines = [...BASE_LINES];
	const joined = lines.slice(start - 1, end).join("");
	lines.splice(start - 1, end - start + 1, joined);
	add_inspected_case(cases, {
		name: `torture/edit/join/${range_name(start, end)}`,
		requirement: "command.join",
		command: `${start},${end}j`,
		current: start,
		lines,
	});
}

function
add_move_case(
    cases: portable_case_v2[],
    start: number,
    end: number,
    destination: number,
): void
{
	const lines = [...BASE_LINES];
	const count = end - start + 1;
	const moved = lines.splice(start - 1, count);
	const insertion = destination < start
		? destination
		: destination - count;
	lines.splice(insertion, 0, ...moved);
	add_inspected_case(cases, {
		name: `torture/edit/move/${range_name(start, end)}-to-${destination}`,
		requirement: "command.move",
		command: `${start},${end}m${destination}`,
		current: insertion + count,
		lines,
	});
}

function
add_copy_case(
    cases: portable_case_v2[],
    start: number,
    end: number,
    destination: number,
): void
{
	const lines = [...BASE_LINES];
	const copied = lines.slice(start - 1, end);
	lines.splice(destination, 0, ...copied);
	add_inspected_case(cases, {
		name: `torture/edit/copy/${range_name(start, end)}-to-${destination}`,
		requirement: "command.copy",
		command: `${start},${end}t${destination}`,
		current: destination + copied.length,
		lines,
	});
}

function
add_substitute_matrix(cases: portable_case_v2[]): void
{
	add_substitute_count_cases(cases);
	add_substitute_delimiter_cases(cases);
	add_bracket_delimiter_cases(cases);
	add_substitute_replacement_cases(cases);
	add_substitute_flag_cases(cases);
}

function
add_substitute_count_cases(cases: portable_case_v2[]): void
{
	const input = "x".repeat(32);
	for (let count = 1; count <= input.length; count += 1) {
		const output = `${input.slice(0, count - 1)}X${input.slice(count)}\n`;
		add_pipe_case(cases, {
			name: `torture/substitute/count-${count}`,
			requirement: "command.substitute",
			stdin: `a\n${input}\n.\ns/x/X/${count}\np\nQ\n`,
			stdout: output,
		});
	}
}

function
add_substitute_delimiter_cases(cases: portable_case_v2[]): void
{
	const delimiters = [
		"!", "\"", "#", "$", "%", "&", "'", "(", ")", "*", "+", ",",
		"-", ".", "/", ":", ";", "<", "=", ">", "?", "@", "[", "]",
		"^", "_", "`", "{", "|", "}", "~",
	];
	for (const delimiter of delimiters) {
		add_pipe_case(cases, {
			name: `torture/substitute/delimiter-${character_name(delimiter)}`,
			requirement: "command.substitute",
			stdin: `a\nz\n.\ns${delimiter}z${delimiter}Z${delimiter}\np\nQ\n`,
			stdout: "Z\n",
		});
	}
}

function
add_bracket_delimiter_cases(cases: portable_case_v2[]): void
{
	const delimiters = ["!", "#", "%", "+", "-", "/", ":", "=", "?", "@"];
	for (const delimiter of delimiters) {
		const expression = delimiter === "-" ? "[-]" : `[${delimiter}]`;
		add_pipe_case(cases, {
			name: `torture/regex/bracket-delimiter-${character_name(delimiter)}`,
			requirement: "regex.bre",
			stdin: `a\na${delimiter}b\nplain\n.\n` +
				`g${delimiter}${expression}${delimiter}p\nQ\n`,
			stdout: `a${delimiter}b\n`,
		});
	}
}

function
add_substitute_replacement_cases(cases: portable_case_v2[]): void
{
	const rows: readonly (readonly [string, string, string, string])[] = [
		["abc123", "s/\\([a-z]*\\)\\([0-9]*\\)/\\2-\\1/",
			"123-abc", "backreference-order"],
		["abc123", "s/[0-9][0-9]*/<&>/", "abc<123>", "ampersand"],
		["abc", "s/b/\\&/", "a&c", "escaped-ampersand"],
		["aa", "s/a/X/\ns/a/%/", "XX", "previous-replacement"],
		["aa", "s/a/%x/", "%xa", "mixed-percent-literal"],
		["aa", "s/a/\\%/", "%a", "escaped-percent"],
	];
	for (const [input, command, output, name] of rows) {
		add_pipe_case(cases, {
			name: `torture/substitute/replacement-${name}`,
			requirement: "command.substitute",
			stdin: `a\n${input}\n.\n${command}\np\nQ\n`,
			stdout: `${output}\n`,
		});
	}
	add_pipe_case(cases, {
		name: "torture/substitute/replacement-newline",
		requirement: "command.substitute",
		stdin: "a\nab\n.\ns/a/A\\\nB/\n.=\n,p\nQ\n",
		stdout: "2\nA\nBb\n",
	});
}

function
add_substitute_flag_cases(cases: portable_case_v2[]): void
{
	for (const [flags, output, name] of [
		["", "Xaaa\n", "first"],
		["g", "XXXX\n", "global"],
		["2", "aXaa\n", "second"],
		["4", "aaaX\n", "fourth"],
		["p", "Xaaa\nXaaa\n", "print"],
		["n", "1\tXaaa\nXaaa\n", "number"],
		["l", "Xaaa$\nXaaa\n", "list"],
	] as const) {
		add_pipe_case(cases, {
			name: `torture/substitute/flag-${name}`,
			requirement: "command.substitute",
			stdin: `a\naaaa\n.\ns/a/X/${flags}\np\nQ\n`,
			stdout: output,
		});
	}
}

function
add_global_matrix(cases: portable_case_v2[]): void
{
	const lines = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
	const rows: readonly (readonly [string, readonly number[], string])[] = [
		["^a", [0], "starts-a"],
		["ta$", [1, 3, 5], "ends-ta"],
		["^[bg]", [1, 2], "starts-b-or-g"],
		["^[^ae]", [1, 2, 3, 5], "not-start-a-or-e"],
		["[[:digit:]]", [], "contains-digit"],
	];
	for (const [expression, indexes, name] of rows) {
		const matching = indexes.map((index) => lines[index] ?? "");
		const inverse = lines.filter((_line, index) => !indexes.includes(index));
		add_pipe_case(cases, {
			name: `torture/global/matching-${name}`,
			requirement: "command.global",
			stdin: `${line_setup(lines)}g/${expression}/p\nQ\n`,
			stdout: lines_output(matching),
		});
		add_pipe_case(cases, {
			name: `torture/global/inverse-${name}`,
			requirement: "command.global",
			stdin: `${line_setup(lines)}v/${expression}/p\nQ\n`,
			stdout: lines_output(inverse),
		});
	}
	add_pipe_case(cases, {
		name: "torture/global/delete-is-single-undo-unit",
		requirement: "command.global",
		stdin: `${line_setup(lines)}g/a/d\nu\n,p\nQ\n`,
		stdout: lines_output(lines),
	});
}

function
add_undo_matrix(cases: portable_case_v2[]): void
{
	const rows: readonly undo_row[] = [
		["append", "0a\nextra\n.", []],
		["change", "1c\nextra\n.", []],
		["delete", "1d", []],
		["insert", "1i\nextra\n.", []],
		["join", "1,2j", []],
		["move", "1m6", []],
		["read", "0r @TMP@/extra", [
			{ path: "extra", data: utf8("extra\n") },
		]],
		["substitute", "1s/o/O/", []],
		["copy", "1t6", []],
	];
	for (const [name, command, fixtures] of rows) {
		add_pipe_case(cases, {
			name: `torture/undo/${name}`,
			requirement: "command.undo",
			stdin: `${line_setup(BASE_LINES)}${command}\nu\n.=\n,p\nQ\n`,
			stdout: `${BASE_LINES.length}\n${lines_output(BASE_LINES)}`,
			fixtures,
		});
	}
}

function
add_file_matrix(cases: portable_case_v2[]): void
{
	const input = ["read-one", "read-two"];
	for (let address = 0; address <= 3; address += 1) {
		const original = ["one", "two", "three"];
		const lines = [...original];
		lines.splice(address, 0, ...input);
		add_pipe_case(cases, {
			name: `torture/file/read-at-${address}`,
			requirement: "command.read",
			stdin: `${line_setup(original)}${address}r @TMP@/input\n` +
				".=\n,p\nQ\n",
			stdout: `${address + input.length}\n${lines_output(lines)}`,
			fixtures: [{ path: "input", data: utf8(lines_output(input)) }],
		});
	}
	add_pipe_case(cases, {
		name: "torture/file/pathname-with-spaces",
		requirement: "command.filename",
		stdin: "f @TMP@/name with spaces\nf\nQ\n",
		stdout: "@TMP@/name with spaces\n@TMP@/name with spaces\n",
	});
	add_pipe_case(cases, {
		name: "torture/file/write-truncates-existing-file",
		requirement: "command.write",
		stdin: "a\nshort\n.\nw @TMP@/output\nq\n",
		fixtures: [{ path: "output", data: utf8("old long contents\n") }],
		files: [{ path: "output", data: utf8("short\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/operand/loads-and-remembers-pathname",
		requirement: "operand.file",
		arguments: ["-s", "@TMP@/input"],
		stdin: "f\n.=\nq\n",
		stdout: "@TMP@/input\n2\n",
		fixtures: [{ path: "input", data: utf8("one\ntwo\n") }],
	});
	add_pipe_case(cases, {
		name: "torture/operand/empty-file-has-line-zero",
		requirement: "operand.file",
		arguments: ["-s", "@TMP@/empty"],
		stdin: ".=\nq\n",
		stdout: "0\n",
		fixtures: [{ path: "empty", data: utf8("") }],
	});
}

function
add_locale_matrix(cases: portable_case_v2[]): void
{
	const environment = { LC_ALL: "@UTF8_LOCALE@" };
	const requires: readonly portable_capability[] = ["utf8-locale"];
	for (const [name, input, command, output] of [
		["dot-is-one-character", "é", "s/./X/gp", "X"],
		["two-dots-are-two-characters", "éΩ", "s/../X/p", "X"],
		["backreferences-preserve-characters", "éΩ",
			"s/^\\(.\\)\\(.\\)$/\\2\\1/p", "Ωé"],
		["literal-search", "café", "/é/p", "café"],
		["global-literal", "café\nplain", "g/é/p", "café"],
	] as const) {
		add_pipe_case(cases, {
			name: `torture/locale/${name}`,
			requirement: name === "literal-search"
				? "address.search"
				: "regex.locale",
			stdin: `a\n${input}\n.\n${command}\nQ\n`,
			stdout: `${output}\n`,
			environment,
			requires,
		});
	}
	for (const [name, environment] of [
		["lang-selects-ctype", {
			LANG: "@UTF8_LOCALE@",
			LC_ALL: "",
			LC_CTYPE: "",
		}],
		["lc-ctype-overrides-lang", {
			LANG: "C",
			LC_ALL: "",
			LC_CTYPE: "@UTF8_LOCALE@",
		}],
		["lc-all-overrides-ctype", {
			LANG: "C",
			LC_ALL: "@UTF8_LOCALE@",
			LC_CTYPE: "C",
		}],
	] as const) {
		add_pipe_case(cases, {
			name: `torture/locale/environment-${name}`,
			requirement: "environment.locale",
			stdin: "a\né\n.\ns/./X/gp\nQ\n",
			stdout: "X\n",
			environment,
			requires,
		});
	}
}

function
add_terminal_matrix(cases: portable_case_v2[]): void
{
	cases.push({
		name: "torture/terminal/default-prompt-toggle",
		requirement: "option.prompt",
		mode: "pty",
		arguments: ["-s"],
		requires: ["pty"],
		actions: [
			{ kind: "write", data: utf8("P\n") },
			{ kind: "wait", text: "*" },
			{ kind: "write", data: utf8("P\nP\n") },
			{ kind: "wait", text: "*", occurrences: 2 },
			{ kind: "write", data: utf8("q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["*"] }],
	});
	cases.push({
		name: "torture/terminal/recover-after-two-errors",
		requirement: "errors.terminal",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("0p\n") },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("0p\n") },
			{ kind: "wait", text: "?\r\n: ", occurrences: 2 },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: "nonzero", transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/sigint-in-command-mode",
		requirement: "signal.int",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty", "signals"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "signal", signal: "SIGINT" },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/help-after-error",
		requirement: "command.help",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("0p\n") },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("h\n") },
			{ kind: "wait", text: ": ", occurrences: 3 },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: "nonzero", transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/help-mode-explains-error",
		requirement: "command.help",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("H\n0p\n") },
			{ kind: "wait", text: ": ", occurrences: 3 },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: "nonzero", transcript_contains: ["?\r\n"] }],
	});
	cases.push({
		name: "torture/terminal/unknown-command-recovers",
		requirement: "errors.terminal",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("x\n") },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: "nonzero", transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/repeated-sigint",
		requirement: "signal.int",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty", "signals"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "signal", signal: "SIGINT" },
			{ kind: "wait", text: "?\r\n: " },
			{ kind: "signal", signal: "SIGINT" },
			{ kind: "wait", text: "?\r\n: ", occurrences: 2 },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["?\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/sigquit-command-mode",
		requirement: "signal.quit",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty", "signals"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "signal", signal: "SIGQUIT" },
			{ kind: "write", data: utf8(".=\n") },
			{ kind: "wait", text: "0\r\n: " },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["0\r\n: "] }],
	});
	cases.push({
		name: "torture/terminal/sigquit-input-mode",
		requirement: "signal.quit",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty", "signals"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\nkept\n") },
			{ kind: "wait", text: "kept\r\n" },
			{ kind: "signal", signal: "SIGQUIT" },
			{ kind: "write", data: utf8(".\n1p\n") },
			{ kind: "wait", text: "kept\r\n", occurrences: 2 },
			{ kind: "write", data: utf8("Q\n") },
		],
		expect: [{ status: 0, transcript_contains: ["kept\r\n"] }],
	});
	cases.push({
		name: "torture/terminal/sighup-unchanged-buffer-does-not-save",
		requirement: "signal.hup",
		mode: "pty",
		arguments: ["-s", "-p", ": ", "@TMP@/input"],
		environment: { HOME: "@TMP@/home" },
		requires: ["pty", "signals"],
		fixtures: [
			{ path: "input", data: utf8("one\n") },
			{ path: "home/.keep", data: utf8("") },
		],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "signal", signal: "SIGHUP" },
		],
		expect: [{
			status: "any",
			absent_files: ["ed.hup", "home/ed.hup"],
		}],
	});
	cases.push({
		name: "torture/terminal/sighup-after-full-write-does-not-save",
		requirement: "signal.hup",
		mode: "pty",
		arguments: ["-s", "-p", ": "],
		requires: ["pty", "signals"],
		actions: [
			{ kind: "wait", text: ": " },
			{ kind: "write", data: utf8("a\none\n.\n") },
			{ kind: "wait", text: ": ", occurrences: 2 },
			{ kind: "write", data: utf8("w @TMP@/saved\n") },
			{ kind: "wait", text: ": ", occurrences: 3 },
			{ kind: "signal", signal: "SIGHUP" },
		],
		expect: [{
			status: "any",
			files: [{ path: "saved", data: utf8("one\n") }],
			absent_files: ["ed.hup"],
		}],
	});
}

interface inspected_case_options {
	name: string;
	requirement: string;
	command: string;
	current: number;
	lines: readonly string[];
}

function
add_inspected_case(
    cases: portable_case_v2[],
    options: inspected_case_options,
): void
{
	const print = options.lines.length === 0 ? "" : ",p\n";
	add_pipe_case(cases, {
		name: options.name,
		requirement: options.requirement,
		stdin: `${line_setup(BASE_LINES)}${options.command}\n` +
			`.=\n${print}Q\n`,
		stdout: `${options.current}\n${lines_output(options.lines)}`,
	});
}

function
add_pipe_case(
    cases: portable_case_v2[],
    options: torture_pipe_options,
): void
{
	cases.push({
		name: options.name,
		requirement: options.requirement,
		mode: "pipe",
		arguments: options.arguments ?? ["-s"],
		stdin: utf8(options.stdin),
		...(options.environment === undefined
			? {}
			: { environment: options.environment }),
		...(options.requires === undefined
			? {}
			: { requires: options.requires }),
		...(options.fixtures === undefined
			? {}
			: { fixtures: options.fixtures }),
		expect: [{
			status: options.status ?? 0,
			...(options.stdout === undefined
				? {}
				: { stdout: utf8(options.stdout) }),
			...(options.files === undefined ? {} : { files: options.files }),
		}],
	});
}

function
separator_sequences(length: number): string[]
{
	let result = [""];
	for (let index = 0; index < length; index += 1) {
		const next: string[] = [];
		for (const prefix of result) {
			next.push(`${prefix},`, `${prefix};`);
		}
		result = next;
	}
	return result;
}

function
separator_name(value: string): string
{
	return value.replaceAll(",", "c").replaceAll(";", "s");
}

function
range_name(start: number, end: number): string
{
	return `${start}-${end}`;
}

function
character_name(value: string): string
{
	return value.codePointAt(0)?.toString(16).padStart(2, "0") ?? "unknown";
}

function
line_setup(lines: readonly string[]): string
{
	return `a\n${lines.join("\n")}\n.\n`;
}

function
lines_output(lines: readonly string[]): string
{
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function
utf8(data: string): encoded_data
{
	return { encoding: "utf8", data };
}

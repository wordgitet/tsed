/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { parse_command } from "../../src/parser";
import type { address_expression } from "../../src/types";
import { run_editor_case } from "../support/editor_harness";

interface parser_case {
	name: string;
	source: string;
	command: string;
	argument?: string;
	addresses: readonly string[];
}

interface address_case {
	name: string;
	commands: readonly string[];
	stdout: string;
	status?: number;
}

const parser_cases: readonly parser_case[] = [
	{ name: "recognizes an empty command", source: "", command: "",
		addresses: [] },
	{ name: "recognizes a print command", source: "p", command: "p",
		addresses: [] },
	{ name: "parses a numeric address", source: "1p", command: "p",
		addresses: ["number:1|-|0"] },
	{ name: "parses a multi-digit address", source: "123p", command: "p",
		addresses: ["number:123|-|0"] },
	{ name: "parses the zero address", source: "0a", command: "a",
		addresses: ["number:0|-|0"] },
	{ name: "parses the current address", source: ".p", command: "p",
		addresses: ["current|-|0"] },
	{ name: "parses the last address", source: "$p", command: "p",
		addresses: ["last|-|0"] },
	{ name: "parses a mark address", source: "'ap", command: "p",
		addresses: ["mark:a|-|0"] },
	{ name: "parses a forward search", source: "/cat/p", command: "p",
		addresses: ["forward:cat|-|0"] },
	{ name: "parses a backward search", source: "?cat?p", command: "p",
		addresses: ["backward:cat|-|0"] },
	{ name: "permits an omitted search terminator", source: "/cat",
		command: "p", addresses: ["forward:cat|-|0"] },
	{ name: "preserves an escaped search separator", source: "/a\\/b/p",
		command: "p", addresses: ["forward:a\\/b|-|0"] },
	{ name: "parses an implicit positive offset", source: "+p",
		command: "p", addresses: ["current|-|1"] },
	{ name: "parses an implicit negative offset", source: "-p",
		command: "p", addresses: ["current|-|-1"] },
	{ name: "adds repeated positive offsets", source: "+++p",
		command: "p", addresses: ["current|-|3"] },
	{ name: "adds repeated negative offsets", source: "---p",
		command: "p", addresses: ["current|-|-3"] },
	{ name: "parses an explicit positive offset", source: "+12p",
		command: "p", addresses: ["current|-|12"] },
	{ name: "parses an explicit negative offset", source: "-12p",
		command: "p", addresses: ["current|-|-12"] },
	{ name: "offsets a numeric address", source: "4+3p", command: "p",
		addresses: ["number:4|-|3"] },
	{ name: "combines signed offsets", source: "4+3-2p", command: "p",
		addresses: ["number:4|-|1"] },
	{ name: "accepts an unsigned offset", source: ".2p", command: "p",
		addresses: ["current|-|2"] },
	{ name: "parses a comma range", source: "1,4p", command: "p",
		addresses: ["number:1|-|0", "number:4|,|0"] },
	{ name: "parses a semicolon range", source: "1;4p", command: "p",
		addresses: ["number:1|-|0", "number:4|;|0"] },
	{ name: "supplies both leading comma addresses", source: ",p",
		command: "p", addresses: ["number:1|-|0", "last|,|0"] },
	{ name: "supplies both leading semicolon addresses", source: ";p",
		command: "p", addresses: ["current|-|0", "last|;|0"] },
	{ name: "retains a trailing comma", source: "2,p", command: "p",
		addresses: ["number:2|-|0", "previous|,|0"] },
	{ name: "retains a trailing semicolon", source: "2;p", command: "p",
		addresses: ["number:2|-|0", "previous|;|0"] },
	{ name: "retains three addresses", source: "1,2,3p", command: "p",
		addresses: [
			"number:1|-|0", "number:2|,|0", "number:3|,|0",
		] },
	{ name: "expands adjacent leading separators", source: ",,p",
		command: "p", addresses: [
			"number:1|-|0", "last|,|0", "previous|,|0",
		] },
	{ name: "expands an omitted address between separators",
		source: "1,,3p", command: "p", addresses: [
			"number:1|-|0", "previous|,|0", "number:3|,|0",
		] },
	{ name: "accepts blank-separated offsets", source: "1 +1 +1p",
		command: "p", addresses: ["number:1|-|2"] },
	{ name: "defaults an addressed null command to print", source: "3",
		command: "p", addresses: ["number:3|-|0"] },
	{ name: "skips leading horizontal whitespace", source: " \t3p",
		command: "p", addresses: ["number:3|-|0"] },
	{ name: "skips whitespace around a separator", source: "1 , 3p",
		command: "p", addresses: ["number:1|-|0", "number:3|,|0"] },
	{ name: "leaves a mark name as a command argument", source: "2ka",
		command: "k", argument: "a", addresses: ["number:2|-|0"] },
	{ name: "leaves a destination as a command argument", source: "2m$",
		command: "m", argument: "$", addresses: ["number:2|-|0"] },
	{ name: "leaves substitution text as an argument", source: "1s/a/b/g",
		command: "s", argument: "/a/b/g", addresses: ["number:1|-|0"] },
	{ name: "accepts the largest safe address", source: "9007199254740991p",
		command: "p", addresses: ["number:9007199254740991|-|0"] },
];

const address_cases: readonly address_case[] = [
	{ name: "prints the first numeric address", commands: ["1p"],
		stdout: "one\n" },
	{ name: "prints the final numeric address", commands: ["4p"],
		stdout: "four\n" },
	{ name: "prints the current address", commands: [".p"],
		stdout: "four\n" },
	{ name: "prints the last address", commands: ["$p"],
		stdout: "four\n" },
	{ name: "subtracts from the current address", commands: [".-1p"],
		stdout: "three\n" },
	{ name: "adds to a selected current address", commands: ["2p", "+p"],
		stdout: "two\nthree\n" },
	{ name: "applies two implicit positive offsets",
		commands: ["1p", "++p"], stdout: "one\nthree\n" },
	{ name: "applies two implicit negative offsets",
		commands: ["4p", "--p"], stdout: "four\ntwo\n" },
	{ name: "adds an explicit numeric offset", commands: ["1+2p"],
		stdout: "three\n" },
	{ name: "subtracts an explicit numeric offset", commands: ["4-3p"],
		stdout: "one\n" },
	{ name: "prints a comma range", commands: ["1,3p"],
		stdout: "one\ntwo\nthree\n" },
	{ name: "prints a semicolon range", commands: ["1;3p"],
		stdout: "one\ntwo\nthree\n" },
	{ name: "supplies the leading comma defaults", commands: [",p"],
		stdout: "one\ntwo\nthree\nfour\n" },
	{ name: "supplies the leading semicolon defaults", commands: ["1p", ";p"],
		stdout: "one\none\ntwo\nthree\nfour\n" },
	{ name: "discards the earliest excess address", commands: ["1,2,3p"],
		stdout: "two\nthree\n" },
	{ name: "expands repeated leading separators", commands: [",,p"],
		stdout: "four\n" },
	{ name: "expands omitted addresses between separators",
		commands: ["1,,3p"], stdout: "one\ntwo\nthree\n" },
	{ name: "adds blank-separated offsets", commands: ["1 +1 +1p"],
		stdout: "three\n" },
	{ name: "uses the first address for a trailing comma", commands: ["2,p"],
		stdout: "two\n" },
	{ name: "uses the first address for a trailing semicolon",
		commands: ["2;p"], stdout: "two\n" },
	{ name: "finds a forward search address", commands: ["/two/p"],
		stdout: "two\n" },
	{ name: "finds a backward search address", commands: ["?two?p"],
		stdout: "two\n" },
	{ name: "wraps a forward search", commands: ["/one/p"],
		stdout: "one\n" },
	{ name: "wraps a backward search", commands: ["?three?p"],
		stdout: "three\n" },
	{ name: "reuses an empty forward expression",
		commands: ["/two/p", "//p"], stdout: "two\ntwo\n" },
	{ name: "resolves a marked address", commands: ["2ka", "'ap"],
		stdout: "two\n" },
	{ name: "offsets a marked address", commands: ["2ka", "'a+1p"],
		stdout: "three\n" },
	{ name: "prints an addressed null command", commands: ["2"],
		stdout: "two\n" },
	{ name: "prints an addressed equals command", commands: ["2="],
		stdout: "2\n" },
	{ name: "defaults equals to the final address", commands: ["="],
		stdout: "4\n" },
	{ name: "rejects an address past the buffer", commands: ["5p"],
		stdout: "?\n", status: 1 },
	{ name: "rejects zero for print", commands: ["0p"],
		stdout: "?\n", status: 1 },
	{ name: "rejects a reversed range", commands: ["3,1p"],
		stdout: "?\n", status: 1 },
	{ name: "rejects a missing mark", commands: ["'zp"],
		stdout: "?\n", status: 1 },
	{ name: "rejects a non-lowercase mark address", commands: ["'Ap"],
		stdout: "?\n", status: 1 },
	{ name: "rejects a missing search match", commands: ["/missing/p"],
		stdout: "?\n", status: 1 },
	{ name: "rejects an address on quit", commands: ["1q"],
		stdout: "?\n", status: 1 },
];

describe("address parser regressions", () => {
	for (const item of parser_cases) {
		test(item.name, () => {
			const parsed = parse_command(item.source);
			expect(parsed.command).toBe(item.command);
			expect(parsed.argument).toBe(item.argument ?? "");
			expect(parsed.addresses.map(address_text)).toEqual([
				...item.addresses,
			]);
		});
	}
});

describe("address resolution regressions", () => {
	for (const item of address_cases) {
		test(item.name, async () => {
			const result = await run_editor_case({
				lines: [
					"a", "one", "two", "three", "four", ".",
					...item.commands,
					"Q",
				],
				input_kind: item.status === undefined ? "regular" : "terminal",
			});
			expect(result.status).toBe(item.status ?? 0);
			expect(result.stdout).toBe(item.stdout);
			expect(result.stderr).toBe("");
		});
	}
});

function
address_text(specification:
{
	expression: address_expression;
	separator: "," | ";" | null;
	offset: number;
}): string
{
	const separator = specification.separator ?? "-";
	return `${expression_text(specification.expression)}|${separator}|` +
		`${specification.offset}`;
}

function
expression_text(expression: address_expression): string
{
	switch (expression.kind) {
	case "current":
	case "last":
	case "previous":
		return expression.kind;
	case "number":
		return `number:${expression.value}`;
	case "mark":
		return `mark:${expression.name}`;
	case "search":
		return `${expression.direction}:${expression.pattern}`;
	}
}

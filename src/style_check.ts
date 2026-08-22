/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { readdir } from "node:fs/promises";

const maximum_line_length = 80;

async function
main(): Promise<void>
{
	const files = [
		...await source_files("src"),
		...await source_files("test"),
		...await source_files("tools"),
	];
	let failed = false;
	for (const pathname of files) {
		const source = await Bun.file(pathname).text();
		const lines = source.split("\n");
		if (check_declaration_style(pathname, lines)) {
			failed = true;
		}
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index] ?? "";
			if (/\s+$/.test(line)) {
				console.error(`${pathname}:${index + 1}: trailing whitespace`);
				failed = true;
			}
			if (line.length > maximum_line_length) {
				console.error(
				    `${pathname}:${index + 1}: line exceeds 80 columns`,
				);
				failed = true;
			}
			if (/\bwhile\s*\(\s*true\s*\)/.test(line)) {
				console.error(
				    `${pathname}:${index + 1}: use for (;;) for forever loops`,
				);
				failed = true;
			}
		}
	}
	if (failed) {
		process.exitCode = 1;
	}
}

async function
source_files(directory: string): Promise<string[]>
{
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const pathname = `${directory}/${entry.name}`;
		if (entry.isDirectory()) {
			files.push(...await source_files(pathname));
		} else if (entry.isFile() && pathname.endsWith(".ts")) {
			files.push(pathname);
		}
	}
	return files.sort();
}

function
check_declaration_style(pathname: string, lines: readonly string[]): boolean
{
	let failed = false;
	let declaration: "function" | "method" | undefined;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const trimmed = line.trim();
		if (declaration === undefined) {
			if (/^(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_]/
			    .test(trimmed)) {
				report_declaration_error(
				    pathname,
				    index,
				    "put the function keyword on its own line",
				);
				failed = true;
			} else if (/^(?:export\s+)?(?:async\s+)?function$/.test(trimmed)) {
				declaration = "function";
			} else if (
			    /^(?:public|private|protected)\s+.*\(/.test(trimmed)
			) {
				if (trimmed.endsWith("{")) {
					report_declaration_error(
					    pathname,
					    index,
					    "put the method brace on its own line",
					);
					failed = true;
				} else {
					declaration = "method";
				}
			}
			continue;
		}

		if (trimmed === "") {
			continue;
		}
		if (trimmed === "{") {
			declaration = undefined;
			continue;
		}
		if (trimmed.endsWith("{") && !trimmed.endsWith(": {")) {
			const message = declaration === "function"
			    ? "put the function brace on its own line"
			    : "put the method brace on its own line";
			report_declaration_error(
			    pathname,
			    index,
			    message,
			);
			failed = true;
			declaration = undefined;
		}
	}
	return failed;
}

function
report_declaration_error(
    pathname: string,
    index: number,
    message: string,
): void
{
	console.error(`${pathname}:${index + 1}: ${message}`);
}

void main();

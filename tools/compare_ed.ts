/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { mkdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

interface editor_reference {
	name: string;
	executable: string;
	revision: string;
}

interface portable_result {
	name: string;
	requirement: string;
	result: "PASS" | "FAIL";
	differences: readonly string[];
}

interface editor_report {
	name: string;
	executable: string;
	revision: string;
	available: boolean;
	error?: string;
	results?: readonly portable_result[];
}

interface comparison_row {
	name: string;
	requirement: string;
	normative: "PASS" | "FAIL";
	comparison:
		| "all-agree"
		| "tsed-differs"
		| "references-split"
		| "reference-unavailable";
	editors: Readonly<Record<string, "PASS" | "FAIL" | "UNAVAILABLE">>;
}

interface comparison_options {
	executable: string;
	filter: string | undefined;
	output: string;
	references: readonly editor_reference[];
}

interface runner_report {
	editor: string;
	corpus: string;
	results: readonly portable_result[];
}

const FREEBSD_REVISION = "ee81cd1d8f5596a6ab4c8eb29009405572cc162b";
const HEIRLOOM_REVISION = "ad05960aeac749136e7137dde29afaf0ac8f0776";

async function
main(): Promise<void>
{
	const project_root = dirname(dirname(import.meta.path));
	const options = parse_options(process.argv.slice(2), project_root);
	const executable = await realpath(options.executable);
	const tsed = await run_editor({
		name: "tsed",
		executable,
		revision: "working tree",
	}, options.filter, executable, project_root);
	if (!tsed.available || tsed.results === undefined) {
		throw new Error(tsed.error ?? "cannot run tsed comparison corpus");
	}

	const references: editor_report[] = [];
	for (const reference of options.references) {
		references.push(await run_editor(
			reference,
			options.filter,
			executable,
			project_root,
		));
	}
	const comparisons = compare_reports(tsed, references);
	const report = {
		format: "tsed-reference-comparison",
		version: 1,
		standard: "POSIX.1-2024",
		generated_at: new Date().toISOString(),
		tsed,
		references,
		comparisons,
	};

	await mkdir(dirname(options.output), { recursive: true });
	await Bun.write(options.output, `${JSON.stringify(report, null, 2)}\n`);
	write_summary(comparisons, references, options.output);
	if (comparisons.some((item) => item.normative === "FAIL")) {
		process.exitCode = 1;
	}
}

async function
run_editor(
	reference: editor_reference,
	filter: string | undefined,
	tsed_path: string,
	project_root: string,
): Promise<editor_report>
{
	let pathname: string;
	try {
		pathname = await realpath(reference.executable);
	} catch (error) {
		return unavailable(reference, error);
	}
	if (reference.name !== "tsed" && pathname === tsed_path) {
		return unavailable(
			reference,
			new Error("reference resolves to the tsed executable"),
		);
	}

	const command = [
		process.execPath,
		join(project_root, "test", "portable_v2_runner.ts"),
		"--editor",
		pathname,
		"--json",
	];
	if (filter !== undefined) {
		command.push("--case", filter);
	}
	const child = Bun.spawn(command, {
		cwd: project_root,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	try {
		const report = parse_runner_report(JSON.parse(stdout));
		const revision = reference.revision === "auto"
			? await identify_editor(pathname)
			: reference.revision;
		void status;
		return {
			name: reference.name,
			executable: pathname,
			revision,
			available: true,
			results: report.results,
		};
	} catch (error) {
		return unavailable(
			{ ...reference, executable: pathname },
			new Error(
				`runner did not return a report: ${error_text(error)}; ` +
					`stderr=${JSON.stringify(stderr)}`,
			),
		);
	}
}

async function
identify_editor(pathname: string): Promise<string>
{
	const child = Bun.spawn([pathname, "--version"], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const first_line = stdout.split("\n")[0]?.trim() ?? "";
	return status === 0 && first_line.length !== 0
		? first_line
		: "system installation";
}

function
unavailable(reference: editor_reference, error: unknown): editor_report
{
	return {
		name: reference.name,
		executable: reference.executable,
		revision: reference.revision,
		available: false,
		error: error_text(error),
	};
}

function
compare_reports(
	tsed: editor_report,
	references: readonly editor_report[],
): comparison_row[]
{
	const rows: comparison_row[] = [];
	for (const actual of tsed.results ?? []) {
		const editors: Record<string, "PASS" | "FAIL" | "UNAVAILABLE"> = {
			tsed: actual.result,
		};
		const reference_results: Array<"PASS" | "FAIL"> = [];
		let unavailable_seen = false;
		for (const reference of references) {
			if (!reference.available || reference.results === undefined) {
				editors[reference.name] = "UNAVAILABLE";
				unavailable_seen = true;
				continue;
			}
			const result = reference.results.find((item) =>
				item.name === actual.name);
			if (result === undefined) {
				editors[reference.name] = "UNAVAILABLE";
				unavailable_seen = true;
				continue;
			}
			editors[reference.name] = result.result;
			reference_results.push(result.result);
		}
		rows.push({
			name: actual.name,
			requirement: actual.requirement,
			normative: actual.result,
			comparison: comparison_kind(
				actual.result,
				reference_results,
				unavailable_seen,
			),
			editors,
		});
	}
	return rows;
}

function
comparison_kind(
	actual: "PASS" | "FAIL",
	references: readonly ("PASS" | "FAIL")[],
	unavailable: boolean,
): comparison_row["comparison"]
{
	if (references.length === 0 || unavailable) {
		return "reference-unavailable";
	}
	if (new Set(references).size > 1) {
		return "references-split";
	}
	return references[0] === actual ? "all-agree" : "tsed-differs";
}

function
write_summary(
	rows: readonly comparison_row[],
	references: readonly editor_report[],
	output: string,
): void
{
	for (const reference of references) {
		const state = reference.available ? "available" : "unavailable";
		process.stdout.write(
			`${reference.name}: ${state} (${reference.revision})\n`,
		);
		if (reference.error !== undefined) {
			process.stdout.write(`  ${reference.error}\n`);
		}
	}
	const kinds: comparison_row["comparison"][] = [
		"all-agree",
		"tsed-differs",
		"references-split",
		"reference-unavailable",
	];
	for (const kind of kinds) {
		const count = rows.filter((item) => item.comparison === kind).length;
		process.stdout.write(`${kind}: ${count}\n`);
	}
	const failures = rows.filter((item) => item.normative === "FAIL").length;
	process.stdout.write(`normative failures: ${failures}\n`);
	process.stdout.write(`report: ${output}\n`);
}

function
parse_options(
	arguments_list: readonly string[],
	project_root: string,
): comparison_options
{
	let executable = process.env.TSED_TEST_ED ??
		join(project_root, "dist", "ed");
	let filter: string | undefined;
	let output = resolve(project_root, ".tmp", "reference", "latest.json");
	const references: editor_reference[] = default_references(project_root);
	let custom_references = false;

	for (let index = 0; index < arguments_list.length; index += 1) {
		const argument = arguments_list[index];
		if (argument !== "--editor" && argument !== "--case" &&
			argument !== "--output" && argument !== "--reference") {
			throw new Error(`unknown comparison option: ${argument ?? ""}`);
		}
		const value = arguments_list[index + 1];
		if (value === undefined) {
			throw new Error(`${argument} requires an argument`);
		}
		if (argument === "--editor") {
			executable = value;
		} else if (argument === "--case") {
			filter = value;
		} else if (argument === "--output") {
			output = resolve(value);
		} else {
			if (!custom_references) {
				references.splice(0);
				custom_references = true;
			}
			references.push(parse_reference(value));
		}
		index += 1;
	}
	return { executable, filter, output, references };
}

function
default_references(project_root: string): editor_reference[]
{
	return [
		{
			name: "gnu",
			executable: "/usr/bin/ed",
			revision: "auto",
		},
		{
			name: "freebsd",
			executable: join(
				project_root,
				"private",
				"references",
				"freebsd-src",
				"bin",
				"ed",
				"ed",
			),
			revision: FREEBSD_REVISION,
		},
		{
			name: "heirloom",
			executable: join(
				project_root,
				"private",
				"references",
				"heirloom-ng",
				"ed",
				"ed",
			),
			revision: HEIRLOOM_REVISION,
		},
	];
}

function
parse_reference(value: string): editor_reference
{
	const separator = value.indexOf("=");
	if (separator <= 0 || separator === value.length - 1) {
		throw new Error("reference must have the form name=/path/to/ed");
	}
	return {
		name: value.slice(0, separator),
		executable: value.slice(separator + 1),
		revision: "user-supplied",
	};
}

function
parse_runner_report(value: unknown): runner_report
{
	if (!is_record(value) || typeof value.editor !== "string" ||
		typeof value.corpus !== "string" || !Array.isArray(value.results) ||
		!value.results.every(is_portable_result)) {
		throw new Error("invalid runner report");
	}
	return {
		editor: value.editor,
		corpus: value.corpus,
		results: value.results,
	};
}

function
is_portable_result(value: unknown): value is portable_result
{
	return is_record(value) && typeof value.name === "string" &&
		typeof value.requirement === "string" &&
		(value.result === "PASS" || value.result === "FAIL") &&
		Array.isArray(value.differences) &&
		value.differences.every((item) => typeof item === "string");
}

function
is_record(value: unknown): value is Record<string, unknown>
{
	return typeof value === "object" && value !== null;
}

function
error_text(error: unknown): string
{
	return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
	await main();
}

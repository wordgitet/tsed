/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { expect, test } from "bun:test";
import { dirname, join } from "node:path";

test("classifies a missing locale as skipped", async () => {
	const report = await disabled_capability_report(
		"utf8-locale",
		"torture/locale/dot-is-one-character",
	);
	expect(report).toMatchObject({
		summary: { SKIP: 1 },
		results: [{ result: "SKIP" }],
	});
});

test("classifies missing PTY support as a runner limit", async () => {
	const report = await disabled_capability_report(
		"pty",
		"terminal/prompt-and-quit",
	);
	expect(report).toMatchObject({
		summary: { RUNNER_LIMIT: 1 },
		results: [{ result: "RUNNER_LIMIT" }],
	});
});

async function
disabled_capability_report(
    capability: string,
    case_name: string,
): Promise<unknown>
{
	const project_root = dirname(dirname(import.meta.path));
	const runner = join(project_root, "test", "portable_v2_runner.ts");
	const child = Bun.spawn([
		process.execPath,
		runner,
		"--editor",
		process.execPath,
		"--disable-capability",
		capability,
		"--case",
		case_name,
		"--json",
	], {
		cwd: project_root,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect(stderr).toBe("");
	expect(status).toBe(0);
	return JSON.parse(stdout);
}

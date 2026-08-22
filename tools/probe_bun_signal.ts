/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { resolve } from "node:path";

async function
main(): Promise<void>
{
	const executable = process.argv[2] ?? resolve("dist/ed");
	const child = Bun.spawn([executable, "-s"], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	await Bun.sleep(50);
	child.kill("SIGBUS");
	const [status, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);

	process.stdout.write("Bun standalone SIGBUS probe (non-gating)\n");
	process.stdout.write("expected shell-style status: 135\n");
	process.stdout.write(`observed Bun status: ${status}\n`);
	if (stderr !== "") {
		process.stdout.write("observed standard error:\n");
		process.stdout.write(stderr);
		if (!stderr.endsWith("\n")) {
			process.stdout.write("\n");
		}
	}
}

if (import.meta.main) {
	await main();
}

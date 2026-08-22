/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

interface locale_target {
	label: string;
	locale: string;
}

async function
main(): Promise<void>
{
	const available = await available_locales();
	const targets: locale_target[] = [{ label: "POSIX", locale: "C" }];
	const utf8 = available.find((item) => /utf-?8/i.test(item));
	if (utf8 !== undefined && utf8 !== "C") {
		targets.push({ label: "UTF-8", locale: utf8 });
	}
	const single_byte = process.env.TSED_SINGLE_BYTE_LOCALE;
	if (single_byte !== undefined && single_byte.length !== 0) {
		targets.push({ label: "single-byte", locale: single_byte });
	}

	for (const target of targets) {
		await run_target(target);
	}
	if (single_byte === undefined || single_byte.length === 0) {
		process.stdout.write(
			"single-byte locale: skipped; set " +
				"TSED_SINGLE_BYTE_LOCALE to enable it\n",
		);
	}
}

async function
available_locales(): Promise<string[]>
{
	const child = Bun.spawn(["locale", "-a"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (status !== 0) {
		throw new Error(`cannot list locales: ${stderr.trim()}`);
	}
	return stdout.split("\n").filter((item) => item.length !== 0);
}

async function
run_target(target: locale_target): Promise<void>
{
	process.stdout.write(
		`locale matrix: ${target.label} (${target.locale})\n`,
	);
	const child = Bun.spawn([
		process.execPath,
		"test",
		"test/locale.test.ts",
		"test/parser.test.ts",
	], {
		env: {
			...process.env,
			LC_ALL: target.locale,
		},
		stdout: "inherit",
		stderr: "inherit",
	});
	const status = await child.exited;
	if (status !== 0) {
		throw new Error(
			`locale tests failed for ${target.locale} with status ${status}`,
		);
	}
}

if (import.meta.main) {
	await main();
}

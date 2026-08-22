/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { mkdir, symlink, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BunPlugin } from "bun";

async function
main(): Promise<void>
{
	const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
	const native_path = join(
		project_root,
		"build",
		"Release",
		"tsed_posix_regex.node",
	);
	await mkdir("dist", { recursive: true });
	const result = await Bun.build({
		entrypoints: ["src/main.ts"],
		plugins: [native_addon_plugin(native_path)],
		compile: {
			outfile: "dist/tsed",
		},
	});
	if (!result.success) {
		for (const log of result.logs) {
			console.error(log);
		}
		process.exitCode = 1;
		return;
	}

	try {
		await unlink("dist/ed");
	} catch (error) {
		if (!is_missing_file(error)) {
			throw error;
		}
	}
	await symlink("tsed", "dist/ed");
}

function
native_addon_plugin(native_path: string): BunPlugin
{
	return {
		name: "tsed-native-addon",
		setup(build)
		{
			build.onResolve({ filter: /^tsed-native-addon$/ }, () => ({
				path: "tsed-native-addon",
				namespace: "tsed-native-addon",
			}));
			build.onLoad(
				{
					filter: /^tsed-native-addon$/,
					namespace: "tsed-native-addon",
				},
				() => ({
					contents: [
						"module.exports = require(",
						JSON.stringify(native_path),
						");",
					].join(""),
					loader: "js",
				}),
			);
		},
	};
}

function
is_missing_file(error: unknown): boolean
{
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

void main();

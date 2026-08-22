/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

interface tour_example {
	name: string;
	script: string;
	expected: string;
}

const repository_root = resolve(import.meta.dir, "..");
const editor_pathname = resolve(repository_root, "dist", "ed");
const tour_pathname = resolve(repository_root, "TOUR");
const tour_source = await Bun.file(tour_pathname).text();
const examples = parse_tour(tour_source);

beforeAll(() => {
	if (!existsSync(editor_pathname)) {
		throw new Error("dist/ed is missing; run bun run build before tests");
	}
});

describe("TOUR transcripts", () => {
	test("all script blocks are executable transcripts", () => {
		const script_blocks =
			tour_source.match(/^BEGIN SCRIPT$/gm)?.length ?? 0;
		const names = new Set(examples.map((example) => example.name));

		expect(examples.length).toBeGreaterThan(0);
		expect(script_blocks).toBe(examples.length);
		expect(names.size).toBe(examples.length);
	});

	for (const example of examples) {
		test(example.name, () => {
			const result = Bun.spawnSync(["sh", "-c", example.script], {
				cwd: repository_root,
				env: {
					...process.env,
					LC_ALL: "C",
				},
				stderr: "pipe",
				stdout: "pipe",
			});
			const stdout = new TextDecoder().decode(result.stdout);
			const stderr = new TextDecoder().decode(result.stderr);

			expect(result.exitCode).toBe(0);
			expect(stderr).toBe("");
			expect(stdout).toBe(example.expected);
		});
	}
});

function
parse_tour(source: string): tour_example[]
{
	const pattern = new RegExp(
		"^TRANSCRIPT ([^\\n]+)\\n" +
		"BEGIN SCRIPT\\n([\\s\\S]*?)\\nEND SCRIPT\\n" +
		"BEGIN OUTPUT\\n([\\s\\S]*?)\\nEND OUTPUT\\n" +
		"END TRANSCRIPT$",
		"gm",
	);
	const parsed: tour_example[] = [];

	for (const match of source.matchAll(pattern)) {
		const name = match[1];
		const script = match[2];
		const output = match[3];
		if (
			name === undefined ||
			script === undefined ||
			output === undefined
		) {
			throw new Error("invalid TOUR transcript");
		}
		parsed.push({
			name,
			script,
			expected: `${output}\n`,
		});
	}

	return parsed;
}

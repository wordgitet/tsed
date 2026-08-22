/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	build_posix_corpus,
	build_posix_requirements,
} from "../tools/generate_posix_corpus";

test("POSIX corpus and requirements are current", async () => {
	const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
	const portable_directory = join(project_root, "test", "portable");
	const corpus = build_posix_corpus();
	const requirements = build_posix_requirements();
	const stored_corpus: unknown = await Bun.file(
		join(portable_directory, "cases-v2.json"),
	).json();
	const stored_requirements: unknown = await Bun.file(
		join(portable_directory, "requirements.json"),
	).json();
	const names = corpus.cases.map((item) => item.name);
	const requirement_ids = new Set(
		requirements.requirements.map((item) => item.id),
	);

	expect(stored_corpus).toEqual(corpus);
	expect(stored_requirements).toEqual(requirements);
	expect(new Set(names).size).toBe(names.length);
	expect(corpus.cases.length).toBeGreaterThanOrEqual(40);
	expect(requirements.requirements.length).toBeGreaterThanOrEqual(40);
	expect(corpus.cases.every((item) =>
		requirement_ids.has(item.requirement))).toBe(true);
	expect(requirements.requirements.every((item) =>
		item.coverage.length !== 0)).toBe(true);
});

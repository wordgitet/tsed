/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build_portable_corpus } from "../tools/generate_portable_corpus";

test("portable corpus is current and has unique case names", async () => {
    const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
    const corpus_path = join(project_root, "test", "portable", "cases.json");
    const generated = build_portable_corpus();
    const stored: unknown = await Bun.file(corpus_path).json();
    const names = generated.cases.map((item) => item.name);

    expect(stored).toEqual(generated);
    expect(new Set(names).size).toBe(names.length);
    expect(generated.cases.length).toBeGreaterThanOrEqual(100);
});

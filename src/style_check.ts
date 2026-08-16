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
    const files = await source_files("src");
    let failed = false;
    for (const pathname of files) {
        const source = await Bun.file(pathname).text();
        const lines = source.split("\n");
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

void main();

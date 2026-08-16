/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { mkdir, symlink, unlink } from "node:fs/promises";

async function
main(): Promise<void>
{
    await mkdir("dist", { recursive: true });
    const result = await Bun.build({
        entrypoints: ["src/main.ts"],
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
is_missing_file(error: unknown): boolean
{
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

void main();

/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { mkdir } from "node:fs/promises";

import { run_editor_case } from "../test/support/editor_harness";
import {
    case_seed,
    environment_integer,
    generate_program,
    input_lines,
    program_input,
    seed_text,
} from "./fuzz_support";

const DEFAULT_CASES = 10_000;
const DEFAULT_SEED = 0x54534544;

async function
main(): Promise<void>
{
    const count = environment_integer("TSED_FUZZ_CASES", DEFAULT_CASES);
    const base_seed = environment_integer("TSED_FUZZ_SEED", DEFAULT_SEED);

    for (let index = 0; index < count; index += 1) {
        const seed = case_seed(base_seed, index);
        const program = generate_program(seed);
        const input = program_input(program.groups, false);
        const result = await run_editor_case({
            lines: input_lines(input),
            input_kind: "terminal",
        });
        if (result.status !== 0 || result.stderr !== "" ||
            result.stdout !== program.expected_stdout) {
            const pathname = await save_failure(seed, input, program, result);
            throw new Error(
                `model mismatch at ${seed_text(seed)}; saved ${pathname}`,
            );
        }
        if ((index + 1) % 1_000 === 0 || index + 1 === count) {
            process.stdout.write(`model fuzz ${index + 1}/${count}\n`);
        }
    }
}

async function
save_failure(
    seed: number,
    input: string,
    program: ReturnType<typeof generate_program>,
    result: { status: number; stdout: string; stderr: string },
): Promise<string>
{
    await mkdir(".tmp/fuzz", { recursive: true });
    const pathname = `.tmp/fuzz/model-${seed_text(seed).slice(2)}.json`;
    await Bun.write(pathname, `${JSON.stringify({
        seed: seed_text(seed),
        input,
        expected_stdout: program.expected_stdout,
        result,
    }, null, 2)}\n`);
    return pathname;
}

if (import.meta.main) {
    await main();
}

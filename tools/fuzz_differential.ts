/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import {
    case_seed,
    environment_integer,
    generate_program,
    program_input,
    seed_text,
} from "./fuzz_support";

interface process_result {
    status: number;
    stdout: string;
    stderr: string;
}

const DEFAULT_CASES = 1_000;
const DEFAULT_SEED = 0x45444449;
const CASE_TIMEOUT_MS = 2_000;

async function
main(): Promise<void>
{
    const count = environment_integer("TSED_FUZZ_CASES", DEFAULT_CASES);
    const base_seed = environment_integer("TSED_FUZZ_SEED", DEFAULT_SEED);
    const executable = process.env.TSED_TEST_ED ?? resolve("dist/ed");
    const reference = process.env.TSED_REFERENCE_ED ?? "/usr/bin/ed";
    await check_executables(executable, reference);

    for (let index = 0; index < count; index += 1) {
        const seed = case_seed(base_seed, index);
        const program = generate_program(seed);
        const input = program_input(program.groups, true);
        const [actual, expected] = await Promise.all([
            run_process(executable, input),
            run_process(reference, input),
        ]);
        const model = {
            status: 0,
            stdout: program.expected_stdout,
            stderr: "",
        };
        if (!same_result(actual, expected) || !same_result(actual, model)) {
            const minimized = !same_result(actual, expected)
                ? await minimize(program.groups, executable, reference)
                : program.groups;
            const minimized_input = program_input(minimized, true);
            const [minimized_actual, minimized_expected] = await Promise.all([
                run_process(executable, minimized_input),
                run_process(reference, minimized_input),
            ]);
            const pathname = await save_failure(
                seed,
                program.groups,
                minimized,
                executable,
                reference,
                actual,
                expected,
                model,
                minimized_actual,
                minimized_expected,
            );
            throw new Error(
                `differential mismatch at ${seed_text(seed)}; ` +
                    `saved ${pathname}`,
            );
        }
        if ((index + 1) % 100 === 0 || index + 1 === count) {
            process.stdout.write(`differential fuzz ${index + 1}/${count}\n`);
        }
    }
}

async function
run_process(executable: string, input: string): Promise<process_result>
{
    const child = Bun.spawn([executable, "-s"], {
        env: { ...process.env, LC_ALL: "C" },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });
    child.stdin.write(input);
    child.stdin.end();

    let timeout_id: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeout_id = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${executable} exceeded ${CASE_TIMEOUT_MS} ms`));
        }, CASE_TIMEOUT_MS);
    });
    try {
        return await Promise.race([collect_process(child), timeout]);
    } finally {
        if (timeout_id !== undefined) {
            clearTimeout(timeout_id);
        }
    }
}

async function
collect_process(child: Bun.PipedSubprocess): Promise<process_result>
{
    const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    return { status, stdout, stderr };
}

async function
check_executables(executable: string, reference: string): Promise<void>
{
    const [actual_path, reference_path] = await Promise.all([
        realpath(executable),
        realpath(reference),
    ]);
    if (actual_path === reference_path) {
        throw new Error("tsed and reference ed resolve to the same executable");
    }
}

async function
minimize(
    source: readonly (readonly string[])[],
    executable: string,
    reference: string,
): Promise<readonly (readonly string[])[]>
{
    let groups = source.map((group) => [...group]);
    let chunk = Math.max(1, Math.floor((groups.length - 1) / 2));
    while (chunk >= 1) {
        let changed = false;
        for (let start = 1; start < groups.length; start += chunk) {
            const candidate = groups.slice(0, start).concat(
                groups.slice(start + chunk),
            );
            if (await differs(candidate, executable, reference)) {
                groups = candidate;
                changed = true;
                break;
            }
        }
        if (!changed) {
            chunk = Math.floor(chunk / 2);
        }
    }

    for (let group_index = 1; group_index < groups.length; group_index += 1) {
        const group = groups[group_index];
        if (group === undefined) {
            continue;
        }
        for (let line_index = 0; line_index < group.length; line_index += 1) {
            const original = group[line_index] ?? "";
            const shrunk = original.replaceAll(/[a-z]{2,}/g, "a");
            if (shrunk === original) {
                continue;
            }
            const candidate = groups.map((item) => [...item]);
            const candidate_group = candidate[group_index];
            if (candidate_group === undefined) {
                continue;
            }
            candidate_group[line_index] = shrunk;
            if (await differs(candidate, executable, reference)) {
                groups = candidate;
            }
        }
    }
    return groups;
}

async function
differs(
    groups: readonly (readonly string[])[],
    executable: string,
    reference: string,
): Promise<boolean>
{
    const input = program_input(groups, true);
    const [actual, expected] = await Promise.all([
        run_process(executable, input),
        run_process(reference, input),
    ]);
    return clean_result(actual) && clean_result(expected) &&
        !same_result(actual, expected);
}

function
clean_result(result: process_result): boolean
{
    return result.status === 0 && result.stderr === "" &&
        !result.stdout.includes("?\n");
}

function
same_result(first: process_result, second: process_result): boolean
{
    return first.status === second.status && first.stdout === second.stdout &&
        first.stderr === second.stderr;
}

async function
save_failure(
    seed: number,
    original_groups: readonly (readonly string[])[],
    minimized_groups: readonly (readonly string[])[],
    executable: string,
    reference: string,
    actual: process_result,
    expected: process_result,
    model: process_result,
    minimized_actual: process_result,
    minimized_expected: process_result,
): Promise<string>
{
    await mkdir(".tmp/fuzz", { recursive: true });
    const pathname = `.tmp/fuzz/differential-${seed_text(seed).slice(2)}.json`;
    await Bun.write(pathname, `${JSON.stringify({
        seed: seed_text(seed),
        executable,
        reference,
        original: {
            input: program_input(original_groups, true),
            groups: original_groups,
            actual,
            expected,
            model,
        },
        minimized: {
            input: program_input(minimized_groups, true),
            groups: minimized_groups,
            actual: minimized_actual,
            expected: minimized_expected,
        },
    }, null, 2)}\n`);
    return pathname;
}

if (import.meta.main) {
    await main();
}

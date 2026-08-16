/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface portable_case {
    name: string;
    arguments: string[];
    stdin: string;
    stdout: string;
    stderr: string;
    status: number;
}

interface portable_corpus {
    format: "portable-ed-corpus";
    version: 1;
    cases: portable_case[];
}

interface process_result {
    status: number;
    stdout: string;
    stderr: string;
}

const CASE_TIMEOUT_MS = 5_000;

async function
main(): Promise<void>
{
    const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
    const corpus_path = join(project_root, "test", "portable", "cases.json");
    const executable = process.argv[2] ?? process.env.TSED_TEST_ED ??
        join(project_root, "dist", "ed");
    const corpus = parse_corpus(await Bun.file(corpus_path).json());
    let failures = 0;

    for (const item of corpus.cases) {
        let result: process_result;
        try {
            result = await run_case(executable, item);
        } catch (error) {
            failures += 1;
            process.stderr.write(`FAIL ${item.name}: ${error_text(error)}\n`);
            continue;
        }
        const differences = compare_case(item, result);
        if (differences.length === 0) {
            process.stdout.write(`PASS ${item.name}\n`);
            continue;
        }
        failures += 1;
        process.stderr.write(`FAIL ${item.name}\n`);
        for (const difference of differences) {
            process.stderr.write(`  ${difference}\n`);
        }
    }

    const passed = corpus.cases.length - failures;
    process.stdout.write(
        `${passed}/${corpus.cases.length} portable cases passed\n`,
    );
    if (failures !== 0) {
        process.exitCode = 1;
    }
}

async function
run_case(executable: string, item: portable_case): Promise<process_result>
{
    const child = Bun.spawn([executable, ...item.arguments], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });
    child.stdin.write(item.stdin);
    child.stdin.end();

    let timeout_id: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeout_id = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`timeout after ${CASE_TIMEOUT_MS} ms`));
        }, CASE_TIMEOUT_MS);
    });

    try {
        return await Promise.race([
            collect_process(child),
            timeout,
        ]);
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

function
compare_case(item: portable_case, result: process_result): string[]
{
    const differences: string[] = [];
    if (result.status !== item.status) {
        differences.push(
            `status: expected ${item.status}, got ${result.status}`,
        );
    }
    if (result.stdout !== item.stdout) {
        differences.push(
            `stdout: expected ${quoted(item.stdout)}, ` +
                `got ${quoted(result.stdout)}`,
        );
    }
    if (result.stderr !== item.stderr) {
        differences.push(
            `stderr: expected ${quoted(item.stderr)}, ` +
                `got ${quoted(result.stderr)}`,
        );
    }
    return differences;
}

function
parse_corpus(value: unknown): portable_corpus
{
    if (!is_record(value) || value.format !== "portable-ed-corpus" ||
        value.version !== 1 || !Array.isArray(value.cases)) {
        throw new Error("unsupported portable corpus");
    }
    const cases = value.cases.map(parse_case);
    return { format: "portable-ed-corpus", version: 1, cases };
}

function
parse_case(value: unknown, index: number): portable_case
{
    if (!is_record(value) || typeof value.name !== "string" ||
        !is_string_array(value.arguments) || typeof value.stdin !== "string" ||
        typeof value.stdout !== "string" || typeof value.stderr !== "string" ||
        typeof value.status !== "number") {
        throw new Error(`invalid portable case at index ${index}`);
    }
    return {
        name: value.name,
        arguments: value.arguments,
        stdin: value.stdin,
        stdout: value.stdout,
        stderr: value.stderr,
        status: value.status,
    };
}

function
is_record(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null;
}

function
is_string_array(value: unknown): value is string[]
{
    return Array.isArray(value) && value.every((item) =>
        typeof item === "string");
}

function
quoted(value: string): string
{
    return JSON.stringify(value);
}

function
error_text(error: unknown): string
{
    return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
    await main();
}

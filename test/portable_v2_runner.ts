/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { Buffer } from "node:buffer";
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import type {
    encoded_data,
    expected_file,
    expected_outcome,
    expected_status,
    portable_action,
    portable_case_v2,
    portable_corpus_v2,
    portable_fixture,
} from "../tools/generate_posix_corpus";
import { pty_session } from "./support/pty_harness";

interface process_result {
    status: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
    transcript: string | undefined;
}

interface case_result {
    name: string;
    requirement: string;
    result: "PASS" | "FAIL";
    differences: readonly string[];
}

interface runner_options {
    executable: string;
    filter: string | undefined;
    json: boolean;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function
main(): Promise<void>
{
    const project_root = dirname(dirname(import.meta.path));
    const options = parse_options(process.argv.slice(2), project_root);
    const executable = await realpath(options.executable);
    const corpus_path = join(
        project_root,
        "test",
        "portable",
        "cases-v2.json",
    );
    const corpus = parse_corpus(await Bun.file(corpus_path).json());
    const selected = options.filter === undefined
        ? corpus.cases
        : corpus.cases.filter((item) =>
            item.name.includes(options.filter ?? ""));
    if (selected.length === 0) {
        throw new Error("no portable v2 cases matched the filter");
    }

    const results: case_result[] = [];
    for (const item of selected) {
        const result = await run_case(executable, item);
        results.push(result);
        if (!options.json) {
            write_human_result(result);
        }
    }

    const failures = results.filter((item) => item.result === "FAIL").length;
    if (options.json) {
        process.stdout.write(`${JSON.stringify({
            editor: executable,
            corpus: corpus.standard,
            results,
        }, null, 2)}\n`);
    } else {
        process.stdout.write(
            `${results.length - failures}/${results.length} ` +
                "portable v2 cases passed\n",
        );
    }
    if (failures !== 0) {
        process.exitCode = 1;
    }
}

async function
run_case(executable: string, item: portable_case_v2): Promise<case_result>
{
    const directory = await mkdtemp(join(tmpdir(), "tsed-portable-v2-"));
    try {
        await create_fixtures(directory, item.fixtures ?? []);
        const actual = item.mode === "pipe"
            ? await run_pipe_case(executable, directory, item)
            : await run_pty_case(executable, directory, item);
        const alternatives: string[][] = [];
        for (const outcome of item.expect) {
            const differences = await compare_outcome(
                directory,
                outcome,
                actual,
            );
            if (differences.length === 0) {
                return {
                    name: item.name,
                    requirement: item.requirement,
                    result: "PASS",
                    differences: [],
                };
            }
            alternatives.push(differences);
        }
        return {
            name: item.name,
            requirement: item.requirement,
            result: "FAIL",
            differences: best_differences(alternatives),
        };
    } catch (error) {
        return {
            name: item.name,
            requirement: item.requirement,
            result: "FAIL",
            differences: [error_text(error)],
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

async function
run_pipe_case(
    executable: string,
    directory: string,
    item: portable_case_v2,
): Promise<process_result>
{
    const child = Bun.spawn(
        [
            executable,
            ...item.arguments.map((value) => expand(value, directory)),
        ],
        {
            cwd: directory,
            env: case_environment(item, directory),
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const input = decode_data(item.stdin ?? utf8(""), directory);
    child.stdin.write(input);
    child.stdin.end();

    return await with_timeout(
        Promise.all([
            child.exited,
            new Response(child.stdout).arrayBuffer(),
            new Response(child.stderr).arrayBuffer(),
        ]).then(([status, stdout, stderr]) => ({
            status,
            stdout: new Uint8Array(stdout),
            stderr: new Uint8Array(stderr),
            transcript: undefined,
        })),
        item.timeout_ms ?? DEFAULT_TIMEOUT_MS,
        () => child.kill("SIGKILL"),
    );
}

async function
run_pty_case(
    executable: string,
    directory: string,
    item: portable_case_v2,
): Promise<process_result>
{
    const command = [
        executable,
        ...item.arguments.map((value) => expand(value, directory)),
    ];
    const session = new pty_session(
        command,
        directory,
        case_environment(item, directory),
    );
    try {
        for (const action of item.actions ?? []) {
            await perform_action(session, action, directory);
        }
        const status = await session.exited(
            item.timeout_ms ?? DEFAULT_TIMEOUT_MS,
        );
        return {
            status,
            stdout: new Uint8Array(0),
            stderr: new Uint8Array(0),
            transcript: session.output(),
        };
    } catch (error) {
        session.close();
        throw error;
    }
}

async function
perform_action(
    session: pty_session,
    action: portable_action,
    directory: string,
): Promise<void>
{
    switch (action.kind) {
    case "wait":
        await session.wait_for(expand(action.text, directory));
        return;
    case "write":
        session.write(
            new TextDecoder().decode(decode_data(action.data, directory)),
        );
        return;
    case "signal":
        session.signal(action.signal);
        return;
    }
}

async function
compare_outcome(
    directory: string,
    expected: expected_outcome,
    actual: process_result,
): Promise<string[]>
{
    const differences: string[] = [];
    if (!status_matches(expected.status, actual.status)) {
        differences.push(
            `status: expected ${String(expected.status)}, ` +
                `got ${actual.status}`,
        );
    }
    compare_stream(
        differences,
        "stdout",
        expected.stdout,
        actual.stdout,
        directory,
    );
    compare_stream_contains(
        differences,
        "stdout",
        expected.stdout_contains,
        actual.stdout,
        directory,
    );
    compare_stream_contains(
        differences,
        "stderr",
        expected.stderr_contains,
        actual.stderr,
        directory,
    );
    compare_minimum_bytes(
        differences,
        "stdout",
        expected.stdout_minimum_bytes,
        actual.stdout,
    );
    compare_minimum_bytes(
        differences,
        "stderr",
        expected.stderr_minimum_bytes,
        actual.stderr,
    );
    compare_stream(
        differences,
        "stderr",
        expected.stderr,
        actual.stderr,
        directory,
    );
    for (const text of expected.transcript_contains ?? []) {
        if (!(actual.transcript ?? "").includes(expand(text, directory))) {
            differences.push(
                `transcript does not contain ${JSON.stringify(text)}`,
            );
        }
    }
    for (const file of expected.files ?? []) {
        differences.push(...await compare_file(directory, file));
    }
    return differences;
}

function
status_matches(expected: expected_status, actual: number): boolean
{
    if (expected === "any") {
        return true;
    }
    if (expected === "nonzero") {
        return actual !== 0;
    }
    return actual === expected;
}

function
compare_stream(
    differences: string[],
    name: string,
    expected: encoded_data | undefined,
    actual: Uint8Array,
    directory: string,
): void
{
    if (expected === undefined) {
        return;
    }
    const bytes = decode_data(expected, directory);
    if (!bytes_equal(bytes, actual)) {
        differences.push(
            `${name}: expected ${display_bytes(bytes)}, ` +
                `got ${display_bytes(actual)}`,
        );
    }
}

function
compare_stream_contains(
    differences: string[],
    name: string,
    expected: readonly encoded_data[] | undefined,
    actual: Uint8Array,
    directory: string,
): void
{
    for (const item of expected ?? []) {
        const bytes = decode_data(item, directory);
        if (!contains_bytes(actual, bytes)) {
            differences.push(
                `${name}: does not contain ${display_bytes(bytes)}`,
            );
        }
    }
}

function
compare_minimum_bytes(
    differences: string[],
    name: string,
    minimum: number | undefined,
    actual: Uint8Array,
): void
{
    if (minimum !== undefined && actual.length < minimum) {
        differences.push(
            `${name}: expected at least ${minimum} bytes, ` +
                `got ${actual.length}`,
        );
    }
}

async function
compare_file(directory: string, expected: expected_file): Promise<string[]>
{
    const pathname = fixture_path(directory, expected.path);
    let actual: Uint8Array;
    try {
        actual = new Uint8Array(await readFile(pathname));
    } catch (error) {
        return [`file ${expected.path}: ${error_text(error)}`];
    }
    const bytes = decode_data(expected.data, directory);
    return bytes_equal(bytes, actual)
        ? []
        : [
            `file ${expected.path}: expected ${display_bytes(bytes)}, ` +
                `got ${display_bytes(actual)}`,
        ];
}

async function
create_fixtures(
    directory: string,
    fixtures: readonly portable_fixture[],
): Promise<void>
{
    for (const fixture of fixtures) {
        const pathname = fixture_path(directory, fixture.path);
        await mkdir(dirname(pathname), { recursive: true });
        await writeFile(pathname, decode_data(fixture.data, directory));
    }
}

function
fixture_path(directory: string, pathname: string): string
{
    const resolved = resolve(directory, pathname);
    if (resolved !== directory && !resolved.startsWith(`${directory}${sep}`)) {
        throw new Error(
            `fixture path escapes temporary directory: ${pathname}`,
        );
    }
    return resolved;
}

function
case_environment(
    item: portable_case_v2,
    directory: string,
): Record<string, string | undefined>
{
    const environment: Record<string, string | undefined> = {
        ...process.env,
        LC_ALL: "C",
    };
    for (const [name, value] of Object.entries(item.environment ?? {})) {
        environment[name] = expand(value, directory);
    }
    return environment;
}

function
decode_data(value: encoded_data, directory: string): Uint8Array
{
    if (value.encoding === "utf8") {
        return new TextEncoder().encode(expand(value.data, directory));
    }
    return new Uint8Array(Buffer.from(value.data, "base64"));
}

function
expand(value: string, directory: string): string
{
    return value.replaceAll("@TMP@", directory);
}

function
bytes_equal(first: Uint8Array, second: Uint8Array): boolean
{
    if (first.length !== second.length) {
        return false;
    }
    return first.every((value, index) => value === second[index]);
}

function
contains_bytes(haystack: Uint8Array, needle: Uint8Array): boolean
{
    if (needle.length === 0) {
        return true;
    }
    const last_start = haystack.length - needle.length;
    for (let start = 0; start <= last_start; start += 1) {
        if (needle.every((value, index) =>
            value === haystack[start + index])) {
            return true;
        }
    }
    return false;
}

function
display_bytes(value: Uint8Array): string
{
    const text = new TextDecoder("utf8", { fatal: false }).decode(value);
    if (!text.includes("\ufffd")) {
        return JSON.stringify(text);
    }
    return `base64:${Buffer.from(value).toString("base64")}`;
}

function
best_differences(alternatives: readonly string[][]): readonly string[]
{
    return alternatives.reduce(
        (best, current) => current.length < best.length ? current : best,
        alternatives[0] ?? ["no expected outcome"],
    );
}

function
write_human_result(result: case_result): void
{
    const stream = result.result === "PASS" ? process.stdout : process.stderr;
    stream.write(`${result.result} ${result.name}\n`);
    for (const difference of result.differences) {
        stream.write(`  ${difference}\n`);
    }
}

function
parse_options(
    arguments_list: readonly string[],
    project_root: string,
): runner_options
{
    let executable = process.env.TSED_TEST_ED ??
        join(project_root, "dist", "ed");
    let filter: string | undefined;
    let json = false;
    let positional_seen = false;

    for (let index = 0; index < arguments_list.length; index += 1) {
        const argument = arguments_list[index];
        if (argument === "--json") {
            json = true;
            continue;
        }
        if (argument === "--editor" || argument === "--case") {
            const value = arguments_list[index + 1];
            if (value === undefined) {
                throw new Error(`${argument} requires an argument`);
            }
            if (argument === "--editor") {
                executable = value;
            } else {
                filter = value;
            }
            index += 1;
            continue;
        }
        if (argument !== undefined && !argument.startsWith("-") &&
            !positional_seen) {
            executable = argument;
            positional_seen = true;
            continue;
        }
        throw new Error(`unknown runner option: ${argument ?? ""}`);
    }
    return { executable, filter, json };
}

function
parse_corpus(value: unknown): portable_corpus_v2
{
    if (!is_corpus(value)) {
        throw new Error("invalid portable v2 corpus");
    }
    return value;
}

function
is_corpus(value: unknown): value is portable_corpus_v2
{
    return is_record(value) && value.format === "portable-ed-corpus" &&
        value.version === 2 && value.license === "0BSD" &&
        value.standard === "POSIX.1-2024" && value.placeholder === "@TMP@" &&
        Array.isArray(value.cases) && value.cases.every(is_case);
}

function
is_case(value: unknown): value is portable_case_v2
{
    if (!is_record(value) || typeof value.name !== "string" ||
        typeof value.requirement !== "string" ||
        (value.mode !== "pipe" && value.mode !== "pty") ||
        !is_string_array(value.arguments) || !Array.isArray(value.expect) ||
        !value.expect.every(is_outcome)) {
        return false;
    }
    return optional(value.stdin, is_data) &&
        optional_array(value.actions, is_action) &&
        optional_array(value.fixtures, is_fixture) &&
        optional_string_record(value.environment) &&
        (value.timeout_ms === undefined ||
            typeof value.timeout_ms === "number");
}

function
is_outcome(value: unknown): value is expected_outcome
{
    if (!is_record(value) || !is_status(value.status)) {
        return false;
    }
    return optional(value.stdout, is_data) &&
        optional(value.stderr, is_data) &&
        optional_array(value.stdout_contains, is_data) &&
        optional_array(value.stderr_contains, is_data) &&
        optional_number(value.stdout_minimum_bytes) &&
        optional_number(value.stderr_minimum_bytes) &&
        (value.transcript_contains === undefined ||
            is_string_array(value.transcript_contains)) &&
        optional_array(value.files, is_expected_file);
}

function
is_status(value: unknown): value is expected_status
{
    return typeof value === "number" || value === "nonzero" ||
        value === "any";
}

function
is_action(value: unknown): value is portable_action
{
    if (!is_record(value) || typeof value.kind !== "string") {
        return false;
    }
    if (value.kind === "wait") {
        return typeof value.text === "string";
    }
    if (value.kind === "write") {
        return is_data(value.data);
    }
    return value.kind === "signal" &&
        (value.signal === "SIGINT" || value.signal === "SIGQUIT" ||
            value.signal === "SIGHUP");
}

function
is_fixture(value: unknown): value is portable_fixture
{
    return is_record(value) && typeof value.path === "string" &&
        is_data(value.data);
}

function
is_expected_file(value: unknown): value is expected_file
{
    return is_fixture(value);
}

function
is_data(value: unknown): value is encoded_data
{
    return is_record(value) &&
        (value.encoding === "utf8" || value.encoding === "base64") &&
        typeof value.data === "string";
}

function
optional<T>(
    value: unknown,
    guard: (item: unknown) => item is T,
): value is T | undefined
{
    return value === undefined || guard(value);
}

function
optional_array<T>(
    value: unknown,
    guard: (item: unknown) => item is T,
): value is T[] | undefined
{
    return value === undefined ||
        (Array.isArray(value) && value.every(guard));
}

function
optional_string_record(
    value: unknown,
): value is Record<string, string> | undefined
{
    return value === undefined ||
        (is_record(value) &&
            Object.values(value).every((item) => typeof item === "string"));
}

function
optional_number(value: unknown): value is number | undefined
{
    return value === undefined || typeof value === "number";
}

function
is_string_array(value: unknown): value is string[]
{
    return Array.isArray(value) &&
        value.every((item) => typeof item === "string");
}

function
is_record(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null;
}

function
utf8(data: string): encoded_data
{
    return { encoding: "utf8", data };
}

function
error_text(error: unknown): string
{
    return error instanceof Error ? error.message : String(error);
}

async function
with_timeout<T>(
    promise: Promise<T>,
    timeout_ms: number,
    timeout_action: () => void,
): Promise<T>
{
    let timeout_id: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeout_id = setTimeout(() => {
            timeout_action();
            reject(new Error(`timeout after ${timeout_ms} ms`));
        }, timeout_ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timeout_id !== undefined) {
            clearTimeout(timeout_id);
        }
    }
}

if (import.meta.main) {
    await main();
}

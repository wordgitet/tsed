/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { pty_session } from "../support/pty_harness";

const executable = resolve("dist/ed");
const sessions: pty_session[] = [];
const temporary_directories: string[] = [];

afterEach(async () => {
    for (const session of sessions.splice(0)) {
        session.close();
    }
    for (const directory of temporary_directories.splice(0)) {
        await rm(directory, { recursive: true, force: true });
    }
});

describe("standalone editor process", () => {
    test("prompts and quits through a PTY", async () => {
        const session = start_session();
        await session.wait_for(": ");
        session.write("q\n");

        expect(await session.exited()).toBe(0);
        expect(session.output()).toBe(": q\r\n");
    });

    test("recovers from a terminal command error", async () => {
        const session = start_session();
        await append_one_line(session);
        session.write("9p\n");
        await session.wait_for("9p\r\n?\r\n: ");
        session.write("1p\n");
        await session.wait_for("one\r\n: ");
        session.write("q\nq\n");

        expect(await session.exited()).toBe(1);
        expect(session.output()).toContain("one\r\n: ");
    });

    test("requires a repeated quit for a modified buffer", async () => {
        const session = start_session();
        await append_one_line(session);
        session.write("q\n");
        await session.wait_for("q\r\n?\r\n: ");
        session.write("q\n");

        expect(await session.exited()).toBe(0);
    });

    test("continues after terminal end of file", async () => {
        const session = start_session();
        await session.wait_for(": ");
        session.write("\x04");
        session.write("q\n");

        expect(await session.exited()).toBe(0);
        expect(session.output()).toContain("q\r\n");
    });

    test("interrupts pending input and returns to commands", async () => {
        const session = start_session();
        await session.wait_for(": ");
        session.write("a\npartial\n");
        await session.wait_for("partial\r\n");
        session.signal("SIGINT");
        await session.wait_for("?\r\n: ");
        session.write("Q\n");

        expect(await session.exited()).toBe(0);
    });

    test("ignores SIGQUIT", async () => {
        const session = start_session();
        await session.wait_for(": ");
        session.signal("SIGQUIT");
        session.write("q\n");

        expect(await session.exited()).toBe(0);
    });

    test("writes ed.hup after SIGHUP", async () => {
        const directory = await make_temporary_directory();
        const session = start_session(directory);
        await append_one_line(session);
        session.signal("SIGHUP");

        expect(await session.exited()).toBe(0);
        expect(await readFile(join(directory, "ed.hup"), "utf8"))
            .toBe("one\n");
    });

    test("runs from a relocated standalone path", async () => {
        const directory = await make_temporary_directory();
        const relocated = join(directory, "ed");
        await copyFile(executable, relocated);
        const session = start_session(directory, relocated);
        await session.wait_for(": ");
        session.write("q\n");

        expect(await session.exited()).toBe(0);
    });
});

function
start_session(cwd?: string, command = executable): pty_session
{
    const session = new pty_session([command, "-p", ": "], cwd);
    sessions.push(session);
    return session;
}

async function
append_one_line(session: pty_session): Promise<void>
{
    await session.wait_for(": ");
    session.write("a\none\n.\n");
    await session.wait_for(".\r\n: ");
}

async function
make_temporary_directory(): Promise<string>
{
    const directory = await mkdtemp(join(tmpdir(), "tsed-integration-"));
    temporary_directories.push(directory);
    return directory;
}

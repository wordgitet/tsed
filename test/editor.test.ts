/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { editor } from "../src/editor";
import {
    bytes_from_string,
    input_interrupted,
    type input_line,
    type input_source,
    type output_sink,
} from "../src/types";

class memory_input implements input_source {
    private index = 0;

    public constructor(private readonly lines: readonly (string | null)[]) {}

    public async read_line(): Promise<Uint8Array | null> {
        const value = this.lines[this.index];
        this.index += 1;
        return value == null ? null : bytes_from_string(value);
    }
}

class interruptible_input implements input_source {
    private first_line_read = false;
    private next_command_ready = false;
    private pending: ((line: input_line) => void) | undefined;

    public read_line(): Promise<input_line> {
        if (!this.first_line_read) {
            this.first_line_read = true;
            return Promise.resolve(bytes_from_string("a"));
        }
        if (this.next_command_ready) {
            return Promise.resolve(bytes_from_string("Q"));
        }
        return new Promise((resolve) => {
            this.pending = resolve;
        });
    }

    public interrupt(): void {
        this.next_command_ready = true;
        const resolve = this.pending;
        this.pending = undefined;
        resolve?.(input_interrupted);
    }
}

class memory_output implements output_sink {
    public stdout = "";
    public stderr = "";

    public write_stdout(bytes: Uint8Array): void {
        this.stdout += String.fromCharCode(...bytes);
    }

    public write_stderr(bytes: Uint8Array): void {
        this.stderr += String.fromCharCode(...bytes);
    }
}

class blocking_input implements input_source {
    private pending: ((line: input_line) => void) | undefined;

    public read_line(): Promise<input_line> {
        return new Promise((resolve) => {
            this.pending = resolve;
        });
    }

    public interrupt(): void {
        const resolve = this.pending;
        this.pending = undefined;
        resolve?.(input_interrupted);
    }
}

describe("editor", () => {
    test("runs append, substitute, print, and undo commands", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a",
                "one",
                "two",
                ".",
                "1,2s/o/O/g",
                "1,2p",
                "u",
                "1,2p",
                "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("One\ntwO\none\ntwo\n");
    });

    test("reuses the previous substitution replacement", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "one two", ".", "1s/one/ONE/", "1s/two/%/", "1p",
                "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("ONE ONE\n");
    });

    test("rejects percent without a previous replacement", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "line", ".", "1s/line/%/"]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(1);
        expect(output.stdout).toBe("?\n");
    });

    test("continues escaped-newline substitution replacements", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "abac", ".", "1s/a/a\\", "/g", ".=", "1,$p", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("3\na\nba\nc\n");
    });

    test("resolves excess, trailing, and unsigned addresses", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "one", "two", "three", "four", ".",
                "1", ".2p", "1,2,3d", "2,p", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("one\nthree\nfour\n");
    });

    test("preserves current-line edge cases", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "one", "two", "three", ".",
                "2", "h", ".=", "2i", ".", ".=", "2,2j", ".=",
                "1,2c", ".", ".=", "p", "1,$d", ".=", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("two\n2\n2\n2\n1\nthree\n0\n");
    });

    test("prints the next line for a null command", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "one", "two", "three", ".",
                "1p", "", "1p", ".+1p", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("one\ntwo\none\ntwo\n");
    });

    test("returns to command mode after input-mode end of file", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "old", ".", "i", "new", null, "1,$p", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("new\nold\n");
    });

    test("edits from shell output without replacing the pathname", async () => {
        const directory = await mkdtemp(join(tmpdir(), "tsed-editor-"));
        const pathname = join(directory, "shell-edit");
        try {
            await writeFile(pathname, "old\n");
            const output = new memory_output();
            const instance = new editor(
                new memory_input([
                    "e !printf 'new line\\n'", "f", "w", "q",
                ]),
                output,
                { input_kind: "regular", prompt: undefined, silent: true },
            );

            expect(await instance.run(pathname)).toBe(0);
            expect(output.stdout).toBe(`${pathname}\n`);
            expect(await readFile(pathname, "utf8")).toBe("new line\n");
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test("applies suffixes to marks and undo", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "one", "two", ".", "1kal", "'al", "1d", "ul",
                "=l", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("two$\none$\none$\n2\none$\n");
    });

    test("applies a suffix after interactive global commands", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "alpha", "beta", ".", "G/alpha/l", "p", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("alpha\nalpha\nalpha$\n");
    });

    test("executes multiline global command lists", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "alpha", "beta", "alpha", ".",
                "g/alpha/a\\", "alpha marked\\", ".\\", "s/alpha/ALPHA",
                "1,$p", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe(
            "ALPHA marked\nALPHA marked\n" +
            "alpha\nALPHA marked\nbeta\nalpha\nALPHA marked\n",
        );
    });

    test("uses omitted input terminators at the end of global lists", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "alpha", "beta", "alpha", ".",
                "g/alpha/c\\", "replacement", "1,$p", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("replacement\nbeta\nreplacement\n");
    });

    test("defaults an empty global list to print", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "alpha", "beta", ".", "g/alpha", "Q"]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("alpha\n");
    });

    test("unmarks replaced lines during global execution", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "x one", "x two", "x three", "x four", ".",
                "1,3g/x/.+1s/$/ changed/", "1,$p", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe(
            "x one\nx two changed\nx three\nx four changed\n",
        );
    });

    test("unmarks replaced lines during interactive globals", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "x one", "x two", "x three", "x four", ".",
                "1,3G/x/", ".+1s/$/ changed/", ".+1s/$/ changed/",
                "1,$p", "Q",
            ]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe(
            "x one\nx three\n" +
            "x one\nx two changed\nx three\nx four changed\n",
        );
    });

    test("stops interactive global execution at a failed command", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input([
                "a", "alpha", "beta", "alpha", ".",
                "G/alpha/", "s/missing/value/", ".=", "Q",
            ]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("alpha\n1\n");
    });

    test("stops interactive global execution after quit", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "one", "two", ".", "V/match/", "Q"]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("one\n");
    });

    test("writes an empty buffer as a complete save", async () => {
        const directory = await mkdtemp(join(tmpdir(), "tsed-editor-"));
        const pathname = join(directory, "empty-after-write");
        try {
            await writeFile(pathname, "one\n");
            const output = new memory_output();
            const instance = new editor(
                new memory_input(["1,$d", ".=", "w", "q"]),
                output,
                { input_kind: "regular", prompt: undefined, silent: true },
            );

            expect(await instance.run(pathname)).toBe(0);
            expect(output.stdout).toBe("0\n");
            expect(await readFile(pathname, "utf8")).toBe("");
        } finally {
            await rm(directory, { recursive: true });
        }
    });

    test("stops a regular-file script after a command error", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "abc", ".", "/missing/p", ".=", "Q"]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(1);
        expect(output.stdout).toBe("?\n");
    });

    test("continues terminal input after a command error", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "abc", ".", "/missing/p", ".=", "Q"]),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(1);
        expect(output.stdout).toBe("?\n1\n");
    });

    test("keeps modified-buffer warnings recoverable", async () => {
        const output = new memory_output();
        const instance = new editor(
            new memory_input(["a", "abc", ".", "q", ".p", "q", "Q"]),
            output,
            { input_kind: "regular", prompt: undefined, silent: true },
        );

        expect(await instance.run(undefined)).toBe(0);
        expect(output.stdout).toBe("?\nabc\n?\n");
    });

    test("interrupts a pending append without consuming the next command", async () => {
        const output = new memory_output();
        const instance = new editor(
            new interruptible_input(),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        const running = instance.run(undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
        instance.interrupt();

        expect(await running).toBe(0);
        expect(output.stdout).toBe("?\n");
    });

    test("hangup wakes pending input and exits", async () => {
        const output = new memory_output();
        const instance = new editor(
            new blocking_input(),
            output,
            { input_kind: "terminal", prompt: undefined, silent: true },
        );

        const running = instance.run(undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await instance.handle_hangup();

        expect(await running).toBe(0);
        expect(output.stdout).toBe("");
    });
});

/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

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

    public constructor(private readonly lines: string[]) {}

    public async read_line(): Promise<Uint8Array | null> {
        const value = this.lines[this.index];
        this.index += 1;
        return value === undefined ? null : bytes_from_string(value);
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

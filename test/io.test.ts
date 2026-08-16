/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { bytes_to_lines, stdin_line_reader } from "../src/io";
import {
    bytes_from_string,
    input_interrupted,
    string_from_bytes,
} from "../src/types";

describe("standard input line reader", () => {
    test("delivers a complete line before end of input", async () => {
        const chunks = [bytes_from_string("q\n"), null];
        const reader = new stdin_line_reader(
            async () => chunks.shift() ?? null,
        );

        const line = await reader.read_line();
        if (!(line instanceof Uint8Array)) {
            throw new Error("expected a line");
        }

        expect(string_from_bytes(line)).toBe("q");
        expect(await reader.read_line()).toBeNull();
    });

    test("resumes after a terminal end-of-file indication", async () => {
        const chunks = [
            bytes_from_string("inserted\n"),
            null,
            bytes_from_string("w\n"),
        ];
        const reader = new stdin_line_reader(
            async () => chunks.shift() ?? null,
        );

        const inserted = await reader.read_line();
        if (!(inserted instanceof Uint8Array)) {
            throw new Error("expected an inserted line");
        }
        expect(string_from_bytes(inserted)).toBe("inserted");
        expect(await reader.read_line()).toBeNull();

        const command = await reader.read_line();
        if (!(command instanceof Uint8Array)) {
            throw new Error("expected a command line");
        }
        expect(string_from_bytes(command)).toBe("w");
    });

    test("preserves input after an interrupt", async () => {
        let deliver: ((chunk: Uint8Array) => void) | undefined;
        const chunk = new Promise<Uint8Array>((resolve) => {
            deliver = resolve;
        });
        const reader = new stdin_line_reader(async () => chunk);
        const pending = reader.read_line();

        reader.interrupt();
        expect(await pending).toBe(input_interrupted);

        const next = reader.read_line();
        deliver?.(bytes_from_string("Q\n"));
        const line = await next;
        if (!(line instanceof Uint8Array)) {
            throw new Error("expected a line");
        }
        expect(string_from_bytes(line)).toBe("Q");
    });

    test("remembers an interrupt before a read begins", async () => {
        const reader = new stdin_line_reader(async () =>
            bytes_from_string("next\n"));

        reader.interrupt();

        expect(await reader.read_line()).toBe(input_interrupted);
        expect(await reader.read_line()).toEqual(bytes_from_string("next"));
    });

    test("rejects NUL in text input", () => {
        expect(() => bytes_to_lines(new Uint8Array([0x61, 0x00, 0x62]))).toThrow(
            "text contains NUL",
        );
    });
});

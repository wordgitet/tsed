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

    test("rejects NUL in text input", () => {
        expect(() => bytes_to_lines(new Uint8Array([0x61, 0x00, 0x62]))).toThrow(
            "text contains NUL",
        );
    });
});

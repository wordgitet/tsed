/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { line_buffer } from "../src/buffer";
import { bytes_from_string, string_from_bytes } from "../src/types";

function
line(value: string): Uint8Array
{
    return bytes_from_string(value);
}

function
text(buffer: line_buffer): string[]
{
    return buffer.all_lines.map((item) => string_from_bytes(item.bytes));
}

describe("line_buffer", () => {
    test("inserts, moves, copies, and joins stable lines", () => {
        const buffer = new line_buffer();
        buffer.insert_after(0, [line("one"), line("two"), line("three")]);
        buffer.move(1, 1, 3);
        expect(text(buffer)).toEqual(["two", "three", "one"]);
        buffer.copy(1, 2, 3);
        expect(text(buffer)).toEqual(["two", "three", "one", "two", "three"]);
        buffer.join(1, 2);
        expect(text(buffer)).toEqual(["twothree", "one", "two", "three"]);
    });

    test("snapshots restore content and marks", () => {
        const buffer = new line_buffer();
        buffer.insert_after(0, [line("one"), line("two")]);
        buffer.mark("a", 1);
        const snapshot = buffer.snapshot();
        buffer.delete(1, 1);
        buffer.restore(snapshot);
        expect(text(buffer)).toEqual(["one", "two"]);
        expect(buffer.marked("a")).toBe(1);
    });

    test("preserves a mark on the first replaced line", () => {
        const buffer = new line_buffer();
        buffer.load([line("one"), line("two")]);
        buffer.mark("a", 2);

        buffer.replace(2, 2, [line("TWO")]);

        expect(buffer.marked("a")).toBe(2);
        expect(text(buffer)).toEqual(["one", "TWO"]);
    });
});

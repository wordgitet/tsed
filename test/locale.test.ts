/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { compile_bre, find_bre, substitute_bre } from "../src/bre";
import { text_characters } from "../src/locale";
import { string_from_bytes } from "../src/types";

describe("POSIX locale regular expressions", () => {
    test.skipIf(!active_utf8_locale())(
        "matches complete multibyte characters",
        () => {
            const encoder = new TextEncoder();
            const line = encoder.encode("é");
            const pattern = string_from_bytes(encoder.encode("."));
            const program = compile_bre(pattern);
            const match = find_bre(line, program);

            program.close();
            expect(match).toEqual({ start: 0, end: 2, captures: new Map() });
        },
    );

    test.skipIf(!active_utf8_locale())(
        "uses locale classes and byte captures",
        () => {
            const encoder = new TextEncoder();
            const line = encoder.encode("café");
            const class_program = compile_bre("[[:alpha:]]\\{4\\}");
            const match = find_bre(line, class_program);
            class_program.close();
            const replacement_program = compile_bre(
                string_from_bytes(encoder.encode("é")),
            );
            const replacement = substitute_bre(
                line,
                replacement_program,
                "E",
                false,
                undefined,
            );
            replacement_program.close();

            expect(match?.end).toBe(5);
            expect(replacement.lines[0]).toEqual(encoder.encode("cafE"));
        },
    );

    test.skipIf(!active_utf8_locale())(
        "reports locale character boundaries",
        () => {
            const characters = text_characters(new TextEncoder().encode("aé"));

            expect(characters).toEqual([
                { start: 0, end: 1, printable: true },
                { start: 1, end: 3, printable: true },
            ]);
        },
    );

    test.skipIf(!active_utf8_locale())(
        "advances empty matches by a complete character",
        () => {
            const encoder = new TextEncoder();
            const line = encoder.encode("é");
            const program = compile_bre("a*");
            const result = substitute_bre(line, program, "X", true, undefined);

            program.close();
            expect(result.lines[0]).toEqual(encoder.encode("XéX"));
        },
    );

    test.skipIf(!active_utf8_locale())("rejects malformed text", () => {
        expect(() => text_characters(new Uint8Array([0xc3]))).toThrow(
            "invalid multibyte sequence",
        );
    });
});

function
active_utf8_locale(): boolean
{
    const locale = process.env.LC_ALL ??
        process.env.LC_CTYPE ??
        process.env.LANG ??
        "C";
	return /utf-?8/i.test(locale);
}

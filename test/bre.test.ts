/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { compile_bre, find_bre, substitute_bre } from "../src/bre";
import { bytes_from_string, string_from_bytes } from "../src/types";

describe("basic regular expressions", () => {
    test("matches BRE anchors, repetition, classes, and groups", () => {
        expect(
            find_bre(
                bytes_from_string("abc123"),
                compile_bre("^[a-z]*[[:digit:]]\\{3\\}$"),
            ),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("abab"), compile_bre("\\(ab\\)\\1")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("^abc"), compile_bre("\\(\\^a\\)bc")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("]"), compile_bre("[]]")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("*bc"), compile_bre("^*")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("a*c"), compile_bre("^*")),
        ).toBeUndefined();
        expect(
            find_bre(bytes_from_string("a\\c"), compile_bre("[\\]")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("c\\d"), compile_bre("[\\^ab]")),
        ).toBeDefined();
        expect(
            find_bre(
                bytes_from_string("ab0-]"),
                compile_bre("[][.-.]-0]"),
            ),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("Abc"), compile_bre("[[.a.]b]")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("Abc"), compile_bre("[[=a=]b]")),
        ).toBeDefined();
        expect(
            find_bre(
                bytes_from_string("ab0-]"),
                compile_bre("[A-[.].]c]"),
            ),
        ).toBeDefined();
        expect(() => compile_bre("[[.ch.]]")).toThrow();
        expect(() => compile_bre("[b-a]")).toThrow();
        expect(
            find_bre(
                bytes_from_string("a".repeat(256)),
                compile_bre("a\\{256\\}"),
            ),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("ab$"), compile_bre("\\(ab\\$\\)")),
        ).toBeDefined();
        expect(
            find_bre(bytes_from_string("ab"), compile_bre("\\(ab\\$\\)")),
        ).toBeUndefined();
    });

    test("substitutes matches and expands ampersand", () => {
        const result = substitute_bre(
            bytes_from_string("one two"),
            compile_bre("[a-z]*"),
            "<&>",
            false,
            undefined,
        );
        expect(result.changed).toBe(true);
        expect(result.lines.map(string_from_bytes)).toEqual(["<one> two"]);
    });
});

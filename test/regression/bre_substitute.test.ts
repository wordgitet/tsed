/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { compile_bre, find_bre, substitute_bre } from "../../src/bre";
import { bytes_from_string, string_from_bytes } from "../../src/types";
import { run_editor_case } from "../support/editor_harness";

interface match_case {
    name: string;
    pattern: string;
    text: string;
    start?: number;
    end?: number;
    from?: number;
}

interface substitution_case {
    name: string;
    pattern: string;
    text: string;
    replacement: string;
    global?: boolean;
    occurrence?: number;
    expected: readonly string[];
    changed?: boolean;
}

interface editor_substitution_case {
    name: string;
    initial: readonly string[];
    commands: readonly string[];
    stdout: string;
    status?: number;
}

const match_cases: readonly match_case[] = [
    { name: "finds a literal", pattern: "abc", text: "xxabcxx",
        start: 2, end: 5 },
    { name: "rejects an absent literal", pattern: "xyz", text: "abc" },
    { name: "matches one character with dot", pattern: ".", text: "abc",
        start: 0, end: 1 },
    { name: "matches two characters with dots", pattern: "..", text: "abc",
        start: 0, end: 2 },
    { name: "anchors at the beginning", pattern: "^abc", text: "abcdef",
        start: 0, end: 3 },
    { name: "rejects a displaced beginning anchor", pattern: "^abc",
        text: "xabc" },
    { name: "anchors at the end", pattern: "abc$", text: "xabc",
        start: 1, end: 4 },
    { name: "rejects a displaced ending anchor", pattern: "abc$",
        text: "abcx" },
    { name: "matches an empty line", pattern: "^$", text: "",
        start: 0, end: 0 },
    { name: "chooses an empty star match", pattern: "a*", text: "baa",
        start: 0, end: 0 },
    { name: "chooses the longest star match", pattern: "a*", text: "aaa",
        start: 0, end: 3 },
    { name: "repeats a trailing atom", pattern: "ab*", text: "abbb",
        start: 0, end: 4 },
    { name: "matches a bracket member", pattern: "[abc]", text: "xby",
        start: 1, end: 2 },
    { name: "matches a negated bracket", pattern: "[^abc]", text: "abx",
        start: 2, end: 3 },
    { name: "matches an alphabetic range", pattern: "[a-z]", text: "5m",
        start: 1, end: 2 },
    { name: "matches a numeric range", pattern: "[0-9]", text: "a7",
        start: 1, end: 2 },
    { name: "matches the alpha class", pattern: "[[:alpha:]]", text: "7A",
        start: 1, end: 2 },
    { name: "matches the digit class", pattern: "[[:digit:]]", text: "x4",
        start: 1, end: 2 },
    { name: "matches the alnum class", pattern: "[[:alnum:]]", text: "-9",
        start: 1, end: 2 },
    { name: "matches the blank class", pattern: "[[:blank:]]", text: "x y",
        start: 1, end: 2 },
    { name: "matches the lower class", pattern: "[[:lower:]]", text: "Aa",
        start: 1, end: 2 },
    { name: "matches the upper class", pattern: "[[:upper:]]", text: "aZ",
        start: 1, end: 2 },
    { name: "matches the space class", pattern: "[[:space:]]", text: "a\tb",
        start: 1, end: 2 },
    { name: "matches the hexadecimal class", pattern: "[[:xdigit:]]",
        text: "xF", start: 1, end: 2 },
    { name: "matches a closing bracket member", pattern: "[]]", text: "]",
        start: 0, end: 1 },
    { name: "matches a leading hyphen member", pattern: "[-a]", text: "-",
        start: 0, end: 1 },
    { name: "matches a trailing hyphen member", pattern: "[a-]", text: "-",
        start: 0, end: 1 },
    { name: "matches a grouped expression", pattern: "\\(ab\\)", text: "zab",
        start: 1, end: 3 },
    { name: "matches a back-reference", pattern: "\\(ab\\)\\1", text: "abab",
        start: 0, end: 4 },
    { name: "rejects a failed back-reference", pattern: "\\(ab\\)\\1",
        text: "abac" },
    { name: "matches an exact interval", pattern: "a\\{2\\}", text: "caa",
        start: 1, end: 3 },
    { name: "matches a bounded interval", pattern: "a\\{2,4\\}", text: "aaaaa",
        start: 0, end: 4 },
    { name: "matches an open interval", pattern: "a\\{2,\\}", text: "aaaa",
        start: 0, end: 4 },
    { name: "matches an escaped period", pattern: "\\.", text: "a.b",
        start: 1, end: 2 },
    { name: "treats unescaped plus as ordinary", pattern: "a+", text: "a+",
        start: 0, end: 2 },
    { name: "treats unescaped question as ordinary", pattern: "a?", text: "a?",
        start: 0, end: 2 },
    { name: "treats unescaped pipe as ordinary", pattern: "a|b", text: "a|b",
        start: 0, end: 3 },
    { name: "treats an interior caret as ordinary", pattern: "a^b",
        text: "a^b", start: 0, end: 3 },
    { name: "treats an interior dollar as ordinary", pattern: "a$b",
        text: "a$b", start: 0, end: 3 },
    { name: "matches a backslash bracket member", pattern: "[\\]", text: "c\\d",
        start: 1, end: 2 },
    { name: "matches a mixed backslash bracket", pattern: "[\\^ab]",
        text: "c\\d", start: 1, end: 2 },
    { name: "anchors inside a group", pattern: "\\(^a\\)", text: "a",
        start: 0, end: 1 },
    { name: "anchors the end inside a group", pattern: "\\(ab$\\)", text: "ab",
        start: 0, end: 2 },
    { name: "treats star after an anchor as ordinary", pattern: "^*",
        text: "*bc", start: 0, end: 1 },
    { name: "chooses the longest leftmost range", pattern: "a[a-z]*",
        text: "abc123", start: 0, end: 3 },
    { name: "starts matching at a byte offset", pattern: "a", text: "baaa",
        from: 2, start: 2, end: 3 },
    { name: "matches an ending anchor at the final offset", pattern: "$",
        text: "abc", from: 3, start: 3, end: 3 },
];

const invalid_patterns = [
    "[",
    "[z-a]",
    "\\(",
    "\\)",
    "a\\{2,1\\}",
    "a\\{999999999999\\}",
    "[[.ch.]]",
    "\\1",
    "\\(a\\)\\2",
    "[[:bogus:]]",
] as const;

const substitution_cases: readonly substitution_case[] = [
    { name: "replaces the first literal", pattern: "cat", text: "cat cat",
        replacement: "dog", expected: ["dog cat"] },
    { name: "replaces every literal", pattern: "cat", text: "cat cat",
        replacement: "dog", global: true, expected: ["dog dog"] },
    { name: "replaces a selected occurrence", pattern: "a", text: "aaa",
        replacement: "X", occurrence: 2, expected: ["aXa"] },
    { name: "leaves text when an occurrence is absent", pattern: "a",
        text: "a", replacement: "X", occurrence: 2, expected: ["a"],
        changed: false },
    { name: "expands the complete match", pattern: "cat", text: "cat",
        replacement: "<&>", expected: ["<cat>"] },
    { name: "quotes an ampersand", pattern: "cat", text: "cat",
        replacement: "\\&", expected: ["&"] },
    { name: "quotes a backslash", pattern: "cat", text: "cat",
        replacement: "\\\\", expected: ["\\"] },
    { name: "expands the first capture", pattern: "\\(ab\\)", text: "ab",
        replacement: "<\\1>", expected: ["<ab>"] },
    { name: "expands two captures", pattern: "\\(a\\)\\(b\\)", text: "ab",
        replacement: "\\2\\1", expected: ["ba"] },
    { name: "drops an unmatched capture", pattern: "\\(a\\)*b", text: "b",
        replacement: "x\\1y", expected: ["xy"] },
    { name: "splits a replacement at newline", pattern: "b", text: "abc",
        replacement: "B\nC", expected: ["aB", "Cc"] },
    { name: "deletes a match", pattern: "b", text: "abc",
        replacement: "", expected: ["ac"] },
    { name: "grows a match", pattern: "b", text: "abc",
        replacement: "BBBB", expected: ["aBBBBc"] },
    { name: "shrinks a match", pattern: "bbb", text: "abbbc",
        replacement: "B", expected: ["aBc"] },
    { name: "replaces a beginning anchor", pattern: "^", text: "abc",
        replacement: "X", expected: ["Xabc"] },
    { name: "replaces an ending anchor", pattern: "$", text: "abc",
        replacement: "X", expected: ["abcX"] },
    { name: "advances global empty matches", pattern: "a*", text: "bc",
        replacement: "X", global: true, expected: ["XbXcX"] },
    { name: "uses the longest global matches", pattern: "aa*", text: "aab",
        replacement: "X", global: true, expected: ["Xb"] },
    { name: "replaces a bracket match", pattern: "[0-9]", text: "a1b",
        replacement: "N", expected: ["aNb"] },
    { name: "reports no change without a match", pattern: "z", text: "abc",
        replacement: "X", expected: ["abc"], changed: false },
];

const editor_substitution_cases: readonly editor_substitution_case[] = [
    { name: "substitutes the current line", initial: ["one two"],
        commands: ["s/one/ONE/", "p"], stdout: "ONE two\n" },
    { name: "substitutes an addressed range", initial: ["one", "one"],
        commands: ["1,2s/one/ONE/", "1,$p"], stdout: "ONE\nONE\n" },
    { name: "substitutes globally", initial: ["aaa"],
        commands: ["s/a/X/g", "p"], stdout: "XXX\n" },
    { name: "substitutes a numbered occurrence", initial: ["aaa"],
        commands: ["s/a/X/2", "p"], stdout: "aXa\n" },
    { name: "prints with a substitution p flag", initial: ["abc"],
        commands: ["s/b/B/p"], stdout: "aBc\n" },
    { name: "numbers with a substitution n flag", initial: ["abc"],
        commands: ["s/b/B/n"], stdout: "1\taBc\n" },
    { name: "lists with a substitution l flag", initial: ["abc"],
        commands: ["s/b/B/l"], stdout: "aBc$\n" },
    { name: "prints when the final delimiter is omitted", initial: ["abc"],
        commands: ["s/b/B"], stdout: "aBc\n" },
    { name: "uses an alternate substitution delimiter", initial: ["abc"],
        commands: ["s#b#B#", "p"], stdout: "aBc\n" },
    { name: "preserves an escaped delimiter", initial: ["a/b"],
        commands: ["s/a\\/b/A\\/B/", "p"], stdout: "A/B\n" },
    { name: "reuses the previous expression", initial: ["one one"],
        commands: ["s/one/ONE/", "s//TWO/", "p"], stdout: "ONE TWO\n" },
    { name: "reuses the previous replacement", initial: ["one two"],
        commands: ["s/one/WORD/", "s/two/%/", "p"], stdout: "WORD WORD\n" },
    { name: "expands an ampersand in editor replacement", initial: ["abc"],
        commands: ["s/b/<&>/", "p"], stdout: "a<b>c\n" },
    { name: "expands a capture in editor replacement", initial: ["ab"],
        commands: ["s/\\(a\\)\\(b\\)/\\2\\1/", "p"], stdout: "ba\n" },
    { name: "splits a line with a continued replacement", initial: ["abc"],
        commands: ["s/b/B\\", "C/", "1,$p"], stdout: "aB\nCc\n" },
    { name: "deletes text with an empty replacement", initial: ["abc"],
        commands: ["s/b//", "p"], stdout: "ac\n" },
    { name: "updates the current line after range substitution",
        initial: ["one", "two", "one"],
        commands: ["1,3s/one/ONE/", ".="], stdout: "3\n" },
    { name: "undoes a substitution", initial: ["abc"],
        commands: ["s/b/B/", "u", "p"], stdout: "abc\n" },
    { name: "rejects a missing substitution match", initial: ["abc"],
        commands: ["s/z/Z/"], stdout: "?\n", status: 1 },
    { name: "rejects percent before any replacement", initial: ["abc"],
        commands: ["s/a/%/"], stdout: "?\n", status: 1 },
];

describe("BRE matching regressions", () => {
    for (const item of match_cases) {
        test(item.name, () => {
            const program = compile_bre(item.pattern);
            try {
                const match = find_bre(
                    bytes_from_string(item.text),
                    program,
                    item.from ?? 0,
                );
                if (item.start === undefined || item.end === undefined) {
                    expect(match).toBeUndefined();
                } else {
                    expect(match?.start).toBe(item.start);
                    expect(match?.end).toBe(item.end);
                }
            } finally {
                program.close();
            }
        });
    }

    for (const pattern of invalid_patterns) {
        test(`rejects invalid BRE ${JSON.stringify(pattern)}`, () => {
            expect(() => compile_bre(pattern)).toThrow();
        });
    }

    test("rejects a negative match offset", () => {
        const program = compile_bre("a");
        try {
            expect(() => find_bre(bytes_from_string("a"), program, -1))
                .toThrow("invalid regular expression offset");
        } finally {
            program.close();
        }
    });

    test("rejects a match offset beyond the line", () => {
        const program = compile_bre("a");
        try {
            expect(() => find_bre(bytes_from_string("a"), program, 2))
                .toThrow("invalid regular expression offset");
        } finally {
            program.close();
        }
    });

    test("rejects use after a BRE is closed", () => {
        const program = compile_bre("a");
        program.close();
        expect(() => find_bre(bytes_from_string("a"), program))
            .toThrow("regular expression is closed");
    });

    test("reports capture byte ranges", () => {
        const program = compile_bre("\\(ab\\)\\(c\\)");
        try {
            const match = find_bre(bytes_from_string("zabc"), program);
            expect(match?.captures.get(1)).toEqual({ start: 1, end: 3 });
            expect(match?.captures.get(2)).toEqual({ start: 3, end: 4 });
        } finally {
            program.close();
        }
    });
});

describe("BRE replacement regressions", () => {
    for (const item of substitution_cases) {
        test(item.name, () => {
            const program = compile_bre(item.pattern);
            try {
                const result = substitute_bre(
                    bytes_from_string(item.text),
                    program,
                    item.replacement,
                    item.global ?? false,
                    item.occurrence,
                );
                expect(result.changed).toBe(item.changed ?? true);
                expect(result.lines.map(string_from_bytes)).toEqual([
                    ...item.expected,
                ]);
            } finally {
                program.close();
            }
        });
    }
});

describe("editor substitution regressions", () => {
    for (const item of editor_substitution_cases) {
        test(item.name, async () => {
            const result = await run_editor_case({
                lines: ["a", ...item.initial, ".", ...item.commands, "Q"],
                input_kind: item.status === undefined ? "regular" : "terminal",
            });
            expect(result.status).toBe(item.status ?? 0);
            expect(result.stdout).toBe(item.stdout);
            expect(result.stderr).toBe("");
        });
    }
});

/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { parse_command, split_substitute } from "../src/parser";
import { string_from_bytes } from "../src/types";

describe("command parser", () => {
    test("parses ranges and offsets", () => {
        const parsed = parse_command("1,$-2p");
        expect(parsed.command).toBe("p");
        expect(parsed.addresses).toHaveLength(2);
        expect(parsed.addresses[1]?.offset).toBe(-2);
        expect(parse_command(",p").addresses).toHaveLength(2);
    });

    test("parses unsigned offsets and trailing separators", () => {
        expect(parse_command(".2p").addresses[0]?.offset).toBe(2);
        expect(parse_command("'a3p").addresses[0]?.offset).toBe(3);
        expect(parse_command("4,d").addresses[1]?.expression).toEqual({
            kind: "previous",
        });
        expect(parse_command("4;d").addresses[1]?.expression).toEqual({
            kind: "previous",
        });
        expect(parse_command(",p").addresses[1]?.expression).toEqual({
            kind: "last",
        });
    });

    test("accepts a newline-terminated search expression", () => {
        const parsed = parse_command("/needle");
        expect(parsed.addresses[0]?.expression).toEqual({
            kind: "search",
            pattern: "needle",
            direction: "forward",
        });
        expect(parsed.command).toBe("p");
    });

    test("preserves escaped substitute delimiters", () => {
        expect(split_substitute("/a\\/b/a\\/b/g")).toEqual({
            pattern: "a\\/b",
            replacement: "a\\/b",
            flags: "g",
        });
        expect(split_substitute("/a/b")).toEqual({
            pattern: "a",
            replacement: "b",
            flags: "p",
        });
    });

    test.skipIf(!active_utf8_locale())(
        "accepts a multibyte substitute delimiter",
        () => {
            const source = string_from_bytes(
                new TextEncoder().encode("éaébég"),
            );
            expect(split_substitute(source)).toEqual({
                pattern: "a",
                replacement: "b",
                flags: "g",
            });
        },
    );
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

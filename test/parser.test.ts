/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { parse_command, split_substitute } from "../src/parser";

describe("command parser", () => {
    test("parses ranges and offsets", () => {
        const parsed = parse_command("1,$-2p");
        expect(parsed.command).toBe("p");
        expect(parsed.addresses).toHaveLength(2);
        expect(parsed.addresses[1]?.offset).toBe(-2);
        expect(parse_command(",p").addresses).toHaveLength(2);
    });

    test("preserves escaped substitute delimiters", () => {
        expect(split_substitute("/a\\/b/a\\/b/g")).toEqual({
            pattern: "a\\/b",
            replacement: "a\\/b",
            flags: "g",
        });
    });
});

/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { describe, expect, test } from "bun:test";

import { parse_options } from "../src/main";

describe("command-line options", () => {
    test("accepts grouped options with a final separate argument", () => {
        expect(parse_options(["-sp", ":", "file"])).toEqual({
            pathname: "file",
            prompt: ":",
            silent: true,
        });
    });

    test("accepts a final attached option argument", () => {
        expect(parse_options(["-sp:", "file"])).toEqual({
            pathname: "file",
            prompt: ":",
            silent: true,
        });
    });
});

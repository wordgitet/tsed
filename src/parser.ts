/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { next_character } from "./locale";
import {
	ed_error,
	type address_expression,
	type address_spec,
	type parsed_command,
} from "./types";

interface address_result {
    expression: address_expression;
    index: number;
}

export function parse_command(source: string): parsed_command {
    let index = skip_spaces(source, 0);
    const addresses: address_spec[] = [];
    let separator: "," | ";" | null = null;

    const leading_separator = source[index];
    if (addresses.length === 0 && (leading_separator === "," || leading_separator === ";")) {
        addresses.push({
            expression: leading_separator === ","
                ? { kind: "number", value: 1 }
                : { kind: "current" },
            separator: null,
            offset: 0,
        });
        separator = leading_separator;
        index = skip_spaces(source, index + 1);
    }

    while (true) {
        const address = parse_address(source, index);
        if (address === undefined) {
            break;
        }
        index = skip_spaces(source, address.index);
        const offset_result = parse_offset(source, index);
        index = skip_spaces(source, offset_result.index);
        addresses.push({
            expression: address.expression,
            separator,
            offset: offset_result.offset,
        });

        const next = source[index];
        if (next !== "," && next !== ";") {
            break;
        }
        separator = next;
        index = skip_spaces(source, index + 1);
    }

    if (addresses.length === 1 && separator !== null) {
        addresses.push({
            expression: { kind: "last" },
            separator,
            offset: 0,
        });
    }

    const command = source[index] ?? "";
    if (command === "") {
        return {
            addresses,
            command: addresses.length === 0 ? "" : "p",
            argument: "",
            suffix: "",
        };
    }

    return {
        addresses,
        command,
        argument: source.slice(index + 1),
        suffix: "",
    };
}

function parse_address(source: string, start: number): address_result | undefined {
    const character = source[start];
    if (character === undefined) {
        return undefined;
    }

    if (character === ".") {
        return { expression: { kind: "current" }, index: start + 1 };
    }
    if (character === "$") {
        return { expression: { kind: "last" }, index: start + 1 };
    }
    if (character === "'") {
        const name = source[start + 1];
        if (name === undefined) {
            throw new ed_error("invalid mark address");
        }
        return { expression: { kind: "mark", name }, index: start + 2 };
    }
    if (character === "/" || character === "?") {
        const pattern_result = read_delimited(source, start, character);
        return {
            expression: {
                kind: "search",
                pattern: pattern_result.value,
                direction: character === "/" ? "forward" : "backward",
            },
            index: pattern_result.index,
        };
    }
    if (character === "+" || character === "-") {
        return { expression: { kind: "current" }, index: start };
    }
    if (character < "0" || character > "9") {
        return undefined;
    }

    let index = start;
    while (index < source.length && is_digit(source[index] ?? "")) {
        index += 1;
    }
    const value = Number(source.slice(start, index));
    if (!Number.isSafeInteger(value)) {
        throw new ed_error("invalid address");
    }
    return { expression: { kind: "number", value }, index };
}

function parse_offset(source: string, start: number): { offset: number; index: number } {
    let index = start;
    let offset = 0;
    while (source[index] === "+" || source[index] === "-") {
        const sign = source[index] === "+" ? 1 : -1;
        index += 1;
        const number_start = index;
        while (index < source.length && is_digit(source[index] ?? "")) {
            index += 1;
        }
        const distance = index === number_start ? 1 : Number(source.slice(number_start, index));
        if (!Number.isSafeInteger(distance)) {
            throw new ed_error("invalid address offset");
        }
        offset += sign * distance;
    }
    return { offset, index };
}

export function read_delimited(
    source: string,
    start: number,
    delimiter: string,
): { value: string; index: number } {
	const delimiter_end = character_end(source, start);
	if (delimiter_end === undefined) {
		throw new ed_error("unterminated delimiter");
	}
	const actual_delimiter = source.slice(start, delimiter_end);
	if (actual_delimiter !== delimiter) {
		throw new ed_error("invalid delimiter");
	}
	let index = delimiter_end;
	let value = "";
	while (index < source.length) {
		const end = character_end(source, index);
		if (end === undefined) {
			throw new ed_error("unterminated delimiter");
		}
		const character = source.slice(index, end);
		if (character === actual_delimiter) {
			return { value, index: end };
		}
		if (character === "\\" && end < source.length) {
			const escaped_end = character_end(source, end);
			if (escaped_end === undefined) {
				throw new ed_error("unterminated delimiter");
			}
			value += source.slice(index, escaped_end);
			index = escaped_end;
		} else {
			value += character;
			index = end;
		}
	}
	throw new ed_error("unterminated delimiter");
}

export function
first_character(source: string): string | undefined
{
	return read_character(source, 0);
}

export function split_substitute(argument: string): {
    pattern: string;
    replacement: string;
    flags: string;
} {
	const delimiter = read_character(argument, 0);
	if (delimiter === undefined || delimiter === " " || delimiter === "\t") {
		throw new ed_error("invalid substitute command");
	}
	const pattern_result = read_delimited(argument, 0, delimiter);
	const replacement_result = read_delimited(
		argument,
		pattern_result.index - delimiter.length,
		delimiter,
	);
    return {
        pattern: pattern_result.value,
        replacement: replacement_result.value,
        flags: argument.slice(replacement_result.index),
    };
}

function skip_spaces(source: string, start: number): number {
    let index = start;
    while (source[index] === " " || source[index] === "\t") {
        index += 1;
    }
    return index;
}

function is_digit(value: string): boolean {
	return value >= "0" && value <= "9";
}

function
read_character(source: string, start: number): string | undefined
{
	const end = character_end(source, start);
	return end === undefined ? undefined : source.slice(start, end);
}

function
character_end(source: string, start: number): number | undefined
{
	if (start >= source.length) {
		return undefined;
	}
	if ((source.charCodeAt(start) ?? 0) < 0x80) {
		return start + 1;
	}
	const bytes = new Uint8Array(source.length);
	for (let index = 0; index < source.length; index += 1) {
		bytes[index] = source.charCodeAt(index) & 0xff;
	}
	return next_character(bytes, start);
}

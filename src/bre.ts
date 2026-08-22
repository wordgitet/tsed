/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { bytes_from_string, ed_error, string_from_bytes } from "./types";
import { posix_regex, type native_span } from "./native";

interface capture_span {
	start: number;
	end: number;
}

export interface bre_match {
	start: number;
	end: number;
	captures: Map<number, capture_span>;
}

export class bre_program {
	public readonly source: string;
	private handle: unknown;
	private closed = false;

	public constructor(source: string, handle: unknown)
	{
		this.source = source;
		this.handle = handle;
	}

	public close(): void
	{
		this.closed = true;
		this.handle = undefined;
	}

	public native_handle(): unknown
	{
		if (this.closed) {
			throw new ed_error("regular expression is closed");
		}
		return this.handle;
	}
}

export interface substitution_result {
	changed: boolean;
	lines: Uint8Array[];
}

export function
compile_bre(source: string): bre_program
{
	try {
		const handle = posix_regex().compile(bytes_from_string(source));
		return new bre_program(source, handle);
	} catch (error) {
		throw translate_regex_error(error);
	}
}

export function
find_bre(
    line_bytes: Uint8Array,
    program: bre_program,
    from = 0,
): bre_match | undefined
{
	if (from < 0 || from > line_bytes.length) {
		throw new ed_error("invalid regular expression offset");
	}
	try {
		const result = posix_regex().execute(
		    program.native_handle(),
		    line_bytes,
		    from,
		);
		if (result === null) {
			return undefined;
		}
		return {
			start: result.start,
			end: result.end,
			captures: make_captures(result.captures),
		};
	} catch (error) {
		throw translate_regex_error(error);
	}
}

export function
substitute_bre(
    line_bytes: Uint8Array,
    program: bre_program,
    replacement: string,
    global: boolean,
    occurrence: number | undefined,
): substitution_result
{
	const line = string_from_bytes(line_bytes);
	const replacements: Array<{ match: bre_match; value: string }> = [];
	let from = 0;
	let match_number = 0;

	while (from <= line_bytes.length) {
		const match = find_bre(line_bytes, program, from);
		if (match === undefined) {
			break;
		}
		match_number += 1;
		if (occurrence === undefined || occurrence === match_number) {
			replacements.push({
				match,
				value: expand_replacement(line, match, replacement),
			});
		}
		if (!global && occurrence === undefined) {
			break;
		}
		if (occurrence !== undefined && match_number >= occurrence) {
			break;
		}
		from = next_match_offset(line_bytes, match);
	}

	if (replacements.length === 0) {
		return { changed: false, lines: [line_bytes] };
	}

	let result = "";
	let offset = 0;
	for (const replacement_item of replacements) {
		result += line.slice(offset, replacement_item.match.start);
		result += replacement_item.value;
		offset = replacement_item.match.end;
	}
	result += line.slice(offset);

	return {
		changed: true,
		lines: result.split("\n").map((item) => bytes_from_string(item)),
	};
}

function
make_captures(
    captures: readonly (native_span | null)[],
): Map<number, capture_span>
{
	const result = new Map<number, capture_span>();
	for (let index = 0; index < captures.length; index += 1) {
		const capture = captures[index];
		if (capture !== null && capture !== undefined) {
			result.set(index + 1, capture);
		}
	}
	return result;
}

function
next_match_offset(line: Uint8Array, match: bre_match): number
{
	if (match.start !== match.end) {
		return match.end;
	}
	if (match.end >= line.length) {
		return line.length + 1;
	}
	try {
		return posix_regex().next_character(line, match.end);
	} catch (error) {
		throw translate_regex_error(error);
	}
}

function
expand_replacement(line: string, match: bre_match, replacement: string): string
{
	let result = "";
	for (let index = 0; index < replacement.length; index += 1) {
		const character = replacement[index];
		if (character === "&") {
			result += line.slice(match.start, match.end);
			continue;
		}
		if (character !== "\\") {
			result += character;
			continue;
		}

		const next = replacement[++index];
		if (next === undefined) {
			result += "\\";
			break;
		}
		if (next >= "1" && next <= "9") {
			const capture = match.captures.get(Number(next));
			if (capture !== undefined) {
				result += line.slice(capture.start, capture.end);
			}
		} else {
			result += next;
		}
	}
	return result;
}

function
translate_regex_error(error: unknown): ed_error | Error
{
	if (error instanceof ed_error) {
		return error;
	}
	if (error instanceof Error) {
		return new ed_error(error.message, false);
	}
	return new ed_error("regular expression operation failed");
}

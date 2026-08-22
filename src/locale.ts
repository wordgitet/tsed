/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { next_text_character, scan_text } from "./native";
import { ed_error } from "./types";

export interface text_character {
	start: number;
	end: number;
	printable: boolean;
}

export function
validate_text(bytes: Uint8Array): void
{
	try {
		scan_text(bytes);
	} catch (error) {
		throw invalid_text_error(error);
	}
}

export function
text_characters(bytes: Uint8Array): text_character[]
{
	try {
		return scan_text(bytes);
	} catch (error) {
		throw invalid_text_error(error);
	}
}

export function
next_character(bytes: Uint8Array, offset: number): number
{
	try {
		return next_text_character(bytes, offset);
	} catch (error) {
		throw invalid_text_error(error);
	}
}

function
invalid_text_error(error: unknown): ed_error
{
	if (error instanceof Error && error.message === "text contains NUL") {
		return new ed_error("text contains NUL");
	}
	return new ed_error("text contains an invalid multibyte sequence");
}

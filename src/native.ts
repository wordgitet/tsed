/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface native_span {
	start: number;
	end: number;
}

export interface native_match {
	start: number;
	end: number;
	captures: readonly (native_span | null)[];
}

export interface native_character {
	start: number;
	end: number;
	printable: boolean;
}

interface native_module {
	initialize_locale(): void;
	compile(pattern: Uint8Array): unknown;
	execute(
		program: unknown,
		line: Uint8Array,
		from: number,
	): native_match | null;
	scan_text(bytes: Uint8Array): native_character[];
	next_character(bytes: Uint8Array, offset: number): number;
}

type native_loader = (path: string) => native_module;

const runtime_require = createRequire(import.meta.url);
let loaded_module: native_module | undefined;
let locale_initialized = false;

export function
posix_regex(): native_module
{
	if (loaded_module === undefined) {
		loaded_module = load_native_module();
	}
	if (!locale_initialized) {
		loaded_module.initialize_locale();
		locale_initialized = true;
	}
	return loaded_module;
}

export function
scan_text(bytes: Uint8Array): native_character[]
{
	return posix_regex().scan_text(bytes);
}

export function
next_text_character(bytes: Uint8Array, offset: number): number
{
	return posix_regex().next_character(bytes, offset);
}

function
load_native_module(): native_module
{
	const package_root = dirname(dirname(fileURLToPath(import.meta.url)));

	try {
		return require("tsed-native-addon") as native_module;
	} catch (embedded_error) {
		try {
			return require("../build/Release/tsed_posix_regex.node") as native_module;
		} catch (local_error) {
			try {
				const loader = runtime_require("node-gyp-build") as native_loader;
				return loader(package_root);
			} catch (loader_error) {
				throw new Error(
					"cannot load the POSIX regular-expression backend",
					{
						cause: loader_error instanceof Error
							? loader_error
							: embedded_error instanceof Error
								? embedded_error
								: local_error,
					},
				);
			}
		}
	}
}

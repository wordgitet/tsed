/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { editor } from "../../src/editor";
import {
	bytes_from_string,
	type input_kind,
	type input_line,
	type input_source,
	type output_sink,
} from "../../src/types";

export interface editor_case {
	lines: readonly (string | null)[];
	input_kind?: input_kind;
	pathname?: string;
	prompt?: string;
	silent?: boolean;
}

export interface editor_result {
	status: number;
	stdout: string;
	stderr: string;
}

export class memory_input implements input_source {
	private index = 0;

	public constructor(
		private readonly lines: readonly (string | null)[],
	)
	{
	}

	public read_line(): Promise<input_line>
	{
		const value = this.lines[this.index];
		this.index += 1;
		return Promise.resolve(
			value == null ? null : bytes_from_string(value),
		);
	}
}

export class memory_output implements output_sink {
	public stdout = "";
	public stderr = "";

	public write_stdout(bytes: Uint8Array): void
	{
		this.stdout += String.fromCharCode(...bytes);
	}

	public write_stderr(bytes: Uint8Array): void
	{
		this.stderr += String.fromCharCode(...bytes);
	}
}

export async function
run_editor_case(specification: editor_case): Promise<editor_result>
{
	const output = new memory_output();
	const instance = new editor(
		new memory_input(specification.lines),
		output,
		{
			input_kind: specification.input_kind ?? "regular",
			prompt: specification.prompt,
			silent: specification.silent ?? true,
		},
	);
	const status = await instance.run(specification.pathname);
	return {
		status,
		stdout: output.stdout,
		stderr: output.stderr,
	};
}

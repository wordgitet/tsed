/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { line_buffer } from "./buffer";
import { compile_bre, find_bre, substitute_bre, type bre_program } from "./bre";
import {
	bytes_to_lines,
	lines_to_bytes,
	read_file_bytes,
	run_shell,
	write_file_bytes,
} from "./io";
import {
	text_characters,
	validate_text,
	type text_character,
} from "./locale";
import {
	first_character,
	parse_command,
	read_delimited,
	split_substitute,
} from "./parser";
import {
	bytes_from_string,
	copy_bytes,
	ed_error,
	input_interrupted,
	string_from_bytes,
	type address_expression,
	type address_spec,
	type editor_snapshot,
	type input_kind,
	type input_source,
	type output_sink,
	type parsed_command,
} from "./types";

export interface editor_options {
	input_kind: input_kind;
	prompt: string | undefined;
	silent: boolean;
}

type undo_state =
	| { kind: "snapshot"; snapshot: editor_snapshot }
	| { kind: "no-op" };

export class editor {
	private readonly buffer = new line_buffer();
	private readonly input: input_source;
	private readonly output: output_sink;
	private readonly options: editor_options;
	private pathname: string | undefined;
	private last_regex: string | undefined;
	private last_replacement: string | undefined;
	private last_shell_command: string | undefined;
	private prompt_enabled: boolean;
	private help_enabled = false;
	private undo_state: undo_state | undefined;
	private quit_requested = false;
	private had_error = false;
	private interrupted = false;
	private command_input: Uint8Array[] | undefined;

	public constructor(
	    input: input_source,
	    output: output_sink,
	    options: editor_options,
	)
	{
		this.input = input;
		this.output = output;
		this.options = options;
		this.prompt_enabled = options.prompt !== undefined;
	}

	public async run(initial_path: string | undefined): Promise<number>
	{
		if (initial_path !== undefined) {
			try {
				await this.edit_file(initial_path, true);
			} catch (error) {
				this.report_error(error);
				return 1;
			}
		}

		while (!this.quit_requested) {
			if (this.prompt_enabled) {
				this.write_stdout(this.options.prompt ?? "*");
			}

			const line = await this.input.read_line();
			if (line === input_interrupted) {
				if (this.quit_requested) {
					continue;
				}
				this.handle_command_error(this.take_interrupt_error());
				continue;
			}
			if (line === null) {
				try {
					await this.execute_line("q", true);
				} catch (error) {
					this.report_error(error);
					this.quit_requested = true;
				}
				continue;
			}

			try {
				validate_text(line);
				const source = await this.read_command_line(
				    string_from_bytes(line),
				);
				await this.execute_line(source, true);
			} catch (error) {
				this.handle_command_error(error);
			}
		}

		return this.had_error ? 1 : 0;
	}

	public interrupt(): void
	{
		this.interrupted = true;
		this.input.interrupt?.();
	}

	public async handle_hangup(): Promise<void>
	{
		if (!this.buffer.changed) {
			this.finish_hangup();
			return;
		}

		const bytes = lines_to_bytes(
		    this.buffer.all_lines.map((line) => line.bytes),
		);
		const home = Bun.env.HOME;
		const pathnames = ["ed.hup"];
		if (home !== undefined) {
			pathnames.push(`${home}/ed.hup`);
		}
		for (const pathname of pathnames) {
			try {
				await write_file_bytes(pathname, bytes);
				this.finish_hangup();
				return;
			} catch {
				continue;
			}
		}
		this.had_error = true;
		this.finish_hangup();
	}

	private async execute_line(
	    source: string,
	    record_undo: boolean,
	): Promise<void>
	{
		this.check_interrupted();
		const parsed = parse_command(source);
		let effective = parsed;
		if (parsed.command === "") {
			effective = parse_command(".+1p");
		}
		const command = effective.command;
		if (record_undo && this.is_buffer_mutating(command)) {
			await this.with_undo(
			    async () => this.execute_parsed(effective, false),
			    "gGvV".includes(command),
			);
		} else {
			await this.execute_parsed(effective, record_undo);
		}
	}

	private async execute_parsed(
	    parsed: parsed_command,
	    record_undo: boolean,
	): Promise<void>
	{
		const command = parsed.command;
		if (!"acdeEfGghHijklmnpPqQrstuvVw=!".includes(command)) {
			throw new ed_error("unknown command");
		}

		const suffix_result = this.command_suffix(command, parsed.argument);
		const argument = suffix_result.argument;
		const suffix = command === "s" ? "" : suffix_result.suffix;
		const range = this.resolve_range(parsed, command);

		switch (command) {
		case "a": {
			const lines = await this.read_input_lines();
			this.buffer.insert_after(range.start, lines);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		}
		case "i": {
			const lines = await this.read_input_lines();
			const address = Math.max(0, range.start - 1);
			this.buffer.insert_after(address, lines);
			if (lines.length === 0) {
				this.buffer.current = range.start;
			}
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		}
		case "c": {
			const lines = await this.read_input_lines();
			if (this.buffer.line_count > 0) {
				this.buffer.replace(
				    Math.max(1, range.start),
				    range.end,
				    lines,
				);
			} else {
				this.buffer.insert_after(0, lines);
			}
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		}
		case "d":
			this.buffer.delete(range.start, range.end);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "e":
			await this.check_modified();
			await this.edit_file(this.pathname_argument(argument), true);
			return;
		case "E":
			await this.edit_file(this.pathname_argument(argument), true);
			return;
		case "f":
			this.set_filename(argument);
			return;
		case "g":
			await this.global_command(parsed, false, record_undo);
			return;
		case "G":
			await this.global_command(
			    { ...parsed, argument },
			    true,
			    record_undo,
			);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "v":
			await this.global_command(parsed, false, record_undo, true);
			return;
		case "V":
			await this.global_command(
			    { ...parsed, argument },
			    true,
			    record_undo,
			    true,
			);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "h":
			if (this.last_error_message !== undefined) {
				this.write_stdout(this.last_error_message);
			}
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "H":
			this.help_enabled = !this.help_enabled;
			if (
			    this.help_enabled &&
			    this.last_error_message !== undefined
			) {
				this.write_stdout(this.last_error_message);
			}
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "j":
			this.buffer.join(range.start, range.end);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "k":
			this.set_mark(argument, range.start);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "l":
			this.write_list(range.start, range.end);
			return;
		case "m":
			this.buffer.move(
			    range.start,
			    range.end,
			    this.resolve_argument_address(argument),
			);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "n":
			this.write_numbered(range.start, range.end);
			return;
		case "p":
			this.write_plain(range.start, range.end);
			return;
		case "P":
			this.prompt_enabled = !this.prompt_enabled;
			return;
		case "q":
			await this.check_modified();
			this.quit_requested = true;
			return;
		case "Q":
			this.quit_requested = true;
			return;
		case "r":
			await this.read_after(
			    range.start,
			    this.pathname_argument(argument),
			);
			return;
		case "s":
			await this.substitute(range.start, range.end, argument);
			return;
		case "t":
			this.buffer.copy(
			    range.start,
			    range.end,
			    this.resolve_argument_address(argument),
			);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "u":
			this.undo();
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "w":
			await this.write_range(
			    range.start,
			    range.end,
			    this.pathname_argument(argument),
			);
			return;
		case "=":
			this.write_stdout(`${range.end}\n`);
			this.write_suffix(
			    suffix,
			    this.buffer.current,
			    this.buffer.current,
			);
			return;
		case "!":
			await this.shell_escape(argument);
			return;
		default:
			throw new ed_error("unknown command");
		}
	}

	private get last_error_message(): string | undefined
	{
		return this.error_message;
	}

	private error_message: string | undefined;

	private async with_undo(
	    operation: () => Promise<void>,
	    no_change_is_noop: boolean,
	): Promise<void>
	{
		const before = this.snapshot();
		const mutations = this.buffer.mutations;
		try {
			await operation();
			if (this.buffer.mutations !== mutations) {
				this.undo_state = { kind: "snapshot", snapshot: before };
			} else if (no_change_is_noop) {
				this.undo_state = { kind: "no-op" };
			}
		} catch (error) {
			this.restore(before);
			throw error;
		}
	}

	private snapshot(): editor_snapshot
	{
		return {
			...this.buffer.snapshot(),
			pathname: this.pathname,
			last_regex: this.last_regex,
			last_replacement: this.last_replacement,
			last_shell_command: this.last_shell_command,
			prompt_enabled: this.prompt_enabled,
			help_enabled: this.help_enabled,
		};
	}

	private restore(snapshot: editor_snapshot): void
	{
		this.buffer.restore(snapshot);
		this.pathname = snapshot.pathname;
		this.last_regex = snapshot.last_regex;
		this.last_replacement = snapshot.last_replacement;
		this.last_shell_command = snapshot.last_shell_command;
		this.prompt_enabled = snapshot.prompt_enabled;
		this.help_enabled = snapshot.help_enabled;
	}

	private undo(): void
	{
		if (this.undo_state === undefined) {
			throw new ed_error("nothing to undo");
		}
		if (this.undo_state.kind === "no-op") {
			return;
		}
		const current = this.snapshot();
		this.restore(this.undo_state.snapshot);
		this.buffer.changed = true;
		this.undo_state = { kind: "snapshot", snapshot: current };
	}

	private is_buffer_mutating(command: string): boolean
	{
		return "acdgGijmrstvV".includes(command);
	}

	private command_suffix(
	    command: string,
	    argument: string,
	): { argument: string; suffix: string }
	{
		if ("eEfgPqQrRvw!s".includes(command)) {
			return { argument, suffix: "" };
		}
		if (command === "k") {
			const mark = argument[0] ?? "";
			const suffix = argument.slice(1);
			if (mark !== "" && /^[lnp]*$/.test(suffix)) {
				return { argument: mark, suffix };
			}
			return { argument, suffix: "" };
		}
		let index = argument.length;
		let suffix = "";
		while (index > 0 && "lnp".includes(argument[index - 1] ?? "")) {
			index -= 1;
			suffix = argument[index] + suffix;
		}
		return { argument: argument.slice(0, index), suffix };
	}

	private resolve_range(
	    parsed: parsed_command,
	    command: string,
	): { start: number; end: number }
	{
		if (parsed.addresses.length === 0) {
			return this.default_range(command);
		}

		const maximum = this.maximum_address_count(command);
		if (maximum === 0) {
			throw new ed_error("unexpected address");
		}
		const resolved: number[] = [];
		let previous: number | undefined;
		for (const spec of parsed.addresses) {
			if (spec.separator === ";" && previous !== undefined) {
				this.buffer.current = previous;
			}
			const address = this.resolve_spec(spec, previous);
			this.validate_address(address, command, true);
			resolved.push(address);
			previous = address;
		}
		const selected = resolved.slice(-maximum);
		const first = selected[0];
		const second = selected[selected.length - 1];
		if (first === undefined || second === undefined) {
			throw new ed_error("invalid address range");
		}
		if (second < first) {
			throw new ed_error("invalid address range");
		}
		return { start: first, end: second };
	}

	private maximum_address_count(command: string): number
	{
		if ("eEfHhPqQu!".includes(command)) {
			return 0;
		}
		if ("aikr=".includes(command)) {
			return 1;
		}
		return 2;
	}

	private default_range(command: string): { start: number; end: number }
	{
		if (command === "r") {
			return {
				start: this.buffer.line_count,
				end: this.buffer.line_count,
			};
		}
		if (command === "=") {
			return {
				start: this.buffer.line_count,
				end: this.buffer.line_count,
			};
		}
		if ("eEfHhPqQu!".includes(command)) {
			return { start: 0, end: 0 };
		}
		if (this.buffer.line_count === 0) {
			if ("aiw".includes(command)) {
				return { start: 0, end: 0 };
			}
			throw new ed_error("buffer is empty");
		}
		if ("gGvV".includes(command)) {
			return { start: 1, end: this.buffer.line_count };
		}
		if (command === "w") {
			return { start: 1, end: this.buffer.line_count };
		}
		if (command === "j") {
			return { start: this.buffer.current, end: this.buffer.current + 1 };
		}
		return {
			start: this.buffer.current || 1,
			end: this.buffer.current || 1,
		};
	}

	private resolve_spec(spec: address_spec, previous?: number): number
	{
		if (spec.expression.kind === "previous") {
			if (previous === undefined) {
				throw new ed_error("invalid address");
			}
			return previous + spec.offset;
		}
		const base = this.resolve_expression(spec.expression);
		return base + spec.offset;
	}

	private resolve_expression(expression: address_expression): number
	{
		switch (expression.kind) {
		case "current":
			return this.buffer.current;
		case "last":
			return this.buffer.line_count;
		case "number":
			return expression.value;
		case "previous":
			throw new ed_error("invalid address");
		case "mark":
			return this.buffer.marked(expression.name);
		case "search":
			return this.search(expression.pattern, expression.direction);
		}
	}

	private search(source: string, direction: "forward" | "backward"): number
	{
		const pattern = source === "" ? this.last_regex : source;
		if (pattern === undefined) {
			throw new ed_error("no previous regular expression");
		}
		const program = compile_bre(pattern);
		try {
			this.last_regex = pattern;
			const line_count = this.buffer.line_count;
			if (line_count === 0) {
				throw new ed_error("buffer is empty");
			}
			const step = direction === "forward" ? 1 : -1;
			for (let offset = 1; offset <= line_count; offset += 1) {
				const index = this.buffer.current + step * offset - 1;
				const address = (index + line_count) % line_count + 1;
				const line = this.buffer.bytes(address);
				if (find_bre(line, program) !== undefined) {
					return address;
				}
			}
			throw new ed_error("regular expression not found");
		} finally {
			program.close();
		}
	}

	private validate_address(
	    address: number,
	    command: string,
	    range_address: boolean,
	): void
	{
		const zero_allowed = command === "=" ||
		    ("acimrt".includes(command) && range_address);
		if (
		    address < 0 ||
		    address > this.buffer.line_count ||
		    (address === 0 && !zero_allowed)
		) {
			throw new ed_error("invalid address");
		}
	}

	private resolve_argument_address(argument: string): number
	{
		const parsed = parse_command(argument);
		if (
		    parsed.addresses.length !== 1 ||
		    (parsed.command !== "" && parsed.command !== "p") ||
		    parsed.argument.length !== 0
		) {
			throw new ed_error("invalid destination address");
		}
		const address_specification = parsed.addresses[0];
		if (address_specification === undefined) {
			throw new ed_error("invalid destination address");
		}
		const address = this.resolve_spec(address_specification);
		if (address < 0 || address > this.buffer.line_count) {
			throw new ed_error("invalid destination address");
		}
		return address;
	}

	private async read_input_lines(): Promise<Uint8Array[]>
	{
		const lines: Uint8Array[] = [];
		for (;;) {
			this.check_interrupted();
			let line;
			if (this.command_input === undefined) {
				line = await this.input.read_line();
			} else {
				line = this.command_input.shift() ?? null;
			}
			if (line === input_interrupted) {
				throw this.take_interrupt_error();
			}
			if (line === null) {
				return lines;
			}
			validate_text(line);
			if (line.length === 1 && line[0] === 0x2e) {
				return lines;
			}
			lines.push(copy_bytes(line));
		}
	}

	private async read_command_line(initial: string): Promise<string>
	{
		let source = initial;
		if (parse_command(source).command !== "s") {
			return source;
		}
		while (has_trailing_backslash(source)) {
			source = `${source.slice(0, -1)}\n`;
			const line = await this.input.read_line();
			if (line === input_interrupted) {
				throw this.take_interrupt_error();
			}
			if (line === null) {
				throw new ed_error("unexpected end of input");
			}
			validate_text(line);
			source += string_from_bytes(line);
		}
		return source;
	}

	private async edit_file(
	    pathname: string | undefined,
	    force: boolean,
	): Promise<void>
	{
		if (pathname === undefined || pathname.length === 0) {
			if (this.pathname === undefined) {
				throw new ed_error("no pathname");
			}
			pathname = this.pathname;
		}
		if (!force && this.buffer.changed) {
			throw new ed_error("buffer modified");
		}
		let bytes: Uint8Array;
		if (pathname.startsWith("!")) {
			const command = pathname.slice(1).trimStart();
			const result = await run_shell(command, undefined, true);
			if (result.status !== 0) {
				throw new ed_error("shell command failed");
			}
			bytes = result.stdout;
		} else {
			bytes = await read_file_bytes(pathname);
			this.pathname = pathname;
		}
		this.buffer.load(bytes_to_lines(bytes));
		this.last_regex = undefined;
		this.undo_state = undefined;
		if (!this.options.silent) {
			this.write_stdout(`${bytes.length}\n`);
		}
	}

	private async read_after(
	    address: number,
	    pathname: string | undefined,
	): Promise<void>
	{
		if (pathname === undefined || pathname.length === 0) {
			pathname = this.pathname;
		}
		if (pathname === undefined) {
			throw new ed_error("no pathname");
		}
		let bytes: Uint8Array;
		if (pathname.startsWith("!")) {
			const result = await run_shell(
			    pathname.slice(1).trimStart(),
			    undefined,
			    true,
			);
			bytes = result.stdout;
		} else {
			bytes = await read_file_bytes(pathname);
			if (this.pathname === undefined) {
				this.pathname = pathname;
			}
		}
		const lines = bytes_to_lines(bytes);
		this.buffer.insert_after(address, lines);
		if (!this.options.silent) {
			this.write_stdout(`${bytes.length}\n`);
		}
	}

	private async write_range(
	    start: number,
	    end: number,
	    pathname: string | undefined,
	): Promise<void>
	{
		if (pathname === undefined || pathname.length === 0) {
			pathname = this.pathname;
		}
		if (pathname === undefined) {
			throw new ed_error("no pathname");
		}
		if (pathname.startsWith("!")) {
			const command = pathname.slice(1).trimStart();
			const lines = this.range_bytes(start, end);
			const result = await run_shell(
			    command,
			    lines_to_bytes(lines),
			    false,
			);
			if (result.status !== 0) {
				throw new ed_error("shell command failed");
			}
			return;
		}
		const lines = this.range_bytes(start, end);
		const bytes = lines_to_bytes(lines);
		await write_file_bytes(pathname, bytes);
		if (
		    (start === 1 && end === this.buffer.line_count) ||
		    (start === 0 && end === 0 && this.buffer.line_count === 0)
		) {
			this.buffer.changed = false;
		}
		if (this.pathname === undefined) {
			this.pathname = pathname;
		}
		if (!this.options.silent) {
			this.write_stdout(`${bytes.length}\n`);
		}
	}

	private range_bytes(start: number, end: number): Uint8Array[]
	{
		if (start === 0 && end === 0) {
			return [];
		}
		return this.buffer.range(start, end).map((line) => line.bytes);
	}

	private async substitute(
	    start: number,
	    end: number,
	    argument: string,
	): Promise<void>
	{
		const fields = split_substitute(argument);
		let pattern: string | undefined = fields.pattern;
		if (pattern === "") {
			pattern = this.last_regex;
		}
		if (pattern === undefined) {
			throw new ed_error("no previous regular expression");
		}
		let replacement: string | undefined = fields.replacement;
		if (replacement === "%") {
			replacement = this.last_replacement;
		}
		if (replacement === undefined) {
			throw new ed_error("no previous replacement");
		}
		const program = compile_bre(pattern);
		try {
			this.last_regex = pattern;
			const occurrence_match = fields.flags.match(/[0-9]+/);
			let occurrence: number | undefined;
			if (occurrence_match !== null) {
				occurrence = Number(occurrence_match[0]);
			}
			const global = fields.flags.includes("g");
			this.last_replacement = replacement;
			let changed = false;
			let last_address = this.buffer.current;
			const ids = this.buffer.ids(start, end);
			for (const id of ids) {
				const address = this.buffer.address_of(id);
				if (address === undefined) {
					continue;
				}
				const result = substitute_bre(
				    this.buffer.bytes(address),
				    program,
				    replacement,
				    global,
				    occurrence,
				);
				if (result.changed) {
					changed = true;
					this.buffer.replace(address, address, result.lines);
					last_address = this.buffer.current;
				}
			}
			if (!changed) {
				throw new ed_error("substitute failed");
			}
			if (fields.flags.includes("p")) {
				this.write_plain(last_address, last_address);
			} else if (fields.flags.includes("n")) {
				this.write_numbered(last_address, last_address);
			} else if (fields.flags.includes("l")) {
				this.write_list(last_address, last_address);
			}
		} finally {
			program.close();
		}
	}

	private async global_command(
	    parsed: parsed_command,
	    interactive: boolean,
	    record_undo: boolean,
	    invert = false,
	): Promise<void>
	{
		const delimiter = first_character(parsed.argument);
		if (
		    delimiter === undefined ||
		    delimiter === " " ||
		    delimiter === "\t"
		) {
			throw new ed_error("invalid global command");
		}
		const pattern_result = read_delimited(
		    parsed.argument,
		    0,
		    delimiter,
		    { allow_end: true, regular_expression: true },
		);
		let initial_list = "";
		if (pattern_result.index < parsed.argument.length) {
			initial_list = parsed.argument.slice(pattern_result.index);
		}
		let list: string[] = [];
		if (!interactive) {
			list = await this.read_global_command_list(initial_list);
		}
		let pattern: string | undefined = pattern_result.value;
		if (pattern === "") {
			pattern = this.last_regex;
		}
		if (pattern === undefined) {
			throw new ed_error("no previous regular expression");
		}
		const program = compile_bre(pattern);
		try {
			this.last_regex = pattern;
			const range = this.resolve_range(parsed, parsed.command);
			const selected = this.buffer.range(range.start, range.end).filter(
			    (line) => {
				const matches = find_bre(line.bytes, program) !== undefined;
				return matches !== invert;
			    },
			);

			let previous_command: string | undefined;
			for (const selected_line of selected) {
				const address = this.buffer.address_of(selected_line.id);
				if (
				    address === undefined ||
				    this.buffer.line(address) !== selected_line
				) {
					continue;
				}
				this.buffer.current = address;
				if (interactive) {
					this.write_plain(address, address);
					const line = await this.input.read_line();
					if (line === input_interrupted) {
						throw this.take_interrupt_error();
					}
					if (line === null) {
						throw new ed_error("unexpected end of input");
					}
					validate_text(line);
					const command_line = string_from_bytes(line);
					if (command_line === "&") {
						if (previous_command === undefined) {
							throw new ed_error("no previous global command");
						}
						try {
							await this.execute_line(previous_command, false);
						} catch {
							break;
						}
						if (this.quit_requested) {
							return;
						}
					} else if (command_line.length !== 0) {
						previous_command = command_line;
						try {
							await this.execute_line(command_line, false);
						} catch {
							break;
						}
						if (this.quit_requested) {
							return;
						}
					}
				} else {
					await this.execute_global_command_list(list);
				}
			}
			void record_undo;
		} finally {
			program.close();
		}
	}

	private async read_global_command_list(initial: string): Promise<string[]>
	{
		const lines: string[] = [];
		let line = initial.replace(/^\\\n/, "");
		for (;;) {
			const continued = has_trailing_backslash(line);
			lines.push(continued ? line.slice(0, -1) : line);
			if (!continued) {
				break;
			}
			const input_line = await this.input.read_line();
			if (input_line === input_interrupted) {
				throw this.take_interrupt_error();
			}
			if (input_line === null) {
				throw new ed_error("unexpected end of input");
			}
			validate_text(input_line);
			line = string_from_bytes(input_line);
		}
		if (lines.length === 1 && lines[0]?.trim().length === 0) {
			return ["p"];
		}
		return lines;
	}

	private async execute_global_command_list(
	    lines: readonly string[],
	): Promise<void>
	{
		for (let index = 0; index < lines.length; index += 1) {
			const source = lines[index];
			if (source === undefined) {
				continue;
			}
			const command = parse_command(source).command;
			if (!"aic".includes(command)) {
				await this.execute_line(source, false);
				continue;
			}

			const input_lines: Uint8Array[] = [];
			while (index + 1 < lines.length) {
				const input_line = lines[index + 1];
				index += 1;
				if (input_line === ".") {
					break;
				}
				if (input_line !== undefined) {
					input_lines.push(bytes_from_string(input_line));
				}
			}
			input_lines.push(bytes_from_string("."));
			this.command_input = input_lines;
			try {
				await this.execute_line(source, false);
			} finally {
				this.command_input = undefined;
			}
		}
	}

	private async shell_escape(argument: string): Promise<void>
	{
		let command = argument.trimStart();
		if (command.startsWith("!")) {
			if (this.last_shell_command === undefined) {
				throw new ed_error("no previous shell command");
			}
			command = this.last_shell_command + command.slice(1);
		}
		const pathname = this.pathname ?? "";
		command = replace_shell_tokens(command, pathname);
		this.last_shell_command = command;
		if (command !== argument.trimStart()) {
			this.write_stdout(`${command}\n`);
		}
		const result = await run_shell(command, undefined, false);
		if (!this.options.silent) {
			this.write_stdout("!\n");
		}
		if (result.status !== 0) {
			this.had_error = true;
		}
	}

	private pathname_argument(argument: string): string | undefined
	{
		const pathname = argument.trim();
		return pathname.length === 0 ? undefined : pathname;
	}

	private set_mark(argument: string, address: number): void
	{
		const name = argument.trim();
		if (!/^[a-z]$/.test(name)) {
			throw new ed_error("invalid mark name");
		}
		this.buffer.mark(name, address);
	}

	private set_filename(argument: string): void
	{
		const pathname = this.pathname_argument(argument);
		if (pathname !== undefined) {
			this.pathname = pathname;
		}
		if (this.pathname !== undefined) {
			this.write_stdout(`${this.pathname}\n`);
			return;
		}
		throw new ed_error("no pathname");
	}

	private async check_modified(): Promise<void>
	{
		if (this.buffer.change_state === "unchanged") {
			return;
		}
		if (this.buffer.change_state === "changed-and-warned") {
			return;
		}
		this.buffer.change_state = "changed-and-warned";
		throw new ed_error("buffer modified", true);
	}

	private handle_command_error(error: unknown): void
	{
		this.report_error(error);
		if (error instanceof ed_error && error.recoverable) {
			return;
		}
		this.had_error = true;
		if (this.options.input_kind !== "terminal") {
			this.quit_requested = true;
		}
	}

	private write_suffix(suffix: string, start: number, end: number): void
	{
		if (suffix.includes("p")) {
			this.write_plain(start, end);
		}
		if (suffix.includes("n")) {
			this.write_numbered(start, end);
		}
		if (suffix.includes("l")) {
			this.write_list(start, end);
		}
	}

	private write_plain(start: number, end: number): void
	{
		for (const line of this.buffer.range(start, end)) {
			this.output.write_stdout(concat_line(line.bytes));
		}
		this.buffer.current = end;
	}

	private write_numbered(start: number, end: number): void
	{
		for (let address = start; address <= end; address += 1) {
			this.write_stdout(`${address}\t`);
			this.output.write_stdout(concat_line(this.buffer.bytes(address)));
		}
		this.buffer.current = end;
	}

	private write_list(start: number, end: number): void
	{
		for (const line of this.buffer.range(start, end)) {
			this.write_stdout(format_list_line(line.bytes));
		}
		this.buffer.current = end;
	}

	private write_stdout(value: string): void
	{
		this.output.write_stdout(bytes_from_string(value));
	}

	private report_error(error: unknown): void
	{
		const reason = error instanceof Error ? error.message : "error";
		this.error_message = `${reason}\n`;
		this.write_stdout("?\n");
		if (this.help_enabled) {
			this.write_stdout(this.error_message);
		}
	}

	private check_interrupted(): void
	{
		if (this.interrupted) {
			throw this.take_interrupt_error();
		}
	}

	private take_interrupt_error(): ed_error
	{
		this.interrupted = false;
		return new ed_error("interrupt", true);
	}

	private finish_hangup(): void
	{
		this.quit_requested = true;
		this.input.interrupt?.();
	}
}

function
concat_line(bytes: Uint8Array): Uint8Array
{
	const result = new Uint8Array(bytes.length + 1);
	result.set(bytes);
	result[bytes.length] = 0x0a;
	return result;
}

function
has_trailing_backslash(value: string): boolean
{
	let count = 0;
	for (let index = value.length - 1; value[index] === "\\"; index -= 1) {
		count += 1;
	}
	return count % 2 === 1;
}

function
format_list_line(bytes: Uint8Array): string
{
	let result = "";
	for (const character of text_characters(bytes)) {
		result += format_list_character(bytes, character);
	}
	return `${fold_list_line(result)}$\n`;
}

function
format_list_character(
    bytes: Uint8Array,
    character: text_character,
): string
{
	const value = bytes[character.start];
	switch (value) {
	case undefined:
		return "";
	case 0x08:
		return "\\b";
	case 0x09:
		return "\\t";
	case 0x0b:
		return "\\v";
	case 0x0c:
		return "\\f";
	case 0x0d:
		return "\\r";
	case 0x07:
		return "\\a";
	case 0x5c:
		return "\\\\";
	case 0x24:
		return "\\$";
	}

	const character_bytes = bytes.slice(character.start, character.end);
	if (character.printable) {
		return string_from_bytes(character_bytes);
	}
	let result = "";
	for (const item of character_bytes) {
		result += `\\${item.toString(8).padStart(3, "0")}`;
	}
	return result;
}

function
fold_list_line(value: string): string
{
	if (value.length <= 70) {
		return value;
	}
	const parts: string[] = [];
	for (let index = 0; index < value.length; index += 70) {
		parts.push(value.slice(index, index + 70));
	}
	return parts.join("\\\n");
}

function
replace_shell_tokens(command: string, pathname: string): string
{
	let result = "";
	let escaped = false;
	for (const character of command) {
		if (escaped) {
			result += character;
			escaped = false;
		} else if (character === "\\") {
			result += character;
			escaped = true;
		} else if (character === "%") {
			result += pathname;
		} else {
			result += character;
		}
	}
	return result;
}

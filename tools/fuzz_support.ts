/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

export interface generated_program {
	seed: number;
	groups: readonly (readonly string[])[];
	expected_stdout: string;
}

interface model_state {
	lines: string[];
	current: number;
}

class random_source {
	private state: number;

	public constructor(seed: number)
	{
		this.state = seed === 0 ? 0x6d2b79f5 : seed >>> 0;
	}

	public integer(limit: number): number
	{
		if (limit <= 0) {
			throw new Error("random limit must be positive");
		}
		return this.next() % limit;
	}

	private next(): number
	{
		let value = this.state;
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		this.state = value >>> 0;
		return this.state;
	}
}

class program_builder {
	private readonly random: random_source;
	private readonly groups: string[][] = [];
	private state: model_state;
	private undo_state: model_state | undefined;

	public constructor(private readonly seed: number)
	{
		this.random = new random_source(seed);
		const lines = this.make_lines(1 + this.random.integer(6));
		this.state = { lines, current: lines.length };
		this.groups.push(["a", ...lines, "."]);
	}

	public build(): generated_program
	{
		const operation_count = 5 + this.random.integer(26);
		for (let index = 0; index < operation_count; index += 1) {
			this.add_operation();
		}
		return {
			seed: this.seed,
			groups: this.groups,
			expected_stdout: this.expected_stdout(),
		};
	}

	private add_operation(): void
	{
		const choices = this.state.lines.length >= 30 ? 6 : 9;
		switch (this.random.integer(choices)) {
		case 0:
			this.append();
			break;
		case 1:
			this.insert();
			break;
		case 2:
			this.change();
			break;
		case 3:
			this.delete();
			break;
		case 4:
			this.join();
			break;
		case 5:
			this.move();
			break;
		case 6:
			this.copy();
			break;
		case 7:
			this.substitute();
			break;
		case 8:
			this.undo();
			break;
		default:
			throw new Error("unreachable operation");
		}
	}

	private append(): void
	{
		const address = this.random.integer(this.state.lines.length + 1);
		const values = this.make_lines(1 + this.random.integer(2));
		this.remember();
		this.state.lines.splice(address, 0, ...values);
		this.state.current = address + values.length;
		this.groups.push([`${address}a`, ...values, "."]);
	}

	private insert(): void
	{
		const address = 1 + this.random.integer(this.state.lines.length);
		const values = this.make_lines(1 + this.random.integer(2));
		this.remember();
		this.state.lines.splice(address - 1, 0, ...values);
		this.state.current = address + values.length - 1;
		this.groups.push([`${address}i`, ...values, "."]);
	}

	private change(): void
	{
		const [start, end] = this.range(3);
		const values = this.make_lines(1 + this.random.integer(2));
		this.remember();
		this.state.lines.splice(start - 1, end - start + 1, ...values);
		this.state.current = start + values.length - 1;
		this.groups.push([`${range_text(start, end)}c`, ...values, "."]);
	}

	private delete(): void
	{
		if (this.state.lines.length === 1) {
			this.substitute();
			return;
		}
		const start = 1 + this.random.integer(this.state.lines.length);
		const maximum = Math.min(3, this.state.lines.length - start + 1);
		let count = 1 + this.random.integer(maximum);
		if (count === this.state.lines.length) {
			count -= 1;
		}
		const end = start + count - 1;
		this.remember();
		this.state.lines.splice(start - 1, count);
		this.state.current = Math.min(start, this.state.lines.length);
		this.groups.push([`${range_text(start, end)}d`]);
	}

	private join(): void
	{
		if (this.state.lines.length === 1) {
			this.append();
			return;
		}
		const start = 1 + this.random.integer(this.state.lines.length - 1);
		const maximum = Math.min(3, this.state.lines.length - start + 1);
		const count = 2 + this.random.integer(maximum - 1);
		const end = start + count - 1;
		const joined = this.state.lines.slice(start - 1, end).join("");
		this.remember();
		this.state.lines.splice(start - 1, count, joined);
		this.state.current = start;
		this.groups.push([`${start},${end}j`]);
	}

	private move(): void
	{
		const [start, end] = this.range(3);
		const targets: number[] = [];
		for (let target = 0; target <= this.state.lines.length; target += 1) {
			if ((target < start || target > end) && target !== start - 1) {
				targets.push(target);
			}
		}
		if (targets.length === 0) {
			this.substitute();
			return;
		}
		const target = targets[this.random.integer(targets.length)] ?? 0;
		const count = end - start + 1;
		this.remember();
		const moved = this.state.lines.splice(start - 1, count);
		const insertion_index = target > end ? target - count : target;
		this.state.lines.splice(insertion_index, 0, ...moved);
		this.state.current = insertion_index + count;
		this.groups.push([`${range_text(start, end)}m${target}`]);
	}

	private copy(): void
	{
		if (this.state.lines.length >= 30) {
			this.substitute();
			return;
		}
		const [start, end] = this.range(3);
		const target = this.random.integer(this.state.lines.length + 1);
		const copied = this.state.lines.slice(start - 1, end);
		this.remember();
		this.state.lines.splice(target, 0, ...copied);
		this.state.current = target + copied.length;
		this.groups.push([`${range_text(start, end)}t${target}`]);
	}

	private substitute(): void
	{
		const address = 1 + this.random.integer(this.state.lines.length);
		const line = this.state.lines[address - 1] ?? "a";
		if (line.length >= 64) {
			this.change();
			return;
		}
		const needle = line[this.random.integer(line.length)] ?? "a";
		const replacement = this.word(1 + this.random.integer(2));
		this.remember();
		this.state.lines[address - 1] = line.split(needle).join(replacement);
		this.state.current = address;
		this.groups.push([`${address}s/${needle}/${replacement}/g`]);
	}

	private undo(): void
	{
		if (this.undo_state === undefined) {
			this.substitute();
			return;
		}
		const current = clone_state(this.state);
		this.state = this.undo_state;
		this.undo_state = current;
		this.groups.push(["u"]);
	}

	private remember(): void
	{
		this.undo_state = clone_state(this.state);
	}

	private range(maximum_count: number): [number, number]
	{
		const start = 1 + this.random.integer(this.state.lines.length);
		const available = this.state.lines.length - start + 1;
		const limit = Math.min(maximum_count, available);
		const count = 1 + this.random.integer(limit);
		return [start, start + count - 1];
	}

	private make_lines(count: number): string[]
	{
		const lines: string[] = [];
		for (let index = 0; index < count; index += 1) {
			lines.push(this.word(1 + this.random.integer(8)));
		}
		return lines;
	}

	private word(length: number): string
	{
		let value = "";
		for (let index = 0; index < length; index += 1) {
			value += String.fromCharCode(97 + this.random.integer(26));
		}
		return value;
	}

	private expected_stdout(): string
	{
		const numbered = this.state.lines.map(
			(line, index) => `${index + 1}\t${line}\n`,
		).join("");
		return `${this.state.current}\n${numbered}`;
	}
}

export function
generate_program(seed: number): generated_program
{
	return new program_builder(seed >>> 0).build();
}

export function
program_input(
	groups: readonly (readonly string[])[],
	portable: boolean,
): string
{
	const lines = groups.flatMap((group) => [...group]);
	lines.push(".=", ",n");
	if (portable) {
		lines.push("w /dev/null", "q");
	} else {
		lines.push("Q");
	}
	return `${lines.join("\n")}\n`;
}

export function
input_lines(input: string): string[]
{
	const lines = input.split("\n");
	if (lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

export function
case_seed(base_seed: number, index: number): number
{
	return (base_seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
}

export function
environment_integer(name: string, fallback: number): number
{
	const source = process.env[name];
	if (source === undefined) {
		return fallback;
	}
	const value = Number(source);
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer`);
	}
	return value;
}

export function
seed_text(seed: number): string
{
	return `0x${seed.toString(16).padStart(8, "0")}`;
}

function
range_text(start: number, end: number): string
{
	return start === end ? `${start}` : `${start},${end}`;
}

function
clone_state(state: model_state): model_state
{
	return { lines: [...state.lines], current: state.current };
}

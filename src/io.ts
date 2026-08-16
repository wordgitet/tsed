/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { read } from "node:fs";
import { open } from "node:fs/promises";
import { validate_text } from "./locale";
import {
	bytes_from_string,
	input_interrupted,
    type input_line,
	type input_source,
	type output_sink,
} from "./types";

type chunk_reader = () => Promise<Uint8Array | null>;

export class stdin_line_reader implements input_source {
    private readonly read_chunk: chunk_reader;
    private pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    private pending_next: Promise<Uint8Array | null> | undefined;
    private interrupt_resolve: (() => void) | undefined;

    public constructor(read_chunk: chunk_reader = read_standard_input) {
        this.read_chunk = read_chunk;
    }

    public async read_line(): Promise<input_line> {
        for (;;) {
            const line = this.take_line();
            if (line !== undefined) {
                return line;
            }
            const next = this.pending_next ?? this.read_chunk();
            this.pending_next = next;
            const result = await this.wait_for_next(next);
            if (result === input_interrupted) {
                return result;
            }
            this.pending_next = undefined;
            if (result === null) {
                return this.take_final_line();
            } else {
                this.pending = concat_bytes(this.pending, result);
            }
        }
    }

    public interrupt(): void {
        this.interrupt_resolve?.();
    }

    private async wait_for_next(
        next: Promise<Uint8Array | null>,
    ): Promise<Uint8Array | null | typeof input_interrupted> {
        const interrupted = new Promise<typeof input_interrupted>((resolve) => {
            this.interrupt_resolve = () => resolve(input_interrupted);
        });
        const result = await Promise.race([next, interrupted]);
        this.interrupt_resolve = undefined;
        return result;
    }

    private take_line(): Uint8Array | undefined {
        const newline = this.pending.indexOf(0x0a);
        if (newline < 0) {
            return undefined;
        }

        const line = this.pending.slice(0, newline);
        this.pending = this.pending.slice(newline + 1);
        return strip_carriage_return(line);
    }

    private take_final_line(): Uint8Array | null {
        if (this.pending.length === 0) {
            return null;
        }

        const line = this.pending;
        this.pending = new Uint8Array(0);
        return strip_carriage_return(line);
    }
}

export class process_output implements output_sink {
    public write_stdout(bytes: Uint8Array): void {
        process.stdout.write(Buffer.from(bytes));
    }

    public write_stderr(bytes: Uint8Array): void {
        process.stderr.write(Buffer.from(bytes));
    }
}

export function bytes_to_lines(bytes: Uint8Array): Uint8Array[] {
	validate_text(bytes);
	if (bytes.length === 0) {
        return [];
    }

    const lines: Uint8Array[] = [];
    let start = 0;
    for (let index = 0; index < bytes.length; index += 1) {
        if (bytes[index] === 0x0a) {
            lines.push(bytes.slice(start, index));
            start = index + 1;
        }
    }
    if (start < bytes.length) {
        lines.push(bytes.slice(start));
    }
    return lines;
}

export function lines_to_bytes(lines: readonly Uint8Array[]): Uint8Array {
    const length = lines.reduce((total, line) => total + line.length + 1, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const line of lines) {
        bytes.set(line, offset);
        offset += line.length;
        bytes[offset] = 0x0a;
        offset += 1;
    }
    return bytes;
}

export async function read_file_bytes(pathname: string): Promise<Uint8Array> {
    return Bun.file(pathname).bytes();
}

export async function write_file_bytes(pathname: string, bytes: Uint8Array): Promise<void> {
    const file = await open(pathname, "w");
    try {
        await file.write(bytes);
    } finally {
        await file.close();
    }
}

export async function run_shell(
    command: string,
    input: Uint8Array | undefined,
    capture_output: boolean,
): Promise<{ status: number; stdout: Uint8Array }> {
    const process_options: Parameters<typeof Bun.spawn>[1] = {
        stdin: input ?? "inherit",
        stdout: capture_output ? "pipe" : "inherit",
        stderr: "inherit",
    };
    const child = Bun.spawn(["sh", "-c", command], process_options);
    let stdout = new Uint8Array(0);
    if (capture_output && child.stdout !== null && typeof child.stdout !== "number") {
        stdout = new Uint8Array(await new Response(child.stdout).arrayBuffer());
    }
    return { status: await child.exited, stdout };
}

export function concat_bytes(first: Uint8Array, second: Uint8Array): Uint8Array {
    const result = new Uint8Array(first.length + second.length);
    result.set(first, 0);
    result.set(second, first.length);
    return result;
}

export function text_bytes(value: string): Uint8Array {
    return bytes_from_string(value);
}

function
strip_carriage_return(line: Uint8Array): Uint8Array
{
    return line[line.length - 1] === 0x0d ? line.slice(0, -1) : line;
}

function
read_standard_input(): Promise<Uint8Array | null>
{
    return new Promise((resolve, reject) => {
        const buffer = Buffer.allocUnsafe(4096);
        read(0, buffer, 0, buffer.length, null, (error, bytes_read) => {
            if (error !== null) {
                reject(error);
                return;
            }
            if (bytes_read === 0) {
                resolve(null);
                return;
            }
            resolve(new Uint8Array(buffer.subarray(0, bytes_read)));
        });
    });
}

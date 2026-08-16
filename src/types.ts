/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

export interface line_record {
    id: number;
    bytes: Uint8Array;
}

export type address_expression =
    | { kind: "current" }
    | { kind: "last" }
    | { kind: "number"; value: number }
    | { kind: "previous" }
    | { kind: "mark"; name: string }
    | { kind: "search"; pattern: string; direction: "forward" | "backward" }

export interface address_spec {
    expression: address_expression;
    separator: "," | ";" | null;
    offset: number;
}

export interface parsed_command {
    addresses: address_spec[];
    command: string;
    argument: string;
    suffix: string;
}

export interface buffer_snapshot {
    lines: line_record[];
    current: number;
    next_id: number;
    marks: Map<string, number>;
    changed: boolean;
}

export interface editor_snapshot extends buffer_snapshot {
    pathname: string | undefined;
    last_regex: string | undefined;
    last_replacement: string | undefined;
    last_shell_command: string | undefined;
    prompt_enabled: boolean;
    help_enabled: boolean;
}

export interface command_output {
    stdout: Uint8Array[];
    stderr: Uint8Array[];
}

export const input_interrupted = Symbol("input_interrupted");

export type input_line = Uint8Array | null | typeof input_interrupted;

export interface input_source {
    read_line(): Promise<input_line>;
    interrupt?(): void;
}

export interface output_sink {
    write_stdout(bytes: Uint8Array): void;
    write_stderr(bytes: Uint8Array): void;
}

export type input_kind = "terminal" | "regular" | "other";

export class ed_error extends Error {
    public readonly reason: string;
    public readonly recoverable: boolean;

    public constructor(reason: string, recoverable = false) {
        super(reason);
        this.name = "ed_error";
        this.reason = reason;
        this.recoverable = recoverable;
    }
}

export function bytes_from_string(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length);

    for (let index = 0; index < value.length; index += 1) {
        bytes[index] = value.charCodeAt(index) & 0xff;
    }

    return bytes;
}

export function string_from_bytes(value: Uint8Array): string {
    let result = "";
    const chunk_size = 8192;
    for (let offset = 0; offset < value.length; offset += chunk_size) {
        result += String.fromCharCode(
            ...value.slice(offset, offset + chunk_size),
        );
    }
    return result;
}

export function copy_bytes(value: Uint8Array): Uint8Array {
    return value.slice();
}

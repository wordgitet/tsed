/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { bytes_from_string, string_from_bytes, ed_error } from "./types";

const max_repeat = 32767;

type bre_node =
    | { kind: "sequence"; children: bre_node[] }
    | { kind: "literal"; value: number }
    | { kind: "any" }
    | { kind: "start" }
    | { kind: "end" }
    | { kind: "class"; test: (value: number) => boolean }
    | { kind: "group"; id: number; child: bre_node }
    | { kind: "backref"; id: number }
    | { kind: "repeat"; child: bre_node; min: number; max: number };

interface capture_span {
    start: number;
    end: number;
}

interface match_state {
    position: number;
    captures: Map<number, capture_span>;
}

interface class_item {
    value: number;
    rangeable: boolean;
    test: (value: number) => boolean;
}

export interface bre_match {
    start: number;
    end: number;
    captures: Map<number, capture_span>;
}

export interface bre_program {
    source: string;
    root: bre_node;
}

export interface substitution_result {
    changed: boolean;
    lines: Uint8Array[];
}

class bre_parser {
    private index = 0;
    private group_id = 0;

    public constructor(private readonly source: string) {}

    public parse(): bre_program {
        const root = this.parse_sequence(false, true);
        if (this.index !== this.source.length) {
            throw new ed_error("invalid regular expression");
        }

        return { source: this.source, root };
    }

    private parse_sequence(stop_at_group: boolean, allow_anchor: boolean): bre_node {
        const children: bre_node[] = [];

        while (this.index < this.source.length) {
            if (this.is_group_end()) {
                if (!stop_at_group) {
                    throw new ed_error("unmatched regular expression group");
                }
                break;
            }

            const at_sequence_start = children.length === 0;
            const first_character = this.source[this.index];
            const atom = this.parse_atom(at_sequence_start, allow_anchor);
            const repeated = this.parse_repeat(
                atom,
                at_sequence_start && allow_anchor && first_character === "^",
            );
            children.push(repeated);
        }

        if (stop_at_group) {
            if (!this.is_group_end()) {
                throw new ed_error("unmatched regular expression group");
            }
            this.index += 2;
        }

        return { kind: "sequence", children };
    }

    private parse_atom(at_sequence_start: boolean, allow_anchor: boolean): bre_node {
        const character = this.source[this.index];
        if (character === undefined) {
            throw new ed_error("invalid regular expression");
        }
        this.index += 1;

        if (character === ".") {
            return { kind: "any" };
        }
        if (character === "^" && at_sequence_start && allow_anchor) {
            return { kind: "start" };
        }
        if (
            character === "$" &&
            this.index === this.source.length &&
            allow_anchor
        ) {
            return { kind: "end" };
        }
        if (character === "[") {
            return this.parse_class();
        }
        if (character !== "\\") {
            return { kind: "literal", value: character.charCodeAt(0) };
        }

        const escaped = this.source[this.index];
        if (escaped === undefined) {
            throw new ed_error("trailing backslash in regular expression");
        }
        this.index += 1;

        if (escaped === "(") {
            if (this.group_id >= 9) {
                throw new ed_error("too many regular expression groups");
            }
            const id = ++this.group_id;
            const child = this.parse_sequence(true, false);
            return { kind: "group", id, child };
        }
        if (escaped >= "1" && escaped <= "9") {
            return { kind: "backref", id: Number(escaped) };
        }
        if (escaped === "{" || escaped === "}") {
            throw new ed_error("invalid regular expression interval");
        }

        return { kind: "literal", value: escaped.charCodeAt(0) };
    }

    private parse_repeat(atom: bre_node, suppress_star: boolean): bre_node {
        const next = this.source[this.index];
        if (
            next === "*" &&
            !suppress_star &&
            atom.kind !== "start" &&
            atom.kind !== "end"
        ) {
            this.index += 1;
            return { kind: "repeat", child: atom, min: 0, max: Infinity };
        }

        if (next !== "\\" || this.source[this.index + 1] !== "{") {
            return atom;
        }

        this.index += 2;
        const start = this.read_number();
        let minimum = start;
        let maximum = start;
        const separator = this.source[this.index];

        if (separator === ",") {
            if (Number.isNaN(start)) {
                throw new ed_error("invalid regular expression interval");
            }
            this.index += 1;
            minimum = start;
            maximum = this.read_number();
            if (Number.isNaN(maximum)) {
                maximum = Infinity;
            }
        } else if (Number.isNaN(start)) {
            throw new ed_error("invalid regular expression interval");
        }

        if (this.source[this.index] !== "\\" || this.source[this.index + 1] !== "}") {
            throw new ed_error("unterminated regular expression interval");
        }
        this.index += 2;

        if (
            minimum > max_repeat ||
            (maximum !== Infinity && maximum > max_repeat) ||
            minimum > maximum
        ) {
            throw new ed_error("regular expression interval is too large");
        }

        return { kind: "repeat", child: atom, min: minimum, max: maximum };
    }

    private read_number(): number {
        const start = this.index;
        while (this.index < this.source.length && /[0-9]/.test(this.source[this.index] ?? "")) {
            this.index += 1;
        }
        if (start === this.index) {
            return Number.NaN;
        }
        return Number(this.source.slice(start, this.index));
    }

    private parse_class(): bre_node {
        let negated = false;
        if (this.source[this.index] === "^") {
            negated = true;
            this.index += 1;
        }

        const tests: Array<(value: number) => boolean> = [];
        let first = true;
        while (this.index < this.source.length) {
            if (this.source[this.index] === "]" && !first) {
                this.index += 1;
                const test = (value: number): boolean => tests.some((item) => item(value));
                return {
                    kind: "class",
                    test: negated ? (value) => !test(value) : test,
                };
            }

            if (this.source[this.index] === "]" && first) {
                this.index += 1;
                tests.push((value) => value === 0x5d);
                first = false;
                continue;
            }

            const item = this.read_class_item();
            first = false;
            if (this.source[this.index] === "-" && this.source[this.index + 1] !== "]") {
                this.index += 1;
                const end = this.read_class_item();
                if (!item.rangeable || !end.rangeable || item.value > end.value) {
                    throw new ed_error("invalid regular expression range");
                }
                tests.push((value) => value >= item.value && value <= end.value);
            } else {
                tests.push(item.test);
            }
        }

        throw new ed_error("unterminated regular expression bracket expression");
    }

    private read_class_item(): class_item {
        const marker = this.source.slice(this.index, this.index + 2);
        if (marker === "[:" || marker === "[." || marker === "[=") {
            const terminator = `${marker[1]}]`;
            const close = this.source.indexOf(terminator, this.index + 2);
            if (close < 0) {
                throw new ed_error("invalid POSIX bracket expression");
            }
            const content = this.source.slice(this.index + 2, close);
            this.index = close + 2;
            if (marker === "[:") {
                return {
                    value: -1,
                    rangeable: false,
                    test: character_class(content),
                };
            }
            if (content.length !== 1) {
                throw new ed_error("invalid POSIX collating element");
            }
            const value = content.charCodeAt(0);
            return {
                value,
                rangeable: marker === "[.",
                test: (item) => item === value,
            };
        }

        const character = this.source[this.index];
        if (character === undefined || character === "]") {
            throw new ed_error("invalid regular expression bracket expression");
        }
        this.index += 1;
        const value = character.charCodeAt(0);
        return { value, rangeable: true, test: (item) => item === value };
    }

    private is_group_end(): boolean {
        return this.source[this.index] === "\\" && this.source[this.index + 1] === ")";
    }
}

function character_class(name: string): (value: number) => boolean {
    switch (name) {
        case "alnum":
            return (value) => is_ascii_letter(value) || is_ascii_digit(value);
        case "alpha":
            return is_ascii_letter;
        case "blank":
            return (value) => value === 0x20 || value === 0x09;
        case "cntrl":
            return (value) => value < 0x20 || value === 0x7f;
        case "digit":
            return is_ascii_digit;
        case "graph":
            return (value) => value >= 0x21 && value <= 0x7e;
        case "lower":
            return (value) => value >= 0x61 && value <= 0x7a;
        case "print":
            return (value) => value >= 0x20 && value <= 0x7e;
        case "punct":
            return (value) =>
                (value >= 0x21 && value <= 0x2f) ||
                (value >= 0x3a && value <= 0x40) ||
                (value >= 0x5b && value <= 0x60) ||
                (value >= 0x7b && value <= 0x7e);
        case "space":
            return (value) => [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20].includes(value);
        case "upper":
            return (value) => value >= 0x41 && value <= 0x5a;
        case "xdigit":
            return (value) =>
                is_ascii_digit(value) ||
                (value >= 0x41 && value <= 0x46) ||
                (value >= 0x61 && value <= 0x66);
        default:
            throw new ed_error("unknown POSIX character class");
    }
}

function is_ascii_digit(value: number): boolean {
    return value >= 0x30 && value <= 0x39;
}

function is_ascii_letter(value: number): boolean {
    return (value >= 0x41 && value <= 0x5a) || (value >= 0x61 && value <= 0x7a);
}

export function compile_bre(source: string): bre_program {
    return new bre_parser(source).parse();
}

export function find_bre(
    line_bytes: Uint8Array,
    program: bre_program,
    from = 0,
): bre_match | undefined {
    const line = string_from_bytes(line_bytes);
    for (let start = Math.max(0, from); start <= line.length; start += 1) {
        const states = match_node(program.root, line, {
            position: start,
            captures: new Map(),
        });
        let best: match_state | undefined;
        for (const state of states) {
            if (best === undefined || state.position > best.position) {
                best = state;
            }
        }
        if (best !== undefined) {
            return {
                start,
                end: best.position,
                captures: best.captures,
            };
        }
    }
    return undefined;
}

function match_node(node: bre_node, line: string, state: match_state): match_state[] {
    switch (node.kind) {
        case "sequence": {
            let states = [state];
            for (const child of node.children) {
                states = states.flatMap((item) => match_node(child, line, item));
                if (states.length === 0) {
                    break;
                }
            }
            return states;
        }
        case "literal":
            return line.charCodeAt(state.position) === node.value
                ? [{ position: state.position + 1, captures: state.captures }]
                : [];
        case "any":
            return state.position < line.length
                ? [{ position: state.position + 1, captures: state.captures }]
                : [];
        case "start":
            return state.position === 0 ? [state] : [];
        case "end":
            return state.position === line.length ? [state] : [];
        case "class":
            return state.position < line.length && node.test(line.charCodeAt(state.position))
                ? [{ position: state.position + 1, captures: state.captures }]
                : [];
        case "group": {
            const matches = match_node(node.child, line, state);
            return matches.map((item) => ({
                position: item.position,
                captures: new Map(item.captures).set(node.id, {
                    start: state.position,
                    end: item.position,
                }),
            }));
        }
        case "backref": {
            const capture = state.captures.get(node.id);
            if (capture === undefined) {
                return [];
            }
            const value = line.slice(capture.start, capture.end);
            return line.startsWith(value, state.position)
                ? [{ position: state.position + value.length, captures: state.captures }]
                : [];
        }
        case "repeat":
            return match_repeat(node, line, state, 0);
    }
}

function match_repeat(
    node: Extract<bre_node, { kind: "repeat" }>,
    line: string,
    state: match_state,
    count: number,
): match_state[] {
    const results: match_state[] = [];
    if (count >= node.min) {
        results.push(state);
    }
    if (count >= node.max) {
        return results;
    }

    const children = match_node(node.child, line, state);
    for (const child of children) {
        if (child.position === state.position) {
            continue;
        }
        results.push(...match_repeat(node, line, child, count + 1));
    }
    return results;
}

export function substitute_bre(
    line_bytes: Uint8Array,
    program: bre_program,
    replacement: string,
    global: boolean,
    occurrence: number | undefined,
): substitution_result {
    const line = string_from_bytes(line_bytes);
    const replacements: Array<{ match: bre_match; value: string }> = [];
    let from = 0;
    let match_number = 0;

    while (from <= line.length) {
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
        from = match.end === match.start ? match.end + 1 : match.end;
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

    const split = result.split("\n").map((item) => bytes_from_string(item));
    return { changed: true, lines: split };
}

function expand_replacement(line: string, match: bre_match, replacement: string): string {
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

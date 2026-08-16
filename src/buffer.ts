/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { copy_bytes, ed_error, type buffer_snapshot, type line_record } from "./types";

export class line_buffer {
    public current = 0;
    public changed = false;

    private next_id = 1;
    private lines: line_record[] = [];
    private marks = new Map<string, number>();

    public get line_count(): number {
        return this.lines.length;
    }

    public get all_lines(): readonly line_record[] {
        return this.lines;
    }

    public load(values: readonly Uint8Array[]): void {
        this.lines = values.map((bytes) => this.new_line(bytes));
        this.current = this.lines.length;
        this.marks.clear();
        this.changed = false;
    }

    public snapshot(): buffer_snapshot {
        return {
            lines: this.lines.map((line) => ({
                id: line.id,
                bytes: copy_bytes(line.bytes),
            })),
            current: this.current,
            next_id: this.next_id,
            marks: new Map(this.marks),
            changed: this.changed,
        };
    }

    public restore(snapshot: buffer_snapshot): void {
        this.lines = snapshot.lines.map((line) => ({
            id: line.id,
            bytes: copy_bytes(line.bytes),
        }));
        this.current = snapshot.current;
        this.next_id = snapshot.next_id;
        this.marks = new Map(snapshot.marks);
        this.changed = snapshot.changed;
    }

    public line(address: number): line_record {
        if (address < 1 || address > this.line_count) {
            throw new ed_error("invalid address");
        }

        const line = this.lines[address - 1];
        if (line === undefined) {
            throw new ed_error("invalid address");
        }

        return line;
    }

    public bytes(address: number): Uint8Array {
        return copy_bytes(this.line(address).bytes);
    }

    public range(start: number, end: number): line_record[] {
        if (start < 1 || end < start || end > this.line_count) {
            throw new ed_error("invalid address range");
        }

        return this.lines.slice(start - 1, end);
    }

    public insert_after(address: number, values: readonly Uint8Array[]): void {
        if (address < 0 || address > this.line_count) {
            throw new ed_error("invalid address");
        }

        const records = values.map((bytes) => this.new_line(bytes));
        this.lines.splice(address, 0, ...records);
        this.current = records.length === 0 ? address : address + records.length;
        this.changed = this.changed || records.length !== 0;
    }

    public delete(start: number, end: number): void {
        this.range(start, end);
        const removed = this.lines.splice(start - 1, end - start + 1);
        const removed_ids = new Set(removed.map((line) => line.id));

        for (const [name, id] of this.marks) {
            if (removed_ids.has(id)) {
                this.marks.delete(name);
            }
        }

        this.current = Math.min(start, this.line_count);
        this.changed = true;
    }

    public replace(start: number, end: number, values: readonly Uint8Array[]): void {
        this.range(start, end);
        this.delete(start, end);
        this.insert_after(start - 1, values);
    }

    public move(start: number, end: number, target: number): void {
        this.range(start, end);
        if (target < 0 || target > this.line_count) {
            throw new ed_error("invalid address");
        }
        if (target >= start && target <= end) {
            throw new ed_error("invalid move destination");
        }

        const count = end - start + 1;
        const records = this.lines.splice(start - 1, count);
        const insertion_index = target > end ? target - count : target;
        this.lines.splice(insertion_index, 0, ...records);
        this.current = insertion_index + count;
        this.changed = true;
    }

    public copy(start: number, end: number, target: number): void {
        this.range(start, end);
        if (target < 0 || target > this.line_count) {
            throw new ed_error("invalid address");
        }

        const records = this.range(start, end).map((line) => this.new_line(line.bytes));
        this.lines.splice(target, 0, ...records);
        this.current = target + records.length;
        this.changed = true;
    }

    public join(start: number, end: number): void {
        this.range(start, end);
        if (start === end) {
            this.current = start;
            return;
        }

        const total = this.range(start, end).reduce(
            (length, line) => length + line.bytes.length,
            0,
        );
        const joined = new Uint8Array(total);
        let offset = 0;

        for (const line of this.range(start, end)) {
            joined.set(line.bytes, offset);
            offset += line.bytes.length;
        }

        const removed_ids = new Set(this.range_ids(start + 1, end));
        const first = this.line(start);
        this.lines.splice(start - 1, end - start + 1, {
            id: first.id,
            bytes: joined,
        });
        for (const [name, id] of this.marks) {
            if (removed_ids.has(id)) {
                this.marks.delete(name);
            }
        }
        this.current = start;
        this.changed = true;
    }

    public set_bytes(address: number, bytes: Uint8Array): void {
        const line = this.line(address);
        line.bytes = copy_bytes(bytes);
        this.current = address;
        this.changed = true;
    }

    public mark(name: string, address: number): void {
        this.line(address);
        this.marks.set(name, this.line(address).id);
    }

    public marked(name: string): number {
        const id = this.marks.get(name);
        if (id === undefined) {
            throw new ed_error("undefined mark");
        }

        const index = this.lines.findIndex((line) => line.id === id);
        if (index < 0) {
            throw new ed_error("undefined mark");
        }

        return index + 1;
    }

    public ids(start: number, end: number): number[] {
        return this.range(start, end).map((line) => line.id);
    }

    public address_of(id: number): number | undefined {
        const index = this.lines.findIndex((line) => line.id === id);
        return index < 0 ? undefined : index + 1;
    }

    private range_ids(start: number, end: number): number[] {
        if (start > end) {
            return [];
        }

        return this.lines.slice(start - 1, end).map((line) => line.id);
    }

    private new_line(bytes: Uint8Array): line_record {
        return {
            id: this.next_id++,
            bytes: copy_bytes(bytes),
        };
    }
}

/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { fstatSync } from "node:fs";

import { editor } from "./editor";
import { stdin_line_reader, process_output } from "./io";
import { ed_error, type input_kind } from "./types";

interface command_line_options {
    pathname: string | undefined;
    prompt: string | undefined;
    silent: boolean;
}

async function
main(): Promise<void>
{
    try {
        const options = parse_options(process.argv.slice(2));
        const instance = new editor(
            new stdin_line_reader(),
            new process_output(),
            {
                input_kind: standard_input_kind(),
                prompt: options.prompt,
                silent: options.silent,
            },
        );
        process.on("SIGINT", () => instance.interrupt());
        process.on("SIGQUIT", () => undefined);
        process.on("SIGHUP", () => {
            void instance.handle_hangup();
        });
        process.exitCode = await instance.run(options.pathname);
    } catch (error) {
        const message = error instanceof Error ? error.message : "error";
        process.stderr.write(`ed: ${message}\n`);
        process.exitCode = 1;
    }
}

function
standard_input_kind(): input_kind
{
    if (process.stdin.isTTY) {
        return "terminal";
    }
    try {
        return fstatSync(0).isFile() ? "regular" : "other";
    } catch {
        return "other";
    }
}

function
parse_options(arguments_list: readonly string[]): command_line_options
{
    let prompt: string | undefined;
    let silent = false;
    let pathname: string | undefined;
    let options_enabled = true;

    for (let index = 0; index < arguments_list.length; index += 1) {
        const argument = arguments_list[index];
        if (argument === undefined) {
            continue;
        }
        if (options_enabled && argument === "--") {
            options_enabled = false;
            continue;
        }
        if (options_enabled && argument === "-s") {
            silent = true;
            continue;
        }
        if (options_enabled && argument === "-p") {
            const next = arguments_list[index + 1];
            if (next === undefined) {
                throw new ed_error("option -p requires an argument");
            }
            prompt = next;
            index += 1;
            continue;
        }
        if (options_enabled && argument.startsWith("-p") && argument.length > 2) {
            prompt = argument.slice(2);
            continue;
        }
        if (options_enabled && argument.startsWith("-")) {
            throw new ed_error(`unknown option: ${argument}`);
        }
        if (pathname !== undefined) {
            throw new ed_error("too many pathnames");
        }
        pathname = argument;
    }

    return { pathname, prompt, silent };
}

void main();

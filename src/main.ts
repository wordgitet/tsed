/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { fstatSync } from "node:fs";

import { editor } from "./editor";
import { stdin_line_reader, process_output } from "./io";
import { posix_regex } from "./native";
import { ed_error, type input_kind } from "./types";

export interface command_line_options {
    pathname: string | undefined;
    prompt: string | undefined;
    silent: boolean;
}

async function
main(): Promise<void>
{
    try {
        const options = parse_options(process.argv.slice(2));
        posix_regex();
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

export function
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
        if (
            options_enabled &&
            argument.startsWith("-") &&
            argument.length > 1
        ) {
            const option_group = argument.slice(1);
            for (
                let option_index = 0;
                option_index < option_group.length;
                option_index += 1
            ) {
                const option = option_group[option_index];
                if (option === "s") {
                    silent = true;
                    continue;
                }
                if (option === "p") {
                    const attached = option_group.slice(option_index + 1);
                    if (attached.length > 0) {
                        prompt = attached;
                    } else {
                        const next = arguments_list[index + 1];
                        if (next === undefined) {
                            throw new ed_error(
                                "option -p requires an argument",
                            );
                        }
                        prompt = next;
                        index += 1;
                    }
                    break;
                }
                throw new ed_error(`unknown option: -${option}`);
            }
            continue;
        }
        if (pathname !== undefined) {
            throw new ed_error("too many pathnames");
        }
        pathname = argument;
    }

    return { pathname, prompt, silent };
}

if (import.meta.main) {
    void main();
}

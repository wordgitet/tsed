/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface portable_case {
    name: string;
    arguments: readonly string[];
    stdin: string;
    stdout: string;
    stderr: string;
    status: number;
}

export interface portable_corpus {
    format: "portable-ed-corpus";
    version: 1;
    license: "0BSD";
    cases: readonly portable_case[];
}

const fixture: readonly string[] = [
    "amber",
    "blue",
    "coral",
    "denim",
    "ember",
    "fawn",
];

export function
build_portable_corpus(): portable_corpus
{
    const cases: portable_case[] = [];

    add_address_cases(cases);
    add_edit_cases(cases);
    add_join_cases(cases);
    add_transfer_cases(cases);
    add_substitution_cases(cases);
    add_global_cases(cases);
    add_output_cases(cases);
    add_state_cases(cases);
    add_error_cases(cases);

    return {
        format: "portable-ed-corpus",
        version: 1,
        license: "0BSD",
        cases,
    };
}

function
add_address_cases(cases: portable_case[]): void
{
    for (let index = 0; index < fixture.length; index += 1) {
        add_case(
            cases,
            `address/numeric/${index + 1}`,
            [`${index + 1}p`],
            `${fixture[index]}\n`,
        );
    }

    for (let start = 0; start < fixture.length; start += 1) {
        for (let end = start; end < fixture.length; end += 2) {
            add_case(
                cases,
                `address/range/${start + 1}-${end + 1}`,
                [`${start + 1},${end + 1}p`],
                lines_text(fixture.slice(start, end + 1)),
            );
        }
    }

    for (let current = 1; current <= fixture.length; current += 1) {
        const offset = fixture.length - current;
        const sign = offset === 0 ? "" : `+${offset}`;
        add_case(
            cases,
            `address/relative/${current}-to-last`,
            [`${current}p`, `.${sign}p`],
            `${fixture[current - 1]}\n${fixture.at(-1)}\n`,
        );
    }

    add_case(cases, "address/current", ["2p", ".p"], "blue\nblue\n");
    add_case(cases, "address/last", ["$p"], "fawn\n");
    add_case(cases, "address/all", [",p"], lines_text(fixture));
    add_case(cases, "address/search-forward", ["1p", "/ember/p"],
        "amber\nember\n");
    add_case(cases, "address/search-backward", ["1p", "?fawn?p"],
        "amber\nfawn\n");
}

function
add_edit_cases(cases: portable_case[]): void
{
    for (let index = 0; index < fixture.length; index += 1) {
        const deleted: string[] = [...fixture];
        deleted.splice(index, 1);
        add_case(
            cases,
            `edit/delete/${index + 1}`,
            [`${index + 1}d`, ",p"],
            lines_text(deleted),
        );

        const changed: string[] = [...fixture];
        changed.splice(index, 1, `changed-${index + 1}`);
        add_case(
            cases,
            `edit/change/${index + 1}`,
            [`${index + 1}c`, `changed-${index + 1}`, ".", ",p"],
            lines_text(changed),
        );
    }

    for (let address = 0; address <= fixture.length; address += 1) {
        const appended: string[] = [...fixture];
        appended.splice(address, 0, `after-${address}`);
        add_case(
            cases,
            `edit/append/${address}`,
            [`${address}a`, `after-${address}`, ".", ",p"],
            lines_text(appended),
        );
    }

    for (let address = 1; address <= fixture.length; address += 1) {
        const inserted: string[] = [...fixture];
        inserted.splice(address - 1, 0, `before-${address}`);
        add_case(
            cases,
            `edit/insert/${address}`,
            [`${address}i`, `before-${address}`, ".", ",p"],
            lines_text(inserted),
        );
    }
}

function
add_join_cases(cases: portable_case[]): void
{
    for (let start = 0; start < fixture.length - 1; start += 1) {
        for (
            let end = start + 1;
            end < fixture.length && end <= start + 2;
            end += 1
        ) {
            const joined: string[] = [...fixture];
            joined.splice(
                start,
                end - start + 1,
                fixture.slice(start, end + 1).join(""),
            );
            add_case(
                cases,
                `edit/join/${start + 1}-${end + 1}`,
                [`${start + 1},${end + 1}j`, ",p"],
                lines_text(joined),
            );
        }
    }
}

function
add_transfer_cases(cases: portable_case[]): void
{
    const transfers = [
        { range: "1", destination: "$", lines: [
            "blue", "coral", "denim", "ember", "fawn", "amber",
        ] },
        { range: "2,3", destination: "$", lines: [
            "amber", "denim", "ember", "fawn", "blue", "coral",
        ] },
        { range: "5,6", destination: "0", lines: [
            "ember", "fawn", "amber", "blue", "coral", "denim",
        ] },
        { range: "3,4", destination: "1", lines: [
            "amber", "coral", "denim", "blue", "ember", "fawn",
        ] },
    ] as const;

    for (const item of transfers) {
        add_case(
            cases,
            `edit/move/${item.range}-after-${item.destination}`,
            [`${item.range}m${item.destination}`, ",p"],
            lines_text(item.lines),
        );
    }

    const copies = [
        { range: "1", destination: "$", extra: ["amber"] },
        { range: "2,3", destination: "$", extra: ["blue", "coral"] },
        { range: "5,6", destination: "$", extra: ["ember", "fawn"] },
    ] as const;
    for (const item of copies) {
        add_case(
            cases,
            `edit/copy/${item.range}-after-${item.destination}`,
            [`${item.range}t${item.destination}`, ",p"],
            lines_text([...fixture, ...item.extra]),
        );
    }
}

function
add_substitution_cases(cases: portable_case[]): void
{
    const words = ["amber", "blue", "coral", "denim", "ember", "fawn"];
    for (let index = 0; index < words.length; index += 1) {
        const word = words[index] ?? "";
        const replacement = word.toUpperCase();
        add_case(
            cases,
            `substitute/literal/${word}`,
            [`${index + 1}s/${word}/${replacement}/`, `${index + 1}p`],
            `${replacement}\n`,
        );
    }

    const repeated = ["aaaa", "ababab", "mississippi", "one one one"];
    for (const line of repeated) {
        const source = line.includes("one") ? "one" : line[0] ?? "x";
        const expected = line.split(source).join("X");
        add_case(
            cases,
            `substitute/global/${portable_name(line)}`,
            ["$c", line, ".", `s/${source}/X/g`, "p"],
            `${expected}\n`,
        );
    }

    add_case(cases, "substitute/anchor/start", ["1s/^/start-/", "1p"],
        "start-amber\n");
    add_case(cases, "substitute/anchor/end", ["1s/$/-end/", "1p"],
        "amber-end\n");
    add_case(cases, "substitute/group/back-reference",
        ["1s/\\(am\\)ber/\\1-\\1/", "1p"], "am-am\n");
    add_case(cases, "substitute/whole-match",
        ["1s/am[[:alpha:]]*/<&>/", "1p"], "<amber>\n");
}

function
add_global_cases(cases: portable_case[]): void
{
    const expressions = ["^a", "e", "^[a-c]", "n$", "^.....$"];
    for (const expression of expressions) {
        const regular_expression = new RegExp(expression);
        add_case(
            cases,
            `global/matching/${portable_name(expression)}`,
            [`g/${expression}/p`],
            lines_text(fixture.filter((line) => regular_expression.test(line))),
        );
        add_case(
            cases,
            `global/nonmatching/${portable_name(expression)}`,
            [`v/${expression}/p`],
            lines_text(fixture.filter(
                (line) => !regular_expression.test(line),
            )),
        );
    }

    add_case(cases, "global/delete", ["g/e/d", ",p"],
        "coral\nfawn\n");
    add_case(cases, "global/substitute", ["g/e/s/e/E/g", ",p"],
        "ambEr\nbluE\ncoral\ndEnim\nEmbEr\nfawn\n");
}

function
add_output_cases(cases: portable_case[]): void
{
    for (let index = 0; index < fixture.length; index += 1) {
        add_case(
            cases,
            `output/number/${index + 1}`,
            [`${index + 1}n`],
            `${index + 1}\t${fixture[index]}\n`,
        );
        add_case(
            cases,
            `output/equals/${index + 1}`,
            [`${index + 1}=`],
            `${index + 1}\n`,
        );
    }

    add_case(cases, "output/list/end-marker", ["1l"], "amber$\n");
    add_case(cases, "output/list/tab", ["1c", "a\tb", ".", "1l"],
        "a\\tb$\n");
    add_case(cases, "output/print-range", ["2,4p"],
        "blue\ncoral\ndenim\n");
}

function
add_state_cases(cases: portable_case[]): void
{
    for (let index = 1; index <= fixture.length; index += 1) {
        add_case(
            cases,
            `state/mark/${index}`,
            [`${index}ka`, "'ap"],
            `${fixture[index - 1]}\n`,
        );
    }

    add_case(cases, "state/undo-delete", ["3d", "u", ",p"],
        lines_text(fixture));
    add_case(cases, "state/undo-change", ["2c", "changed", ".", "u", ",p"],
        lines_text(fixture));
    add_case(cases, "state/undo-substitute", ["1s/a/A/", "u", "1p"],
        "amber\n");
}

function
add_error_cases(cases: portable_case[]): void
{
    const commands = ["0p", "7p", "4,2p", "'zp", "/missing/p"];
    for (const command of commands) {
        add_case(
            cases,
            `error/${portable_name(command)}`,
            [command],
            "?\n",
            1,
        );
    }
}

function
add_case(
    cases: portable_case[],
    name: string,
    commands: readonly string[],
    stdout: string,
    status = 0,
): void
{
    cases.push({
        name,
        arguments: ["-s"],
        stdin: lines_text([
            "a",
            ...fixture,
            ".",
            ...commands,
            "w /dev/null",
            "q",
        ]),
        stdout,
        stderr: "",
        status,
    });
}

function
lines_text(lines: readonly string[]): string
{
    if (lines.length === 0) {
        return "";
    }
    return `${lines.join("\n")}\n`;
}

function
portable_name(value: string): string
{
    return value.replaceAll(/[^A-Za-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "") || "empty";
}

async function
main(): Promise<void>
{
    const project_root = dirname(dirname(fileURLToPath(import.meta.url)));
    const output_path = join(project_root, "test", "portable", "cases.json");
    const corpus = build_portable_corpus();
    await Bun.write(output_path, `${JSON.stringify(corpus, null, 2)}\n`);
    process.stdout.write(`generated ${corpus.cases.length} cases\n`);
}

if (import.meta.main) {
    await main();
}

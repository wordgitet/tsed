/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

export class pty_session {
	private readonly decoder = new TextDecoder();
	private readonly terminal: Bun.Terminal;
	private readonly child: Bun.Subprocess;
	private transcript = "";

	public constructor(
		command: readonly string[],
		cwd?: string,
		environment?: Readonly<Record<string, string | undefined>>,
	)
	{
		this.terminal = new Bun.Terminal({
			cols: 80,
			rows: 24,
			name: "xterm",
			data: (_terminal, data) => {
				this.transcript += this.decoder.decode(data, { stream: true });
			},
		});
		this.child = Bun.spawn([...command], {
			...(cwd === undefined ? {} : { cwd }),
			env: {
				...process.env,
				LC_ALL: "C",
				TERM: "xterm",
				...environment,
			},
			terminal: this.terminal,
		});
	}

	public output(): string
	{
		return this.transcript;
	}

	public write(value: string): void
	{
		this.terminal.write(value);
	}

	public signal(signal: NodeJS.Signals): void
	{
		this.child.kill(signal);
	}

	public async wait_for(
		text: string,
		timeout_ms = 2_000,
	): Promise<void>
	{
		await this.wait_for_count(text, 1, timeout_ms);
	}

	public async wait_for_count(
		text: string,
		occurrences: number,
		timeout_ms = 2_000,
	): Promise<void>
	{
		const deadline = performance.now() + timeout_ms;
		for (;;) {
			if (count_occurrences(this.transcript, text) >= occurrences) {
				return;
			}
			if (performance.now() >= deadline) {
				throw new Error(
					`timeout waiting for ${JSON.stringify(text)} in ` +
						JSON.stringify(this.transcript),
				);
			}
			await Bun.sleep(5);
		}
	}

	public async exited(timeout_ms = 3_000): Promise<number>
	{
		let timeout_id: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_resolve, reject) => {
			timeout_id = setTimeout(() => {
				this.child.kill("SIGKILL");
				reject(new Error(`process timeout after ${timeout_ms} ms`));
			}, timeout_ms);
		});

		try {
			return await Promise.race([this.child.exited, timeout]);
		} finally {
			if (timeout_id !== undefined) {
				clearTimeout(timeout_id);
			}
			this.transcript += this.decoder.decode();
			this.terminal.close();
		}
	}

	public close(): void
	{
		if (!this.terminal.closed) {
			this.child.kill("SIGKILL");
			this.terminal.close();
		}
	}
}

function
count_occurrences(value: string, needle: string): number
{
	if (needle.length === 0) {
		return 0;
	}
	let count = 0;
	let start = 0;
	for (;;) {
		const index = value.indexOf(needle, start);
		if (index === -1) {
			return count;
		}
		count += 1;
		start = index + needle.length;
	}
}

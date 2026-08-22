/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

export function
build_portable_schema(): Readonly<Record<string, unknown>>
{
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://codeberg.org/wordgitet/tsed/raw/branch/main/" +
			"test/portable/schema-v2.json",
		title: "Portable ed torture corpus version 2",
		type: "object",
		additionalProperties: false,
		required: [
			"format",
			"version",
			"license",
			"standard",
			"placeholder",
			"cases",
		],
		properties: {
			format: { const: "portable-ed-corpus" },
			version: { const: 2 },
			license: { const: "0BSD" },
			standard: { const: "POSIX.1-2024" },
			placeholder: { const: "@TMP@" },
			cases: {
				type: "array",
				items: { $ref: "#/$defs/case" },
			},
		},
		$defs: portable_definitions(),
	};
}

export function
build_requirements_schema(): Readonly<Record<string, unknown>>
{
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://codeberg.org/wordgitet/tsed/raw/branch/main/" +
			"test/portable/requirements-schema-v1.json",
		title: "Portable ed POSIX requirement map version 1",
		type: "object",
		additionalProperties: false,
		required: ["format", "version", "standard", "source", "requirements"],
		properties: {
			format: { const: "tsed-posix-requirements" },
			version: { const: 1 },
			standard: { const: "POSIX.1-2024" },
			source: { type: "string", format: "uri" },
			requirements: {
				type: "array",
				items: { $ref: "#/$defs/requirement" },
			},
		},
		$defs: {
			requirement: {
				type: "object",
				additionalProperties: false,
				required: [
					"id",
					"section",
					"summary",
					"disposition",
					"coverage",
				],
				properties: {
					id: { type: "string", minLength: 1 },
					section: { type: "string", minLength: 1 },
					summary: { type: "string", minLength: 1 },
					disposition: {
						enum: [
							"covered",
							"platform-dependent",
							"permitted-choice",
						],
					},
					coverage: {
						type: "array",
						minItems: 1,
						items: { type: "string", minLength: 1 },
					},
				},
			},
		},
	};
}

function
portable_definitions(): Readonly<Record<string, unknown>>
{
	return {
		data: {
			type: "object",
			additionalProperties: false,
			required: ["encoding", "data"],
			properties: {
				encoding: { enum: ["utf8", "base64"] },
				data: { type: "string" },
			},
		},
		fixture: {
			type: "object",
			additionalProperties: false,
			required: ["path", "data"],
			properties: {
				path: { type: "string", minLength: 1 },
				data: { $ref: "#/$defs/data" },
			},
		},
		action: {
			oneOf: [
				{
					type: "object",
					additionalProperties: false,
					required: ["kind", "text"],
					properties: {
						kind: { const: "wait" },
						text: { type: "string" },
						occurrences: { type: "integer", minimum: 1 },
					},
				},
				{
					type: "object",
					additionalProperties: false,
					required: ["kind", "data"],
					properties: {
						kind: { const: "write" },
						data: { $ref: "#/$defs/data" },
					},
				},
				{
					type: "object",
					additionalProperties: false,
					required: ["kind", "signal"],
					properties: {
						kind: { const: "signal" },
						signal: {
							enum: ["SIGINT", "SIGQUIT", "SIGHUP"],
						},
					},
				},
			],
		},
		outcome: outcome_schema(),
		case: case_schema(),
	};
}

function
outcome_schema(): Readonly<Record<string, unknown>>
{
	return {
		type: "object",
		additionalProperties: false,
		required: ["status"],
		properties: {
			status: {
				oneOf: [
					{ type: "integer" },
					{ enum: ["nonzero", "any"] },
				],
			},
			stdout: { $ref: "#/$defs/data" },
			stderr: { $ref: "#/$defs/data" },
			stdout_contains: data_array_schema(),
			stderr_contains: data_array_schema(),
			stdout_minimum_bytes: { type: "integer", minimum: 0 },
			stderr_minimum_bytes: { type: "integer", minimum: 0 },
			transcript_contains: {
				type: "array",
				items: { type: "string" },
			},
			files: {
				type: "array",
				items: { $ref: "#/$defs/fixture" },
			},
			absent_files: {
				type: "array",
				items: { type: "string", minLength: 1 },
			},
		},
	};
}

function
case_schema(): Readonly<Record<string, unknown>>
{
	return {
		type: "object",
		additionalProperties: false,
		required: ["name", "requirement", "mode", "arguments", "expect"],
		properties: {
			name: { type: "string", minLength: 1 },
			requirement: { type: "string", minLength: 1 },
			mode: { enum: ["pipe", "pty"] },
			arguments: {
				type: "array",
				items: { type: "string" },
			},
			environment: {
				type: "object",
				additionalProperties: { type: "string" },
			},
			stdin: { $ref: "#/$defs/data" },
			actions: {
				type: "array",
				items: { $ref: "#/$defs/action" },
			},
			fixtures: {
				type: "array",
				items: { $ref: "#/$defs/fixture" },
			},
			requires: {
				type: "array",
				uniqueItems: true,
				items: {
					enum: [
						"posix-shell",
						"pty",
						"signals",
						"utf8-locale",
					],
				},
			},
			expect: {
				type: "array",
				minItems: 1,
				items: { $ref: "#/$defs/outcome" },
			},
			timeout_ms: { type: "integer", minimum: 1 },
		},
	};
}

function
data_array_schema(): Readonly<Record<string, unknown>>
{
	return {
		type: "array",
		items: { $ref: "#/$defs/data" },
	};
}

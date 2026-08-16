/*
 * Copyright (c) 2026 wordgitet
 *
 * SPDX-License-Identifier: 0BSD
 */

#include <locale.h>
#include <regex.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <wctype.h>

#include <node_api.h>

static napi_value
throw_error(napi_env env, const char *message)
{
	napi_throw_error(env, "tsed", message);
	return NULL;
}

static int
get_bytes(napi_env env, napi_value value, unsigned char **data, size_t *length)
{
	napi_typedarray_type type;
	napi_value arraybuffer;
	size_t offset;
	napi_status status;

	status = napi_get_typedarray_info(env, value, &type, length,
	    (void **)data, &arraybuffer, &offset);
	if (status != napi_ok || type != napi_uint8_array)
		return 0;
	return 1;
}

static int
get_number(napi_env env, napi_value value, size_t *number)
{
	double converted;

	if (napi_get_value_double(env, value, &converted) != napi_ok ||
	    converted < 0 || converted != (double)(size_t)converted)
		return 0;
	*number = (size_t)converted;
	return 1;
}

static int
validate_bytes(const unsigned char *data, size_t length)
{
	mbstate_t state;
	wchar_t character;
	size_t offset;
	size_t result;

	memset(&state, 0, sizeof(state));
	for (offset = 0; offset < length;) {
		if (data[offset] == '\0')
			return 0;
		result = mbrtowc(&character, (const char *)data + offset,
		    length - offset, &state);
		if (result == (size_t)-1 || result == (size_t)-2 || result == 0)
			return 0;
		offset += result;
	}
	return 1;
}

static napi_value
initialize_locale(napi_env env, napi_callback_info info)
{
	napi_value result;

	(void)info;
	if (setlocale(LC_CTYPE, "") == NULL ||
	    setlocale(LC_COLLATE, "") == NULL)
		return throw_error(env, "cannot initialize the process locale");
	if (napi_get_undefined(env, &result) != napi_ok)
		return throw_error(env, "cannot initialize the process locale");
	return result;
}

static void
finalize_regex(napi_env env, void *data, void *hint)
{
	regex_t *compiled = data;

	(void)env;
	(void)hint;
	if (compiled != NULL) {
		regfree(compiled);
		free(compiled);
	}
}

static const char *
compile_error_message(int error)
{
	switch (error) {
	case REG_ECOLLATE:
		return "invalid regular expression collating element";
	case REG_ECTYPE:
		return "unknown regular expression character class";
	case REG_EESCAPE:
		return "trailing backslash in regular expression";
	case REG_EBRACK:
		return "unterminated regular expression bracket expression";
	case REG_EPAREN:
		return "unmatched regular expression group";
	case REG_EBRACE:
	case REG_BADBR:
		return "invalid regular expression interval";
	case REG_ERANGE:
		return "invalid regular expression range";
	default:
		return "invalid regular expression";
	}
}

static napi_value
compile_regex(napi_env env, napi_callback_info info)
{
	napi_value argv[1];
	napi_value result;
	unsigned char *pattern;
	size_t length;
	regex_t *compiled;
	char *nul_terminated;
	int error;

	if (napi_get_cb_info(env, info, &(size_t){1}, argv, NULL, NULL) != napi_ok ||
	    !get_bytes(env, argv[0], &pattern, &length))
		return throw_error(env, "regular expression must be a byte array");
	if (!validate_bytes(pattern, length))
		return throw_error(env, "regular expression is not valid text");

	nul_terminated = malloc(length + 1);
	compiled = malloc(sizeof(*compiled));
	if (nul_terminated == NULL || compiled == NULL) {
		free(nul_terminated);
		free(compiled);
		return throw_error(env, "cannot allocate regular expression");
	}
	memcpy(nul_terminated, pattern, length);
	nul_terminated[length] = '\0';
	error = regcomp(compiled, nul_terminated, 0);
	free(nul_terminated);
	if (error != 0) {
		free(compiled);
		return throw_error(env, compile_error_message(error));
	}
	if (napi_create_external(env, compiled, finalize_regex, NULL,
	    &result) != napi_ok) {
		regfree(compiled);
		free(compiled);
		return throw_error(env, "cannot create regular expression handle");
	}
	return result;
}

static napi_value
make_span(napi_env env, regoff_t start, regoff_t end)
{
	napi_value object;
	napi_value value;

	if (napi_create_object(env, &object) != napi_ok)
		return NULL;
	if (napi_create_int64(env, (int64_t)start, &value) != napi_ok ||
	    napi_set_named_property(env, object, "start", value) != napi_ok ||
	    napi_create_int64(env, (int64_t)end, &value) != napi_ok ||
	    napi_set_named_property(env, object, "end", value) != napi_ok)
		return NULL;
	return object;
}

static napi_value
execute_regex(napi_env env, napi_callback_info info)
{
	napi_value argv[3];
	napi_value result;
	napi_value captures;
	napi_value span;
	regex_t *compiled;
	unsigned char *line;
	char *nul_terminated;
	size_t length;
	size_t from;
	regmatch_t matches[10];
	int flags;
	int error;
	size_t index;

	if (napi_get_cb_info(env, info, &(size_t){3}, argv, NULL, NULL) != napi_ok ||
	    napi_get_value_external(env, argv[0], (void **)&compiled) != napi_ok ||
	    !get_bytes(env, argv[1], &line, &length) ||
	    !get_number(env, argv[2], &from))
		return throw_error(env, "invalid regular expression execution arguments");
	if (from > length || !validate_bytes(line, length))
		return throw_error(env, "input is not valid text");
	nul_terminated = malloc(length + 1);
	if (nul_terminated == NULL)
		return throw_error(env, "cannot allocate regular expression input");
	memcpy(nul_terminated, line, length);
	nul_terminated[length] = '\0';

	memset(matches, 0, sizeof(matches));
	flags = from == 0 ? 0 : REG_NOTBOL;
#ifdef REG_STARTEND
	matches[0].rm_so = (regoff_t)from;
	matches[0].rm_eo = (regoff_t)length;
	flags |= REG_STARTEND;
	error = regexec(compiled, nul_terminated, 10, matches, flags);
#else
	error = regexec(compiled, nul_terminated + from, 10, matches, flags);
	if (error == 0) {
		for (index = 0; index < 10; index++) {
			if (matches[index].rm_so >= 0)
				matches[index].rm_so += (regoff_t)from;
			if (matches[index].rm_eo >= 0)
				matches[index].rm_eo += (regoff_t)from;
		}
	}
#endif
	free(nul_terminated);
	if (error == REG_NOMATCH)
		return napi_get_null(env, &result) == napi_ok
		    ? result : throw_error(env, "cannot create regular expression result");
	if (error != 0)
		return throw_error(env, "regular expression execution failed");
	if (napi_create_object(env, &result) != napi_ok ||
	    napi_create_array_with_length(env, 9, &captures) != napi_ok)
		return throw_error(env, "cannot create regular expression result");
	if (napi_create_int64(env, matches[0].rm_so, &span) != napi_ok ||
	    napi_set_named_property(env, result, "start", span) != napi_ok ||
	    napi_create_int64(env, matches[0].rm_eo, &span) != napi_ok ||
	    napi_set_named_property(env, result, "end", span) != napi_ok)
		return throw_error(env, "cannot create regular expression result");
	for (index = 1; index < 10; index++) {
		if (matches[index].rm_so < 0) {
			if (napi_get_null(env, &span) != napi_ok)
				return throw_error(env, "cannot create regular expression capture");
		} else {
			span = make_span(env, matches[index].rm_so, matches[index].rm_eo);
			if (span == NULL)
				return throw_error(env, "cannot create regular expression capture");
		}
		if (napi_set_element(env, captures, index - 1, span) != napi_ok)
			return throw_error(env, "cannot create regular expression capture");
	}
	if (napi_set_named_property(env, result, "captures", captures) != napi_ok)
		return throw_error(env, "cannot create regular expression result");
	return result;
}

static napi_value
scan_text(napi_env env, napi_callback_info info)
{
	napi_value argv[1];
	napi_value result;
	napi_value item;
	napi_value value;
	unsigned char *data;
	size_t length;
	mbstate_t state;
	wchar_t character;
	size_t offset;
	size_t next;
	size_t index;

	if (napi_get_cb_info(env, info, &(size_t){1}, argv, NULL, NULL) != napi_ok ||
	    !get_bytes(env, argv[0], &data, &length))
		return throw_error(env, "text must be a byte array");
	if (napi_create_array(env, &result) != napi_ok)
		return throw_error(env, "cannot create text scan result");
	memset(&state, 0, sizeof(state));
	index = 0;
	for (offset = 0; offset < length;) {
		if (data[offset] == '\0')
			return throw_error(env, "text contains NUL");
		next = mbrtowc(&character, (const char *)data + offset,
		    length - offset, &state);
		if (next == (size_t)-1 || next == (size_t)-2 || next == 0)
			return throw_error(env, "text contains an invalid multibyte sequence");
		if (napi_create_object(env, &item) != napi_ok ||
		    napi_create_uint32(env, (uint32_t)offset, &value) != napi_ok ||
		    napi_set_named_property(env, item, "start", value) != napi_ok ||
		    napi_create_uint32(env, (uint32_t)(offset + next), &value) != napi_ok ||
		    napi_set_named_property(env, item, "end", value) != napi_ok ||
		    napi_get_boolean(env, iswprint(character) != 0, &value) != napi_ok ||
		    napi_set_named_property(env, item, "printable", value) != napi_ok ||
		    napi_set_element(env, result, index, item) != napi_ok)
			return throw_error(env, "cannot create text scan result");
		offset += next;
		index += 1;
	}
	return result;
}

static napi_value
next_character(napi_env env, napi_callback_info info)
{
	napi_value argv[2];
	napi_value result;
	unsigned char *data;
	size_t length;
	size_t offset;
	mbstate_t state;
	wchar_t character;
	size_t count;

	if (napi_get_cb_info(env, info, &(size_t){2}, argv, NULL, NULL) != napi_ok ||
	    !get_bytes(env, argv[0], &data, &length) ||
	    !get_number(env, argv[1], &offset))
		return throw_error(env, "invalid character offset");
	if (offset >= length)
		return throw_error(env, "character offset is outside the text");
	memset(&state, 0, sizeof(state));
	count = mbrtowc(&character, (const char *)data + offset,
	    length - offset, &state);
	if (count == (size_t)-1 || count == (size_t)-2 || count == 0)
		return throw_error(env, "text contains an invalid multibyte sequence");
	if (napi_create_uint32(env, (uint32_t)(offset + count), &result) != napi_ok)
		return throw_error(env, "cannot create character offset");
	return result;
}

static napi_value
init_module(napi_env env, napi_value exports)
{
	napi_property_descriptor properties[] = {
		{ "initialize_locale", NULL, initialize_locale, NULL, NULL, NULL,
		    napi_default, NULL },
		{ "compile", NULL, compile_regex, NULL, NULL, NULL, napi_default, NULL },
		{ "execute", NULL, execute_regex, NULL, NULL, NULL, napi_default, NULL },
		{ "scan_text", NULL, scan_text, NULL, NULL, NULL, napi_default, NULL },
		{ "next_character", NULL, next_character, NULL, NULL, NULL,
		    napi_default, NULL },
	};

	if (napi_define_properties(env, exports,
	    sizeof(properties) / sizeof(properties[0]), properties) != napi_ok)
		return throw_error(env, "cannot initialize native module");
	return exports;
}

NAPI_MODULE_INIT()
{
	return init_module(env, exports);
}

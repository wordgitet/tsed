{
  "targets": [
    {
      "target_name": "tsed_posix_regex",
      "sources": ["native/posix_regex.c"],
      "cflags": ["-std=c11", "-Wall", "-Wextra", "-Werror"],
      "defines": ["_POSIX_C_SOURCE=200809L"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c11",
        "GCC_C_LANGUAGE_STANDARD": "c11",
        "GCC_WARN_INHIBIT_ALL_WARNINGS": "NO",
      },
    },
  ],
}

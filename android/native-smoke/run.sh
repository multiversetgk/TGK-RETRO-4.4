#!/usr/bin/env bash
# Usage: run.sh <path-to-libretro-fceumm-checkout>
# Builds the core for the host, compiles the real JNI bridge source against stubs, runs the smoke test.
set -euo pipefail
FCEUMM_DIR="$(readlink -f "$1")"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
( cd "$FCEUMM_DIR" && make -f Makefile.libretro platform=unix -j"$(nproc)" >/dev/null )
CORE="$(ls "$FCEUMM_DIR"/fceumm_libretro.so)"
JH="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(which javac)")")")}"
g++ -std=c++17 -I"$HERE/../app/src/main/cpp" -I"$HERE/stub" -I"$JH/include" -I"$JH/include/linux" \
    "$HERE/smoke.cpp" -o "$OUT/smoke" -ldl
python3 "$HERE/gen_test_rom.py" "$OUT/test.nes"
"$OUT/smoke" "$CORE" "$OUT/test.nes"

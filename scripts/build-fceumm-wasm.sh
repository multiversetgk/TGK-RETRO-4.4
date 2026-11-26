#!/usr/bin/env bash
set -euo pipefail

# Optional self-hosted build script for https://github.com/libretro/libretro-fceumm
# Compiles FCEUmm directly from upstream GitHub C source into public/cores/
# so LibretroFceummAdapter can load it 100% offline without jsDelivr CDN.
#
# Prerequisites: Emscripten SDK (emsdk) activated in PATH (`emcc`, `emmake`)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/.build/libretro-fceumm"
OUT_DIR="${ROOT_DIR}/public/cores"

if ! command -v emmake >/dev/null 2>&1; then
  echo "Error: Emscripten (emmake / emcc) not found in PATH."
  echo "Install emsdk first: https://emscripten.org/docs/getting_started/downloads.html"
  exit 1
fi

mkdir -p "${ROOT_DIR}/.build" "${OUT_DIR}"

if [ ! -d "${BUILD_DIR}" ]; then
  git clone --depth=1 https://github.com/libretro/libretro-fceumm.git "${BUILD_DIR}"
fi

cd "${BUILD_DIR}"
emmake make -f Makefile.libretro platform=emscripten clean
emmake make -f Makefile.libretro platform=emscripten -j"$(nproc 2>/dev/null || echo 4)"

echo "Built libretro-fceumm bitcode at ${BUILD_DIR}/fceumm_libretro_emscripten.bc"
echo "Link with RetroArch Emscripten target and place fceumm_libretro.{js,wasm} in ${OUT_DIR}/"

# Contributing to Galfus Engine

Thank you for your interest in contributing to **Galfus Engine**! This guide covers the local development setup, coding conventions, validation workflow, and how to submit a Pull Request.

---

## Prerequisites

- **Rust** (stable toolchain with `rustfmt`, `clippy`, and `wasm32-unknown-unknown` target)
- **Bun** (`>= 1.4`)
- **System dependencies (Linux)**: `pkg-config`, `libasound2-dev`, `libdbus-1-dev`, `libudev-dev`, `libwayland-dev`, `libx11-dev`, `libxcb-shape0-dev`, `libxcb-xfixes0-dev`, `libxkbcommon-dev`, `libvulkan1`, `mesa-vulkan-drivers`
- **Optional (only when editing multi-language feature-tour examples)**: `clang-format`, `uv` (`ruff`), `.NET 10 SDK`

---

## Getting Started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/galfus-multiverse/galfus-engine.git
   cd galfus-engine
   ```

2. Install JavaScript/TypeScript dependencies:

   ```bash
   bun install --frozen-lockfile --ignore-scripts
   ```

3. Generate multi-language SDKs and sync host packages:

   ```bash
   bun run codegen
   ```

4. If you also edit example runners (`examples/feature-tour/runners/*`), prepare the extra formatting tools:

   ```bash
   bun prepare
   ```

---

## Development Guidelines

- **Language**: Write all code, comments, commit messages, and technical documentation in English.
- **Rust conventions**:
  - Internal properties use `snake_case`; `serde` converts to `camelCase` at the host boundary.
  - Shared workspace dependencies belong in root `Cargo.toml` under `[workspace.dependencies]` and are referenced via `<dep>.workspace = true`. Crate-exclusive dependencies stay in that crate's `Cargo.toml`.
  - Prefix intentionally unused owned bindings with `_`; remove unused variables and dead functions.
- **Resource & ID policy**:
  - Logical IDs are owned by the host; physical IDs, pooling, and lifecycle management stay in the core.
  - Host logical IDs must never use the core-reserved range (`4294901761..=4294967295` for `u32`).
- **File size policy**: Target ~300 lines per source file and keep files at or below 600 lines (enforced by `scripts/check-file-lengths.ts`).
- **Scope**: Prefer minimal, focused changes over broad unrelated refactors.

---

## Validation Before Opening a PR

Run the checks relevant to your changes before pushing:

```bash
# Format code
bun run format

# Check formatting, file lengths, TypeScript types, and Rust Clippy (native + WASM)
bun run validate

# Run Rust workspace tests
cargo test --workspace

# Sync native binaries and run host tests
bun scripts/host-sync.ts --skip-wasm --no-clean-rebuild
GALFUS_TEST_NATIVE_PHYSICS=1 bun test host/demos host/engine host/gltf-loader host/transport-bun host/transport-node host/transport-types host/ui

# Optional: Browser/WASM transport tests and feature tour (requires wasm-bindgen-cli + Chromium)
bun scripts/host-sync.ts --only-wasm
bun test host/transport-browser
bun run test:tour:browser
```

---

## Branches, Commits & Pull Requests

1. Create a branch from `main` using a descriptive prefix (`feat/...`, `fix/...`, `refactor/...`, `docs/...`, `test/...`, `chore/...`).
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles (e.g., `feat(realm-3d): add decal baking`, `fix(ui): clamp scroll offset`, `ci: cache rust builds`).
3. Fill out the Pull Request template completely, including:
   - Summary of what changed and why
   - Linked issues (`Closes #...` or `Closes None`)
   - Appropriate `changelog:*` label checkbox
   - Validation steps performed and risks/rollback notes
4. Ensure the **`PR Quality Gate`** status check passes before merging.

---

## License

By contributing to Galfus Engine, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

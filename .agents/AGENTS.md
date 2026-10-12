## Project Configuration

- **Language**: Rust
- **Package Manager For Scripts and Typescript Bind**: bun

# Instructions for Agents

## 1) Priority and Scope

- Follow these instructions in this order:
  1. Correctness and safety.
  2. User intent and task completion.
  3. Clarity and concision.
  4. Token efficiency.

## 2) Communication Rules

- Keep responses short and concise whenever possible.
- Use the user's language for conversation.
- Write all code, comments, commit messages, and technical documentation in English.
- Do not blindly approve proposals. Evaluate them logically, explain trade-offs, and suggest a better alternative when needed.

## 3) Planning Rules

- Always create a strategic plan before implementation.
- Plans must be brief and actionable (steps, risks, validation).
- If the user asks only for analysis, do not modify files or generate code.

## 4) Implementation Rules

- Prefer minimal, high-impact changes over broad refactors.
- Reuse existing utilities and patterns before adding new abstractions.
- Remove unused variables and unused functions introduced or discovered during the task.
- Target file size around 300 lines; avoid exceeding 600 lines when splitting is practical.
- If files are changed externally while you work, treat those changes as intentional and do not revert them unless explicitly requested.
- Detect repetitive work and propose or create scripts to automate it.
- Files on .tmp/ are temporary and used for planning, prototyping, and testing. They can be modified or deleted without warning. This files are not version controlled and should not be used for permanent code or documentation.

## 5) Validation and Uncertainty Rules

- When uncertain about framework or API usage, consult official documentation before implementing.
- Before concluding, run the fastest reliable validation for the change (lint, typecheck, or targeted test).
- Surface blockers, assumptions, and risks early.

## 6) Project Rules

- Variables that hold ownership and are no longer used afterward must always receive the `_` prefix.
- If variables are unused, they must be removed.
- Unused functions must also be removed.
- Internal Rust properties use `snake_case`; serde converts them to `camelCase` on the host side.
- Resources must follow this pattern: logical IDs are controlled by the host, while all other management and control requirements remain in the core, including physical ID generation, pooling, etc.
- Host logical IDs must never use the core-reserved range (last `65535` possible values of the ID type).
- For `u32`, this reserved range is `4294901761..=4294967295` (`u32::MAX - 65535 + 1 ..= u32::MAX`).
- The core validates host logical IDs against this policy and rejects commands that use reserved IDs.
- Dependencies shared by more than one crate must be defined in the root `Cargo.toml` under `[workspace.dependencies]` and referenced in each crate as `<dep>.workspace = true`.
- Dependencies exclusive to a single crate must be declared only within that specific crate's `Cargo.toml`.


# `@galfus/demos`

Unified interactive catalog of **27 Galfus Engine demonstrations** built on `@galfus/engine`.

## Quick Start

```bash
# Launch the interactive @clack/prompts + Fuse.js fuzzy browser
bun demo

# List all 27 demos grouped by category
bun demo --list

# Run a specific demo by ID or alias
bun demo 3d5
bun demo phys3d2
bun demo tutorial

# Run any demo in headless mode for N frames (CI / smoke testing)
bun demo phys3d2 --headless --frames 10
```

## Categories

1. **Host & Interaction (`tutorial`, `interaction`, `text-input`, `trans-realm`)**
2. **Physics & Anchors (`anchor1`, `phys3d1`, `phys3d2`, `phys2d1`, `phys2d2`)**
3. **Multiverse (`mv1`, `mv2`, `mv3`, `mv4`)**
4. **Realm 3D (`3d1` .. `3d10`)**
5. **Realm 2D & Animation (`2d1`, `2d2`, `anim1`)**

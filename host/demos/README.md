# `@galfus/demos`

Unified interactive catalog of Galfus Engine demonstrations built on `@galfus/engine`.

## Quick Start

```bash
# Launch the interactive @clack/prompts + Fuse.js fuzzy browser
bun demo

# List demos grouped by category
bun demo --list

# Run a specific demo by ID or alias
bun demo 3d5
bun demo phys3d2
bun demo tutorial
bun demo ui3
bun demo ui4
bun demo ui5
bun demo ui6
bun demo ui7
bun demo ui8

# Run any demo in headless mode for N frames (CI / smoke testing)
bun demo phys3d2 --headless --frames 10
```

## Categories

The `ui3` demo shows the core-backed `@galfus/ui` button, button group, app
bar, and toolbar. Use Tab and Shift+Tab to move focus, and Enter, Space, or the
pointer to activate buttons. `ui4` demonstrates nested popovers and tooltips;
press Escape to close the top layer or exit when no layer is open. `ui5` exercises editable text and IME composition. `ui6` demonstrates selection and numeric controls. `ui7` demonstrates menus, dialogs and progress indicators; Escape closes the top layer or exits. `ui8` combines themes, editing, form controls, and overlays.

1. **Host & Interaction (`tutorial`, `interaction`, `text-input`, `trans-realm`)**
2. **Physics & Anchors (`anchor1`, `phys3d1`, `phys3d2`, `phys2d1`, `phys2d2`)**
3. **Multiverse (`mv1`, `mv2`, `mv3`, `mv4`)**
4. **Realm 3D (`3d1` .. `3d10`)**
5. **Realm 2D & Animation (`2d1`, `2d2`, `anim1`)**

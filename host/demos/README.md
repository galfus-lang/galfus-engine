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

`ui1` demonstrates the named `display` family and a `monospace` family using
JetBrains Mono with Noto Sans as an explicit fallback. JetBrains Mono is included
only in the demos package; its SIL Open Font License is in
`src/assets/fonts/LICENSE-JetBrainsMono.txt`.

The `ui3` demo shows the core-backed `@galfus/ui` button, button group, app
bar, and toolbar. Use Tab and Shift+Tab to move focus, and Enter, Space, or the
pointer to activate buttons. `ui4` demonstrates nested popovers and tooltips;
press Escape to close the top layer or exit when no layer is open. `ui5` exercises editable text and IME composition. `ui6` demonstrates selection and numeric controls. `ui7` demonstrates menus, dialogs and progress indicators; Escape closes the top layer or exits. `ui8` combines draggable split panels, menus, a dialog, editable fields and value controls with an interactive, animated Realm 3D. Select objects in the viewport, hierarchy or selector; edit their names and scale, and pause the animation. File actions are illustrative.

1. **Host & Interaction (`tutorial`, `interaction`, `trans-realm`)**
2. **User Interface (`ui1` .. `ui8`)**
3. **Physics & Anchors (`anchor1`, `phys3d1` .. `phys3d4`, `phys2d1` .. `phys2d4`)**
4. **Multiverse (`mv1`, `mv2`, `mv3`, `mv4`)**
5. **Realm 3D (`3d1` .. `3d11`)**
6. **Realm 2D & Animation (`2d1`, `2d2`, `anim1`, `anim2`)**

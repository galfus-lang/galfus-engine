---
name: galfus-realm-2d-helpers
description: >-
  Use this skill to build user interfaces (UI) and HUDs using @galfus/ui, including buttons,
  panels, dialogs, flex layouts, text fields, and interactive pointer surfaces in 2D realms.
---

# Galfus 2D Helpers & UI System (@galfus/ui)

`@galfus/ui` is the native immediate/retained hybrid UI toolkit for Galfus Engine. It renders high-performance HUDs, game menus, buttons, overlays, and modal dialogs directly inside a `Realm2D` layer.

## 1. Installation

```bash
bun add @galfus/ui
# or
npm install @galfus/ui
```

## 2. Setting Up a UI Surface

A UI system binds to a `Realm2D` instance and a presentation target (window or canvas):

```typescript
import { createRuntime } from '@galfus/engine';
import { createUi, UiButton, UiButtonGroup, UiText } from '@galfus/ui';

const runtime = createRuntime(transport);
const realm2d = runtime.createRealm2D();

const windowId = runtime.platform.window.create({ title: 'Game UI', size: [1280, 720] });
const targetId = runtime.multiverse.createTarget({ kind: { type: 'window', windowId } });

// Create UI system
const ui = createUi(runtime, realm2d, targetId);
const root = ui.root; // Root panel
```

## 3. Buttons & Interactive Controls

Create buttons with hover states, click/activate handlers, and custom variants:

```typescript
// Standard button
const playBtn = new UiButton(root, {
  label: 'Start Game',
  onActivate: () => {
    console.log('Game starting...');
  }
});

// Button group (horizontal or vertical layout)
const group = new UiButtonGroup(root, {
  orientation: 'horizontal',
  spacing: 12
});

const settingsBtn = new UiButton(group.panel, {
  label: 'Settings',
  onActivate: () => openSettings()
});

const exitBtn = new UiButton(group.panel, {
  label: 'Quit',
  onActivate: () => runtime.stop()
});
```

## 4. Text & Labels

Render crisp vector and bitmap text with font family styling:

```typescript
const titleLabel = new UiText({
  text: 'GALFUS ADVENTURE',
  fontSize: 24,
  color: [1.0, 0.9, 0.2, 1.0], // Yellow gold
  x: 20,
  y: 20
});

root.addText(titleLabel);

// Dynamic update in tick loop
titleLabel.setText(`Score: ${currentScore}`);
```

## 5. Panels & Window Overlays

Panels provide backgrounds, borders, 9-slice styling, and nested layout containers:

```typescript
import { Panel, UiDialog } from '@galfus/ui';

// HUD Container Panel (top-right corner)
const hudPanel = new Panel(root, {
  width: 200,
  height: 80,
  backgroundColor: [0.1, 0.12, 0.18, 0.85], // Semi-transparent dark
  borderColor: [0.3, 0.4, 0.6, 1.0],
  borderWidth: 2,
  borderRadius: 6
});

// Modal Dialog
const dialog = new UiDialog(ui, {
  title: 'Game Over',
  modal: true
});

new UiButton(dialog.content, {
  label: 'Retry',
  onActivate: () => {
    dialog.close();
    restartLevel();
  }
});
```

## 6. Layout Anchors & Responsiveness

Use anchors to ensure UI elements scale across different resolutions:

```typescript
// Anchor to top-right
hudPanel.setAnchor({
  horizontal: 'right',
  vertical: 'top',
  offsetX: -20,
  offsetY: 20
});

// Center in screen
dialog.setAnchor({
  horizontal: 'center',
  vertical: 'center'
});
```

## Best Practices

1. **Z-Index Layering**: Render 3D/2D game realms at lower Z-indices (`zIndex: 0`) and the UI invocation at higher Z-indices (`zIndex: 10`) so UI always floats above gameplay.
2. **Pointer Focus**: `@galfus/ui` automatically consumes pointer and keyboard events when hovering over UI controls, preventing clicks from leaking to game objects.
3. **Clean Up**: When closing views or menus, call `.destroy()` or `.close()` on panels and dialogs to free ECS components.

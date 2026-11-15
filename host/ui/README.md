# @galfus/ui

Native UI, focus management, and Unicode text editing for Galfus Engine.

```typescript
import { createUi } from '@galfus/ui';

const ui = createUi(runtime);
const input = ui.textInput(realm.realmId, {
  entityId: fieldEntityId,
  value: 'Ada',
  onRender: (value) => textNode.setText(value)
});
```

## Compatibility and ownership

For a `SpritePanel` created through `NativeUiModel`, call
`sprite.setSpriteUvRect([u0, v0, u1, v1])` to queue a UV-only update. The
core rejects the command if the target is not a sprite panel or a coordinate
is not finite. Reversed and out-of-range coordinates remain available for
flipping and texture repetition.

## Shared icon atlas

`ui.icons` lazily loads one built-in sprite sheet per UI system and shares it
across roots and windows. It includes checkbox, radio, switch, select, submenu,
chevron, check, close, menu, more and add icons. The distributable source image
is [ui-icons.png](assets/ui-icons.png); `bun host/ui/scripts/generate-icons.ts`
regenerates it and the identical embedded image used by Bun and browsers.

The atlas exposes independent animation players for its consumers. For example,
when using a native sprite panel:

```typescript
const atlas = ui.icons;
const panel = root.root.addSpritePanel({ textureId: atlas.sheet.textureId });
const icon = atlas.createAnimation('checkbox', 'unchecked', (uv) => panel.setSpriteUvRect(uv));
runtime.on('tick', ({ dt }) => icon.update(dt));
icon.setState('checked');
```

The default icons change immediately. To supply your own image, frames, and
transitions, create a `SpriteSheet` with an application-owned texture and
configure an atlas before creating its consumers:

```typescript
const atlas = new UiIconAtlas(sheet, {
  checkbox: {
    states: { unchecked: 0, checked: 10 },
    transitions: {
      'unchecked|checked': { frames: [3, 4, 5, 6, 7, 8, 9, 10], frameDuration: 0.04 }
    }
  }
});
ui.setIconAtlas(atlas);
```

`setIconAtlas()` restores the default for future consumers. Existing players
retain their atlas, so keep a custom texture alive for as long as it is used.
The UI system never disposes a custom texture. It disposes its default texture
when the UI system is reset or disposed; stop updating players when their
targets or atlas are no longer valid. Reset also clears the custom selection.
Checkboxes, radios, switches, select indicators, and submenu indicators use
sprite panels. Their animations advance with the runtime tick. Controls retain
their atlas when `setIconAtlas` changes the default, and a partial custom atlas
falls back to the built-in atlas for icons it does not define. An `iconAtlas`
option also selects an atlas for an individual checkbox, radio, radio group,
switch, select, or menu. Custom definitions must provide the states used by
each control: `unchecked`/`checked`, `off`/`on`, `closed`/`open` for select,
and `closed` for submenu. Pointer input on an icon is routed to its owning
control. When a root has uncommitted changes its icon animations wait for the
next successful flush, so animation cannot commit unrelated staged changes.

The existing `UiRoot`, `NativeUiModel`, `TextInput`, layout helpers and their
entry points remain available. The new component API is additive; applications
can migrate individual trees to `createComponentRoot` without replacing their
other UI trees. Use component handles exclusively for trees owned by a
`ComponentRoot`.

Create **one `UiSystem` per runtime** and share it between UI roots and windows.
Focus and keyboard capture are window-wide; independent systems would compete
for input. Creating a second system now throws an error. Move each module's
`createUi(runtime)` call to the application composition root, pass the shared
system to those modules, and call `dispose()` after its last consumer. `reset()`
clears its roots but retains ownership; `dispose()` releases it for replacement.
Resetting the runtime clears UI resources while retaining the system; disposing
the runtime also disposes its UI system.

Accessibility semantics and assistive-technology integration are deferred to a
separate future initiative.

## Core-backed component foundation

`createComponentRoot` creates a staged component tree backed by a core-owned
`Model2DUI`. The caller owns the root and commits a batch explicitly with
`flush()`. Text is a visual leaf; subscribe to pointer events on panels.
Component handles have stable object identity; their numeric element IDs are
local to the root and are separate from the root's `entityId` and `uiId`.
Changes made through component handles remain staged until `flush()` succeeds.
The component root owns its ModelUI tree; mutate that tree through its
component handles rather than issuing separate commands against its handle.

```typescript
const ui = createUi(runtime);
const context = ui.createComponentRoot(realm, { width: 320, height: 120 });
const panel = context.root.addPanel({ backgroundColor: [0.1, 0.2, 0.3, 1] });
const label = panel.addText('Hello', 18);
context.flush();
label.setText('Updated');
context.flush();
panel.remove();
context.flush();
context.dispose();
```

`syncState` reports `pending`, `synced`, `failed`, or `disposed`. A failed
atomic batch leaves its changes staged and `lastError` available; retry with
`flush()` or call `discardChanges()` to restore the last successfully committed
component tree. A root must be committed once before changes can be discarded.
Changes are acknowledged by the core on successful `flush()`, while computed
layout is available after a frame has been presented. Panel event listeners can
be unsubscribed with the function returned by `on()`. Closing the optional
`windowId`, disposing the realm or runtime, or explicitly disposing the root
releases its listeners and resources. A realm shared by multiple windows can
omit `windowId` and manage the root lifetime explicitly.

See [component-root.ts](examples/component-root.ts) for the complete minimal
mount/update/remove sample.

## Theme and inherited styles

A component root owns an isolated theme. `createUiTheme()` returns the defaults;
`setTheme(overrides)` replaces the current theme with defaults plus overrides,
while `patchTheme(overrides)` merges into the staged theme. Both inputs and
`getTheme()` results are copied. Typography token overrides merge by property;
color, spacing, border, radius, and size token values replace the named value.
A component's `setTokens()` replaces its local token overrides for its subtree;
it does not modify the root theme or sibling subtrees.

```typescript
const context = ui.createComponentRoot(realm, {
  width: 320,
  height: 120,
  theme: {
    tokens: { colors: { surface: [0.1, 0.2, 0.3, 1] } },
    components: {
      panel: {
        variants: { card: { borderRadius: { token: 'radii.medium' } } },
        states: { hover: { opacity: 0.8 } }
      }
    }
  }
});
const card = context.root.addPanel();
card.setVariant('card');
card.setStyle({
  backgroundColor: { token: 'colors.surface' },
  padding: { token: 'spacing.medium' },
  typography: { fontSize: 18 },
  color: { token: 'colors.text' }
});
card.addText('Inherited text');
context.flush();
```

Text color and the typography fields `fontFamily`, `fontSize`, `fontWeight`,
`italic`, and `lineHeight` inherit from parent to child. Text receives the
resolved values; backgrounds, borders, spacing, dimensions, and other layout
properties are local. Inherited values are resolved at the parent: overriding a
token in a child subtree affects token references resolved in that subtree, not
an already inherited value.

For each property, precedence from lowest to highest is component theme base,
inherited text properties, named variant, active theme and local state styles,
`setStyle()`, and explicit ModelUI properties/layout passed to `addPanel()`,
`addText()`, `setProperties()`, or `setLayout()`. `setStyle()` and `setTokens()`
replace their respective local configurations; pass an empty object to clear
them. `setVariant(undefined)` clears the variant. For each active state, the
local state style overrides the theme's state style; later active states win in
this order: `hover`, `focus`, `focusVisible`, `active`, `checked`, `invalid`, `readOnly`,
`disabled`. `setStyleState()` controls additional style matching; panel
interaction also selects states automatically.
`setStateStyle(state, undefined)` clears that component's local state style.

Theme and style updates are staged like other component changes. Unchanged
resolved properties do not emit core commands. `discardChanges()` restores the
last committed theme and component styles as well as the tree. Unknown tokens or
variants throw without changing the staged tree. `resolvedStyle` returns a copy
of the staged ModelUI properties and layout.

## Panel interaction and focus

Panels opt into focus with `setFocusable(tabIndex)`. The default index is zero;
positive indices precede zero, ties retain registration order within a presented
realm, and a negative index allows programmatic or pointer focus but is skipped
by Tab. Tab and Shift+Tab move within the active realm. A focus request succeeds
only after the root's realm is presented in the window. Supply a window ID to
`requestFocus` when the realm is presented in more than one window.

```typescript
const panel = context.root.addPanel().setFocusable(0);
panel.setStateStyle('hover', { opacity: 0.8 });
panel.setStateStyle('focusVisible', { borderWidth: [2, 2, 2, 2] });
panel.onActivate(({ source, windowId }) => console.log(source, windowId));
context.flush();
```

Pointer listeners and `onActivate()` also enable interaction state tracking;
only panels receive events. Activation is emitted on a primary pointer click or
on release of Enter or Space after a matching key press. Losing focus or a
pointer cancellation cancels the corresponding press. Repeated key presses do
not repeat activation. Keyboard navigation or activation sets `focusVisible`;
a primary pointer press clears it, including on an already focused panel.
Programmatic focus does not set `focusVisible`. Losing focus clears both focus
states. IME composition suppresses keyboard navigation and activation.

`getInteractionState(windowId)` returns the state for one window; without an
ID, pointer and focus states are aggregated across windows. The automatic
`hover`, `active`, `focus`, `focusVisible`, `disabled`, `readOnly`, and `invalid`
states combine with explicitly selected `setStyleState` states. `setDisabled`
blocks interaction and focus for the panel and its descendants. Hiding or
removing an ancestor also clears focus. `setReadOnly` and `setInvalid` expose
independent state for component implementations: future value editors must
honor `readOnly` before changing their value. `readOnly` itself does not block
focus or activation, and `invalid` never changes focus.

Interaction changes update the core immediately when the root is synchronized.
If application changes are already pending, interaction styles join that batch
and remain pending until `flush()`. Interaction behavior is immediate and is
not rolled back by `discardChanges()`; styles are reconciled with the current
interaction state after rollback. See [interaction.ts](examples/interaction.ts)
for a minimal interactive sample.

## Buttons and structural controls

`UiButton`, `UiButtonGroup`, `UiAppBar`, and `UiToolbar` compose panels and
text in a `ComponentRoot`. Their constructors take a parent panel and options;
containers also provide `addButton()`, `addButtonGroup()`, and `addToolbar()`.
A button's label is a text leaf; the surrounding panel owns interaction.

```typescript
import { createUi, UiAppBar } from '@galfus/ui';

const ui = createUi(runtime);
const context = ui.createComponentRoot(realm, {
  width: 640,
  height: 360,
  theme: {
    components: {
      appBar: { base: { color: [0.9, 0.95, 1, 1], typography: { fontSize: 16 } } },
      button: {
        variants: { primary: { backgroundColor: [0.1, 0.4, 0.7, 1] } },
        states: { hover: { backgroundColor: [0.2, 0.5, 0.8, 1] } }
      }
    }
  }
});
const bar = new UiAppBar(context.root, { spacing: 12 });
bar.addText('Documents');
const toolbar = bar.addToolbar();
const group = toolbar.addButtonGroup({ orientation: 'horizontal', spacing: 4 });
const save = group.addButton({ label: 'Save', variant: 'primary' });
save.onActivate(({ source }) => console.log(`Save: ${source}`));
group.addButton({ label: 'Delete', disabled: true });
context.flush();

save.setLabel('Save changes');
group.setOrientation('vertical').setSpacing(8);
context.flush();
```

Buttons are focusable by default and use the activation contract documented
above. `setDisabled(true)` on a control prevents interaction with its subtree;
re-enabling a container preserves each child's own disabled state. Buttons
support `setLabel`, `setTabIndex`, `requestFocus`, `blur`, and `onActivate`.
All controls support style, variant, token, visibility, and disabled updates.
Use `panel` to access the underlying panel and `labelNode` to customize button
text. Containers expose their direct panel/text `children`, accept nested
controls, and reorder direct children with `moveChild(control, index)`.
Spacing is a non-negative finite number of logical units. Orientation and
spacing update the container's ModelUI layout.

A control owns its panel subtree. `remove()` and `dispose()` stage removal;
commit with `context.flush()`. Removing a container removes its descendants,
while `discardChanges()` restores a previously committed subtree and its
component handles. Creation, label changes, ordering, styles, and layout use
the same staged commit and rollback behavior as the component root. Input
state and disabling take effect immediately as described above.

Theme keys `button`, `buttonGroup`, `appBar`, and `toolbar` customize these
controls without changing unrelated panels. Resolution applies the panel base,
then the control base, inherited text properties, a control variant (falling
back to a panel variant of the same name), panel and control state styles,
local state styles, instance style, and direct ModelUI properties. Control
state styles override panel state styles for the same property. Controls ship
with a basic button and app bar theme; applications can override their bases,
variants, and states using `setTheme()` or `patchTheme()`.

Run `bun demo ui3` for the interactive showcase or
`bun demo ui3 --headless --frames 2` for an offscreen smoke test.

## Popovers and tooltips

Create an overlay manager for a synchronized component root and an explicit
window. It manages owned layer models in the same realm as the root:

```typescript
const overlays = ui.createOverlayManager(context, windowId);
const trigger = new UiButton(context.root, { label: 'Options' });
context.flush();

const popover = overlays.createPopover({
  anchor: trigger.panel,
  width: 240,
  height: 100,
  placement: 'bottom',
  build: (content) => {
    content.root.addText('Options');
    const action = new UiButton(content.root, { label: 'Apply' });
    action.onActivate(() => popover.close());
    return action.panel; // Focus this panel after presentation.
  },
  onClose: (reason) => console.log(reason)
});
trigger.onActivate(() => popover.toggle());

const tooltip = overlays.createTooltip({
  anchor: trigger.panel,
  text: 'Open the options',
  openDelayMs: 400,
  closeDelayMs: 100
});
```

`open()` creates and synchronizes the content tree; it is displayed after a
successful presentation. `close()` removes the tree synchronously and invokes
`onClose` once. There is no implicit animation. The builder runs on each opening,
so its component handles belong to that opening only. A panel returned from the
builder is focused after it has been presented. Escape closes the topmost layer;
a primary pointer press outside closes applicable layers from top to bottom. A
press on an anchor counts as inside that layer. Escape and programmatic closure
restore the previously focused target when focus is still in the overlay;
outside clicks do not steal the new pointer focus. Dismissal can be disabled
with `closeOnOutside` or `closeOnEscape`.

Close reasons are `programmatic`, `escape`, `outside`, `anchor-removed`,
`content-disposed`, `context-lost`, `window-closed`, `owner-disposed`, and
`parent-closed`. Layers anchored in another open layer become its children;
closing a parent closes its descendants first. Use `dispose()` when a popover,
tooltip, or manager is no longer needed. Anchor removal, window closure, and
owner disposal also clean up their layers.

Placement accepts `top`, `bottom`, `left`, and `right`. A layer flips to the
opposite side if it fits there better, then clamps to the owner root's presented
bounds. `setPlacement()` and `setSize()` update an open popover; anchor layout,
owner layout, and model transform changes are reconciled after presentation.
Sizing is explicit in root-local units. Overlays inherit the anchor's text style
and resolved tokens and follow subsequent synchronized theme changes. Use the
`style` option for layer-specific overrides. The overlay owns its own staged
component root; commit subsequent content mutations through `popover.root.flush()`.
Pending application changes are never implicitly committed by positioning.
The presented root bounds are the default viewport. When an invocation shows
only part of that root, call `overlays.setViewport([x, y, width, height])` in
root-local units whenever that visible area changes; pass no argument to return
to the full root bounds. The manager repositions open layers immediately and
again after the next presentation.

Tooltips open after the configured hover or focus delay and close after the
configured leave/blur delay. Leaving before the opening delay cancels it;
returning before the closing delay cancels closure. Escape closes a tooltip and
suppresses reopening until its anchor loses both hover and focus. A tooltip does
not take focus, and `setText()` updates its content.
If delayed opening fails, the error is available through `lastError` and the
optional `onError` callback; it is not retried until the trigger is left.

A realm and a window can each have at most one overlay manager. Reuse the
window's manager for layers owned by its component root; applications that used
multiple managers on the same window should consolidate those overlays under a
single owner root. Disposing a manager releases its ownership. Since a ModelUI model is shared across a
realm's presentations, opening a layer requires exactly one direct active
presentation of that realm in the selected window. Multiple windows, indirect
texture presentations, and additional offscreen presentations are rejected;
open layers close with `context-lost` if the presentation becomes ambiguous.
Opening also requires the anchor and owner to be synchronized and presented.
This prevents a layer from appearing in an unintended presentation context.

Run `bun demo ui4` for nested popovers and tooltips. In headless mode the demo
shows the static trigger scene because there is no window presentation context.

## Text fields and IME

`UiInputText` and `UiTextArea` are core-backed components with a panel event
target and a visual text leaf. They own their value and UTF-16 selection, use
Unicode grapheme boundaries for editing, and use the core's presented text
geometry for hit testing, caret placement and selection rectangles.

```typescript
import { createUi, UiInputText, UiTextArea } from '@galfus/ui';

const ui = createUi(runtime);
const context = ui.createComponentRoot(realm, { width: 640, height: 360, windowId });
const name = new UiInputText(ui, context.root, {
  value: 'Ada',
  width: 240,
  validate: (value) => value.trim().length > 0,
  validationMode: 'blur',
  onChange: (value) => console.log(value)
});
const notes = new UiTextArea(ui, context.root, {
  value: 'First line\nSecond line',
  width: 400,
  height: 120
});
notes.on('selection', (field) => console.log(field.selection));
context.flush();
```

`value`, `displayValue`, `selection`, and `composition` expose the committed
text, displayed preview, directional anchor/focus selection, and optional IME
preview. Use `setValue`, `setSelection`, `selectAll`, `setSize`, `requestFocus`,
`blur`, and `setTabIndex` to update the field. Selection offsets are UTF-16 code
units and are snapped to grapheme boundaries. `on('change' | 'selection' |
'composition' | 'focus' | 'blur', callback)` returns an unsubscribe function.
`onChange`, `onSelection`, and `onComposition` can also be supplied in options.
Programmatic value changes emit `change` when the value actually changes.

Arrow keys move by grapheme; Ctrl/Command+Left or Right moves by word, and
Ctrl/Command+Backspace or Delete removes a word. Shift extends the selection.
Text areas support vertical navigation and line Home/End; Ctrl/Command+Home or
End moves to the document boundary. Enter adds a newline only in text areas.
Single-line fields remove line breaks from inserted and assigned values. Long
text scrolls to keep the focused caret visible; pointer clicks and drags use
the last presented geometry. Ligature positions supplied or estimated by the
core are used, and ambiguous bidi positions prefer the last visual caret.

Composition preview replaces the current selection visually without changing
`value`. Cancellation or focus loss restores the committed text and selection.
The transport's `textInput` event is the only committed text stream, so
`imeCommit` and key events cannot insert the same text twice. `setReadOnly`
prevents user edits while retaining navigation and selection; programmatic
`setValue` remains available. Disabled fields do not receive focus or input.
`setInvalid` is independent of focus; optional validation can run on `change`,
`blur`, or explicitly through `validate()` with `validationMode: 'manual'`.

On a direct window presentation, the caret rectangle is transformed through
its UI model, camera, and presented viewport into physical window pixels for
the IME candidate area. For an indirect texture/3D presentation or another
ambiguous mapping, provide `mapToWindow(windowId, uiLocalRect)` returning a
physical pixel rectangle. `lastGeometryError` reports geometry or mapping
failures; no guessed candidate position is sent. The field's value and selection
are immediate host state; visual changes join any already pending root batch.
After rollback, the visual text is reconciled with the current editor state.

Run `bun demo ui5` for single-line, multiline, and read-only examples. Escape
first cancels an active IME composition or releases the focused field; press it
again after focus leaves the field to exit. `q` exits while no field has focus.
Noto Sans and Noto Color Emoji are the bundled default fonts. They do not cover every Unicode character;
register additional font groups and include them in the ordered family when needed:

```ts
realm.registerFontGroup('Extra', [fontBytes]);
realm.setFontFamily({ name: 'default', groups: ['Noto Sans', 'Extra', 'Noto Color Emoji'] });
```

Families are local to each realm. Use `fontFamily` on Text or RichText to select
another configured label. `loadFontData()` alone does not add a font to a family.
Set `axes` on a family or `fontAxes` on an element to configure variable font
axes; element values override family values. `fontWeight` and `italic` control
the `wght` and `ital` axes, and `slnt` can be configured separately. Values
are clamped to the supported range of each face.

Use `removeFontFamily(name)` and `removeFontGroup(name)` to release unused
resources. Removal fails while a family is referenced by a UI node or a group
is referenced by a family. The `default` family cannot be removed.

## Selection and value controls

`UiCheckbox`, `UiSwitch`, and `UiRadio` hold boolean values. They accept pointer
clicks and Enter or Space, expose `checked` and `setChecked`, and apply the
`checked` style state. Standalone radios select `true` on activation; use a
`UiRadioGroup` for exclusive choices. `UiSlider` holds a finite number, and
`UiSelect` holds a string option identity or `null`.

```typescript
import { createUi, UiCheckbox, UiRadioGroup, UiSelect, UiSlider, UiSwitch } from '@galfus/ui';

const ui = createUi(runtime);
const context = ui.createComponentRoot(realm, { width: 640, height: 480, windowId });
const notifications = new UiCheckbox(context.root, { label: 'Notifications', value: true });
const autosave = new UiSwitch(context.root, { label: 'Auto-save' });
const quality = new UiRadioGroup(context.root, {
  value: 'medium',
  options: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' }
  ]
});
const volume = new UiSlider(context.root, { min: 0, max: 100, step: 5, value: 40 });
const overlays = ui.createOverlayManager(context, windowId);
const theme = new UiSelect(context.root, overlays, {
  value: 'system',
  options: [
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dark' }
  ]
});
volume.onChange((value) => console.log('Volume:', value));
context.flush();
```

Each `setValue(value)` emits one change event when the normalized value changes;
pass `false` as its second argument to suppress that event. Initial values do
not emit. `onChange(callback)` returns an unsubscribe function. Values are
immediate host state, while their visual changes follow the component root's
staging rules. Rollback reconciles visuals with current host values. `setReadOnly`
prevents user value changes but allows focus and programmatic `setValue`;
`setDisabled` excludes the control from interaction and Tab navigation.
`setInvalid`, styles, variants, tokens, visibility, and focus methods are also
available. Components own their panel subtrees; use `remove` or `dispose` and
commit the root to release them.

A radio group's option values are unique strings. Its initial value must name an
enabled option or be `null`. Arrow keys move focus and selection between enabled
members, wrapping at the ends; in a read-only group, arrows move focus without
changing selection. `addRadio`, `getRadio`, and `removeRadio` manage members.
Disabling or removing the selected member clears the group value and emits one
change; disabling the entire group preserves its selection. The group retains
its host value across a staged tree rollback.

Slider bounds must be finite with `min < max` and a representable positive
`step`. Values are clamped and rounded to the nearest step from `min`, with
`max` also reachable even when the range is not divisible by the step. Dragging
updates the value as it crosses steps; each distinct value emits once. Arrows
change one step, Page Up/Down changes up to ten steps, and Home/End select the
bounds. Scrolling over the track or thumb changes one step per wheel event:
up (or right on a horizontal wheel) increases the value, down decreases it. Both orientations are supported; in vertical orientation the value
increases upward. `setBounds`, `setOrientation`, and `setSize` update the control.

Select options have unique string `value` identities, display `label`s, and an
optional `disabled` flag. `setOptions` closes an open list and clears the
selection if its value no longer names an enabled option. `open`, `close`, and
`toggle` control the popover. The list skips disabled options and supports arrow
keys, Home/End, Enter, Space, Escape, and outside clicks. Long lists are paged;
previous and next buttons also support pointer and keyboard interaction. A
read-only select can be opened and navigated but cannot change its value. The
select uses an overlay manager and therefore shares its direct-window and
presentation-context restrictions.

Use the `checkbox`, `radio`, `radioGroup`, `switch`, `slider`, and `select`
theme keys for base styles, variants, and state overrides. Run `bun demo ui6`
for the interactive showcase; in headless mode it displays the non-overlay
controls without opening a window-only select.

## Menus, dialogs, and progress

`UiMenu` presents actions anchored to a panel owned by an overlay manager.
Items have unique string IDs, labels, optional `disabled` flags, and optional
`children` for nested menus. Arrow keys, Home/End, Enter, and Space navigate and
activate items; disabled items are skipped. Hovering an item with children opens
its submenu. Large menus are paged. Selection
reports the full item path, closes the menu hierarchy, and restores focus to
the anchor. `onClose` reports `selection` or the overlay close reason.
`setItems` closes the menu before replacing its items.

`UiDialog` presents a modal backdrop and content in the manager's window.
Provide an anchor, dimensions, and a `build` callback; return a content panel
for initial focus, or omit it to focus the dialog content. Only the top dialog
and overlays owned by its content can receive pointer events and focus. Tab is
contained in that scope, including while a new layer awaits presentation.
Escape and backdrop clicks close the dialog by default; set `closeOnEscape` or
`closeOnOutside` to `false` to disable either policy. On close, the previous
focus is restored if it remains eligible, otherwise the anchor is tried. Closing
an owner also closes its nested layers. Window closure or context loss does not
attempt to restore focus.

`UiProgressBar` is a non-interactive indicator. Its finite range defaults to
`0..100` and must satisfy `min < max`; finite values are clamped to that range.
Use `null` for an animated indeterminate indicator. `setValue`, `setBounds`, and
`setSize` update it; `onChange` observes distinct value changes, including a
clamp caused by changing bounds. Style the track with the `progressBar` theme
key and its fill with `progressFill` or `fillStyle`.

```typescript
const overlays = ui.createOverlayManager(context, windowId);
const menu = new UiMenu(overlays, {
  anchor: menuButton.panel,
  items: [
    { id: 'save', label: 'Save' },
    { id: 'disabled', label: 'Unavailable', disabled: true }
  ],
  onSelect: ({ path }) => console.log(path)
});
const dialog = new UiDialog(overlays, {
  anchor: dialogButton.panel,
  width: 360,
  height: 200,
  build: (content) =>
    new UiButton(content, { label: 'Close', onActivate: () => dialog.close() }).panel
});
const progress = new UiProgressBar(ui, context.root, { value: 25, max: 100 });
menuButton.onActivate(() => menu.open());
dialogButton.onActivate(() => dialog.open());
context.flush();
```

Run `bun demo ui7` for menus, a dialog with an owned menu, and both progress modes.

## Integrated application

Run `bun demo ui8` for a combined application with inherited typography and
variant styles, pointer and keyboard focus, text editing and IME, selection
controls, progress, menu, popover, tooltip and dialog. Move focus out of text
fields and press `q` to exit, so typing `q` does not close the demo.
The overlay controls require an unambiguous direct window presentation.

See [VALIDATION.md](VALIDATION.md) for the consolidation checks and the outstanding native OS IME session.

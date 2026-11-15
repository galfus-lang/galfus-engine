# UI consolidation validation

The integrated application is `bun demo ui8`. It exercises component themes,
inheritance, pointer and keyboard focus, text/IME, form values and overlays.
`bun demo ui5` provides a focused text/IME exercise. Escape cancels composition
or removes field focus; press it again to exit. `q` also exits when no field is focused.

The legacy root, native model, text input and layout APIs remain available.
Use one shared `UiSystem` per runtime and one overlay manager per realm and per
window; see the package README for migration and presentation constraints.
Accessibility semantics and assistive-technology integration are deferred.

Validation performed during consolidation:

- `bun test host`: 379 passed, 12 skipped by default (11 optional physics tests
  and one native-window test). The UI window test was run separately below.
- `GALFUS_UI_WINDOW_TEST=1 bun test host/ui/test/overlay_window.test.ts`:
  passed with a native window, including core picking, editing, candidate-area
  updates, form controls and the integrated demo. One earlier concurrent run
  failed to observe a candidate-area update; an isolated rerun passed.
- `cargo test -p galfus-realm-2d ui`: 56 passed, including pointer picking of
  panels beneath simple and rich text.
- `cargo test -p galfus-platform ime_tests`: 2 passed.
- `GALFUS_BROWSER_TEST_HEADLESS=true bun scripts/test-browser.ts`: passed the
  Chromium/WASM SDK and composition tests, including preview, cancellation,
  replacement and exactly-once commit.
- `bun run build:napi && bun run test:binds`: all 8 binding checks passed,
  covering Bun FFI, Node, Python, LuaJIT, C, C# and animation.
- `bunx tsc --noEmit`, `bun format`, and `bun validate` passed.

## Outstanding native IME validation

No `ibus`, `fcitx`, or `fcitx5` executable or active input-method service was
available in this environment, and `XMODIFIERS`, `GTK_IM_MODULE`, and
`QT_IM_MODULE` were unset. The native-window test and Chromium composition test
do not replace a manual OS IME session.

On a desktop with an input method configured, run `bun demo ui5`; in both the
single-line and multiline fields, select existing text, begin composition and
verify the preview and candidate window, move or scroll the caret, cancel once
with Escape, then compose and commit once. Check selection replacement,
candidate placement, and that committed text appears exactly once. Record the
platform, input method, and result when this is performed.

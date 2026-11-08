# @galfus/ui

SVG-based UI, focus management, and Unicode text editing system for **Galfus Engine**.

## Quick Start

```typescript
import { createRuntime } from '@galfus/engine';
import { createUi } from '@galfus/ui';

const runtime = createRuntime(transport);
const ui = createUi(runtime);

const focusable = ui.focusable(realm.realmId, {
  type: 'svg',
  svgId: svg.svgId,
  elementId: 'button-hit'
});

const input = ui.textInput(realm.realmId, {
  svgId: svg.svgId,
  elementId: 'name-text',
  hitAreaId: 'name-hit',
  value: 'Ada'
});
```

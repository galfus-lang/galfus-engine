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

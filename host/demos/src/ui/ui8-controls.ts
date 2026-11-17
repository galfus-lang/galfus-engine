import {
  UiButton,
  UiCheckbox,
  UiDialog,
  UiInputText,
  UiMenu,
  type UiOverlayManager,
  type UiPanelComponent,
  UiProgressBar,
  UiSelect,
  UiSlider,
  UiSwitch,
  type UiSystem,
  UiTextArea
} from '@galfus/ui';

const exact = (value: number) => ({ type: 'exact' as const, value });
const full = { type: 'percent' as const, value: 100 };
type ObjectName = 'Cube' | 'Sphere' | 'Blue cube';

/** Editor controls exercise the component tree, focus, overlays and value updates. */
export function createEditorControls(options: {
  ui: UiSystem;
  manager?: UiOverlayManager;
  header: UiPanelComponent;
  toolbar: UiPanelComponent;
  hierarchy: UiPanelComponent;
  inspector: UiPanelComponent;
  assets: UiPanelComponent;
  selectObject: (name: ObjectName) => void;
  setScale: (value: number) => void;
  rename: (value: string) => void;
  setPlaying: (value: boolean) => void;
  setStatus: (message: string) => void;
}) {
  const { ui, manager, header, toolbar, hierarchy, inspector, assets, setStatus } = options;
  const compact = { padding: [3, 7, 3, 7] as [number, number, number, number], minHeight: 28 };
  const fileButton = new UiButton(header, { label: 'File', layout: compact });
  const dialogButton = new UiButton(header, { label: 'About', layout: compact });
  const menu =
    manager &&
    new UiMenu(manager, {
      anchor: fileButton.panel,
      width: 170,
      items: [
        { id: 'new', label: 'New scene' },
        { id: 'save', label: 'Save scene' },
        {
          id: 'export',
          label: 'Export',
          children: [
            { id: 'json', label: 'JSON' },
            { id: 'binary', label: 'Binary' }
          ]
        }
      ],
      onSelect: ({ path }) => setStatus(`Menu   •   ${path.join(' / ')} (demo)`)
    });
  fileButton.onActivate(() => menu?.toggle());
  const dialog =
    manager &&
    new UiDialog(manager, {
      anchor: dialogButton.panel,
      width: 330,
      height: 160,
      build: (content) => {
        content.addText('Galfus editor demo', 18);
        content.addText('A playground for UI components and a live 3D realm.', 12);
        return new UiButton(content, { label: 'Close', onActivate: () => dialog?.close() }).panel;
      }
    });
  dialogButton.onActivate(() => dialog?.open());
  const play = new UiSwitch(toolbar, {
    label: 'Animate',
    value: true,
    layout: compact,
    onChange: (value) => {
      options.setPlaying(value);
      setStatus(value ? 'Animation playing' : 'Animation paused');
    }
  });
  const reset = new UiButton(toolbar, { label: 'Reset scale', layout: compact });
  hierarchy.addText('SCENE OBJECTS', 11);
  const objectButtons = (['Cube', 'Sphere', 'Blue cube'] as const).map(
    (name) =>
      new UiButton(hierarchy, {
        label: name,
        layout: { ...compact, width: full, justifyContent: 'start' },
        onActivate: () => options.selectObject(name)
      })
  );
  let selected: ObjectName = 'Cube';
  let updatingSelection = false;
  inspector.addText('INSPECTOR', 12);
  inspector.addText('Object name', 11);
  const name = new UiInputText(ui, inspector, {
    value: 'Cube',
    width: 170,
    height: 32,
    onChange: (value) => {
      if (updatingSelection) return;
      options.rename(value);
      const index = (['Cube', 'Sphere', 'Blue cube'] as const).indexOf(selected);
      objectButtons[index]!.setLabel(value || '(unnamed)');
      select?.setOptions(
        select.options.map((item) =>
          item.value === selected ? { ...item, label: value || '(unnamed)' } : item
        )
      );
      setStatus(`Name   •   ${value}`);
    }
  });
  inspector.addText('Object', 11);
  const select =
    manager &&
    new UiSelect(inspector, manager, {
      width: 170,
      value: 'Cube',
      pageSize: 3,
      options: [
        { value: 'Cube', label: 'Cube' },
        { value: 'Sphere', label: 'Sphere' },
        { value: 'Blue cube', label: 'Blue cube' }
      ],
      onChange: (value) => {
        if (value === 'Cube' || value === 'Sphere' || value === 'Blue cube')
          options.selectObject(value);
      }
    });
  if (!select) inspector.addText('Selection available in window', 11);
  inspector.addText('Scale', 11);
  const slider = new UiSlider(inspector, {
    min: 50,
    max: 200,
    step: 5,
    value: 100,
    width: 170,
    height: 30,
    onChange: (value) => {
      options.setScale(value / 100);
      setStatus(`Scale   •   ${value}%`);
    }
  });
  const progress = new UiProgressBar(ui, inspector, {
    min: 50,
    max: 200,
    value: 100,
    width: 170,
    height: 10
  });
  slider.onChange((value) => progress.setValue(value));
  reset.onActivate(() => slider.setValue(100));
  const checkbox = new UiCheckbox(inspector, {
    label: 'Lock scale',
    value: false,
    layout: compact,
    onChange: (value) => {
      slider.setDisabled(value);
      reset.setDisabled(value);
      setStatus(`Scale   •   ${value ? 'locked' : 'unlocked'}`);
    }
  });
  const notes = new UiTextArea(ui, assets, {
    value: 'Scene notes\nEdit this text to test IME.',
    width: 230,
    height: 64
  });
  notes.on('change', () => setStatus(`Scene notes   •   ${notes.value.length} characters`));
  const updateSelection = (value: ObjectName, displayName: string) => {
    selected = value;
    updatingSelection = true;
    try {
      name.setValue(displayName);
    } finally {
      updatingSelection = false;
    }
    select?.setValue(value, false);
    slider.setValue(100, false);
    progress.setValue(100);
  };
  return {
    fileButton,
    dialogButton,
    menu,
    dialog,
    play,
    reset,
    objectButtons,
    name,
    select,
    slider,
    progress,
    checkbox,
    notes,
    updateSelection
  };
}

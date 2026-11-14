import type { DescSpec, FunctionSpec } from './types';

export const realm2dUiDescriptors: DescSpec[] = [
  {
    kind: 'object',
    name: 'RichTextStyleDesc',
    fields: {
      fontSize: { type: 'number', optional: true },
      fontWeight: { type: 'number', optional: true },
      italic: { type: 'boolean', optional: true },
      underline: { type: 'boolean', optional: true },
      strikethrough: { type: 'boolean', optional: true },
      color: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'RichTextSpanDesc',
    fields: {
      text: { type: 'string' },
      style: { type: { ref: 'RichTextStyleDesc' }, optional: true }
    }
  },
  {
    kind: 'union',
    name: 'UiDimensionDesc',
    variants: [
      { inline: { type: { type: { literal: 'auto' } } } },
      { inline: { type: { type: { literal: 'exact' } }, value: { type: 'number' } } },
      { inline: { type: { type: { literal: 'percent' } }, value: { type: 'number' } } }
    ]
  },
  {
    kind: 'union',
    name: 'UiGridTrackDesc',
    variants: [
      { inline: { type: { type: { literal: 'auto' } } } },
      {
        inline: {
          type: { type: { enum: ['exact', 'percent', 'fraction'] } },
          value: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'UiLayoutStyleDesc',
    fields: {
      width: { type: { ref: 'UiDimensionDesc' }, optional: true },
      height: { type: { ref: 'UiDimensionDesc' }, optional: true },
      minWidth: { type: 'number', optional: true },
      maxWidth: { type: 'number', optional: true },
      minHeight: { type: 'number', optional: true },
      maxHeight: { type: 'number', optional: true },
      padding: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      gap: { type: { tuple: ['number', 'number'] }, optional: true },
      direction: { type: { enum: ['row', 'column'] }, optional: true },
      alignItems: { type: { enum: ['start', 'center', 'end', 'stretch'] }, optional: true },
      justifyContent: {
        type: { enum: ['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly'] },
        optional: true
      },
      flexGrow: { type: 'number', optional: true },
      flexShrink: { type: 'number', optional: true },
      isStack: { type: 'boolean', optional: true },
      gridColumns: { type: { array: { ref: 'UiGridTrackDesc' } }, optional: true },
      gridRowHeight: { type: 'number', optional: true },
      positionOffset: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'UiNodeKindDesc',
    doc: 'Typed UI node properties; text nodes do not receive pointer events.',
    fields: {
      type: { type: { enum: ['panel', 'spritePanel', 'scrollPanel', 'text', 'richText'] } },
      backgroundColor: {
        type: { tuple: ['number', 'number', 'number', 'number'] },
        optional: true
      },
      opacity: { type: 'number', optional: true },
      borderColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      borderColors: {
        type: { array: { tuple: ['number', 'number', 'number', 'number'] } },
        optional: true
      },
      borderWidth: { type: { array: 'number' }, optional: true },
      borderRadius: { type: { array: 'number' }, optional: true },
      clip: { type: 'boolean', optional: true },
      textureId: { type: 'number', optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      samplerIndex: { type: 'number', optional: true },
      tintColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      sliceBorder: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      imageMode: { type: { enum: ['stretch', 'contain', 'cover', 'nineSlice'] }, optional: true },
      scrollOffset: { type: { tuple: ['number', 'number'] }, optional: true },
      scrollXEnabled: { type: 'boolean', optional: true },
      scrollYEnabled: { type: 'boolean', optional: true },
      text: { type: 'string', optional: true },
      spans: { type: { array: { ref: 'RichTextSpanDesc' } }, optional: true },
      fontSize: { type: 'number', optional: true },
      fontWeight: { type: 'number', optional: true },
      italic: { type: 'boolean', optional: true },
      lineHeight: { type: 'number', optional: true },
      fontFamily: { type: 'string', optional: true },
      color: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      wrap: { type: { enum: ['noWrap', 'wordWrap'] }, optional: true },
      align: { type: { enum: ['left', 'center', 'right'] }, optional: true },
      multiline: { type: 'boolean', optional: true }
    }
  },
  {
    kind: 'union',
    name: 'UiCommandDesc',
    variants: [
      {
        inline: {
          type: { type: { literal: 'create' } },
          id: { type: 'number' },
          kind: { type: { ref: 'UiNodeKindDesc' } },
          layout: { type: { ref: 'UiLayoutStyleDesc' }, optional: true }
        }
      },
      { inline: { type: { type: { literal: 'setRoot' } }, id: { type: 'number' } } },
      {
        inline: {
          type: { type: { enum: ['insert', 'detach', 'reorder'] } },
          parentId: { type: 'number' },
          childId: { type: 'number' },
          index: { type: 'number', optional: true }
        }
      },
      { inline: { type: { type: { literal: 'remove' } }, id: { type: 'number' } } },
      {
        inline: {
          type: { type: { literal: 'setKind' } },
          id: { type: 'number' },
          kind: { type: { ref: 'UiNodeKindDesc' } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'setLayout' } },
          id: { type: 'number' },
          layout: { type: { ref: 'UiLayoutStyleDesc' } }
        }
      },
      {
        inline: {
          type: { type: { literal: 'setVisible' } },
          id: { type: 'number' },
          visible: { type: 'boolean' }
        }
      },
      {
        inline: {
          type: { type: { literal: 'setZLayer' } },
          id: { type: 'number' },
          zLayer: { type: 'number' }
        }
      }
    ]
  },
  {
    kind: 'object',
    name: 'UiQuad2DDesc',
    doc: 'Visual quad element of a 2D user interface (panels, borders, images, 9-slices).',
    fields: {
      rect: { type: { tuple: ['number', 'number', 'number', 'number'] } },
      zLayer: { type: 'number', optional: true },
      borderRadius: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      borderWidth: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      backgroundColor: {
        type: { tuple: ['number', 'number', 'number', 'number'] },
        optional: true
      },
      borderColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      textureId: { type: 'number', optional: true },
      uvRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      samplerIndex: { type: 'number', optional: true },
      tintColor: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      clipRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'UiText2DDesc',
    doc: 'Native typography text run element within a 2D user interface.',
    fields: {
      position: { type: { tuple: ['number', 'number'] } },
      zLayer: { type: 'number', optional: true },
      fontSize: { type: 'number' },
      color: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true },
      text: { type: 'string' },
      clipRect: { type: { tuple: ['number', 'number', 'number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'Model2DUIDesc',
    doc: 'Dedicated 2D UI Model holding batches of quads and text runs for hardware-accelerated interfaces.',
    fields: {
      label: { type: 'string', optional: true },
      quads: { type: { array: { ref: 'UiQuad2DDesc' } }, optional: true },
      texts: { type: { array: { ref: 'UiText2DDesc' } }, optional: true }
    }
  }
];

export const realm2dUiFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_2d_get_ui_text_geometry',
    methodName: 'realm2dGetUiTextGeometry',
    doc: 'Returns Text or RichText geometry in UI coordinates as JSON; offsets are UTF-16 code units.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI model.' },
      { name: 'elementId', type: 'u32', doc: 'Logical ID of the text element.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_get_rich_text_geometry',
    methodName: 'realm2dGetRichTextGeometry',
    doc: 'Returns RichText line boxes and shaped clusters in UI coordinates as JSON; offsets are UTF-16 code units.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI model.' },
      { name: 'elementId', type: 'u32', doc: 'Logical ID of the RichText element.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_get_rich_text_clusters',
    methodName: 'realm2dGetRichTextClusters',
    doc: 'Returns visual RichText cluster rectangles in UI coordinates as JSON; offsets are UTF-16 code units.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI model.' },
      { name: 'elementId', type: 'u32', doc: 'Logical ID of the RichText element.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_get_ui_layout',
    methodName: 'realm2dGetUiLayout',
    doc: 'Returns the last computed UI element layout as JSON; fails if no layout is available.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI model.' },
      { name: 'elementId', type: 'u32', doc: 'Logical ID of the UI element.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_apply_ui_commands',
    methodName: 'realm2dApplyUiCommands',
    doc: 'Atomically applies core-owned UI tree mutations.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI model.' },
      { name: 'commands', type: { jsonArray: 'UiCommandDesc' }, doc: 'Ordered UI mutations.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_create_ui',
    methodName: 'realm2dCreateUi',
    doc: 'Creates or updates a 2D UI model with initial quads, texts, and transform.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI entity.' },
      { name: 'desc', type: { json: 'Model2DUIDesc' }, doc: 'UI model definition.' },
      { name: 'transform', type: { json: 'Transform2DDesc' }, doc: 'Initial transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_ui_content',
    methodName: 'realm2dSetUiContent',
    doc: 'Updates the visual content (quads and text batches) of an existing 2D UI model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI entity.' },
      { name: 'desc', type: { json: 'Model2DUIDesc' }, doc: 'Updated UI model definition.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_ui_transform',
    methodName: 'realm2dSetUiTransform',
    doc: 'Updates the spatial transform of an existing 2D UI model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI entity.' },
      { name: 'transform', type: { nativeStruct: 'Transform2D' }, doc: 'New transform.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_get_ui_transform',
    methodName: 'realm2dGetUiTransform',
    doc: 'Reads the transform of an existing 2D UI model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI entity.' },
      {
        name: 'outTransform',
        type: { nativeStruct: 'Transform2D' },
        doc: 'Output transform.',
        out: true
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_destroy_ui',
    methodName: 'realm2dDestroyUi',
    doc: 'Destroys an existing 2D UI model.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'uiId', type: 'u32', doc: 'Logical ID of the UI entity.' }
    ],
    returnType: 'i32'
  }
];

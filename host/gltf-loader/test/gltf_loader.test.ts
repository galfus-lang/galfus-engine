/**
 * Comprehensive test suite for @galfus/gltf-loader and @galfus/model-loader-types.
 */

import { describe, expect, it } from 'bun:test';
import { createRuntime } from '@galfus/engine';
import type { GalfusTransport } from '@galfus/transport-types';
import { loadGltfAsset, parseGltf } from '../src/index';

/**
 * Creates an in-memory mock Galfus transport for testing.
 */
function createMockTransport(): GalfusTransport {
  let nextId = 100;
  const mockEngine = {
    realm3dCreate: () => {},
    realm3dCreateGeometry: () => nextId++,
    realm3dCreateMaterial: () => nextId++,
    realm3dCreateModel: () => nextId++,
    realm3dAttachMesh: () => {},
    realm3dSetModelTransform: () => {},
    realm3dDestroyModel: () => {},
    realm3dDestroyGeometry: () => {},
    realm3dDestroyMaterial: () => {},
    realm3dCreateInstancedModel: () => nextId++,
    realm3dSetInstancedModelData: () => {},
    realm3dDestroyInstancedModel: () => {},
    realm3dUpdateBones: () => {},
    resourcesCreateTexture: () => nextId++,
    resourcesDestroyTexture: () => {},
    multiverseResolve: () => {},
    multiverseDispatch: () => {}
  };

  return {
    engine: mockEngine as any,
    loop: { start: () => {}, stop: () => {}, isRunning: false } as any,
    capabilities: {} as any,
    isReady: true,
    isDisposed: false,
    startLoop: () => {},
    stopLoop: () => {},
    isRunning: false,
    isInitialized: true,
    dispose: () => {}
  } as unknown as GalfusTransport;
}

/**
 * Builds a valid synthetic binary GLB container in memory.
 */
function createSyntheticGlb(jsonObj: any, binaryData?: Uint8Array): Uint8Array {
  const jsonStr = JSON.stringify(jsonObj);
  const jsonEncoder = new TextEncoder();
  const jsonBytes = jsonEncoder.encode(jsonStr);

  // Pad JSON chunk to 4-byte boundary with spaces (0x20)
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLen = jsonBytes.length + jsonPadding;

  // Pad BIN chunk to 4-byte boundary with zeros (0x00)
  const binLen = binaryData ? binaryData.length : 0;
  const binPadding = (4 - (binLen % 4)) % 4;
  const binChunkLen = binLen + binPadding;

  const totalLength = 12 + 8 + jsonChunkLen + (binChunkLen > 0 ? 8 + binChunkLen : 0);
  const out = new Uint8Array(totalLength);
  const dv = new DataView(out.buffer);

  // Header: magic (glTF), version (2), totalLength
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLength, true);

  // Chunk 0: JSON
  dv.setUint32(12, jsonChunkLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPadding; i++) {
    out[20 + jsonBytes.length + i] = 0x20;
  }

  // Chunk 1: BIN
  if (binChunkLen > 0 && binaryData) {
    const binHeaderOffset = 20 + jsonChunkLen;
    dv.setUint32(binHeaderOffset, binChunkLen, true);
    dv.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN\0'
    out.set(binaryData, binHeaderOffset + 8);
    for (let i = 0; i < binPadding; i++) {
      out[binHeaderOffset + 8 + binLen + i] = 0x00;
    }
  }

  return out;
}

describe('@galfus/gltf-loader', () => {
  it('parses binary GLB containers and extracts JSON and BIN chunks accurately', () => {
    const mockJson = {
      asset: { version: '2.0', generator: 'Galfus_Test' },
      nodes: [{ name: 'TestNode' }]
    };
    const mockBin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const glbBytes = createSyntheticGlb(mockJson, mockBin);

    const { gltf, buffers } = parseGltf(glbBytes);
    expect(gltf.asset.version).toBe('2.0');
    expect(gltf.asset.generator).toBe('Galfus_Test');
    expect(gltf.nodes?.length).toBe(1);
    expect(gltf.nodes?.[0]?.name).toBe('TestNode');
    expect(buffers.length).toBe(1);
    expect(buffers[0]?.subarray(0, 8)).toEqual(mockBin);
  });

  it('loads a glTF model into GltfAssetFactory and instantiates ECS entities with hierarchy', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    // Build raw triangle mesh: 3 vertices with [x, y, z] positions
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);

    const binBuffer = new Uint8Array(positions.byteLength + indices.byteLength);
    binBuffer.set(new Uint8Array(positions.buffer), 0);
    binBuffer.set(new Uint8Array(indices.buffer), positions.byteLength);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'TestFactory' },
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: 'SCALAR' }
      ],
      materials: [
        {
          name: 'RedMaterial',
          pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0.5 }
        }
      ],
      meshes: [
        {
          name: 'TriangleMesh',
          primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }]
        }
      ],
      nodes: [
        { name: 'ParentNode', children: [1], translation: [0, 5, 0] },
        { name: 'ChildNode', mesh: 0, translation: [2, 0, 0], extras: { role: 'player' } }
      ],
      scenes: [{ nodes: [0] }],
      scene: 0
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const factory = await loadGltfAsset(realm, glbBytes);

    // 1. Verify Factory Uploads
    expect(factory.assetName).toBe('TestFactory');
    expect(factory.createdGeometryIds.length).toBe(1);
    expect(factory.createdMaterialIds.length).toBe(1);

    // 2. Instantiate First Copy
    const instanceA = factory.instantiate({ transform: { position: [10, 0, 0] } });
    expect(instanceA.instanceId).toBe(1);
    expect(instanceA.entities.length).toBe(3); // Root, ParentNode, ChildNode

    // 3. Name and Metadata lookups
    const childId = instanceA.getEntityByName('ChildNode');
    expect(childId).toBeDefined();
    expect(realm.getEntityName(childId!)).toBe('ChildNode');

    const matchedEntities = instanceA.getEntitiesByMetadata('role', 'player');
    expect(matchedEntities).toContain(childId!);

    // 4. Instantiate Second Copy (shares same GPU assets)
    const instanceB = factory.instantiate({ transform: { position: [20, 0, 0] } });
    expect(instanceB.instanceId).toBe(2);

    // 5. Cleanup instance A: entities destroyed, factory GPU assets retained
    instanceA.dispose();
    expect(instanceA.isDisposed).toBe(true);
    expect(instanceA.getEntityByName('ChildNode')).toBeUndefined();

    // 6. Cleanup factory: destroys instance B and frees GPU assets
    factory.dispose();
    expect(factory.isDisposed).toBe(true);
    expect(instanceB.isDisposed).toBe(true);
  });

  it('supports modular sub-factories for asset kit pieces with shared VRAM', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const binBuffer = new Uint8Array(positions.buffer);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'DungeonKit' },
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binBuffer.byteLength }],
      accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [
        { name: 'Wall_Piece', mesh: 0 },
        { name: 'Door_Piece', mesh: 0 }
      ],
      scenes: [{ nodes: [0, 1] }]
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const kitFactory = await loadGltfAsset(realm, glbBytes);

    // Create sub-factory specifically for the wall piece
    const wallSubFactory = kitFactory.createSubFactory('Wall_Piece');
    expect(wallSubFactory.name).toContain('Wall_Piece');

    const wall1 = wallSubFactory.instantiate({ transform: { position: [0, 0, 0] } });
    const wall2 = wallSubFactory.instantiate({ transform: { position: [2, 0, 0] } });

    expect(wall1.getEntityByName('Wall_Piece')).toBeDefined();
    expect(wall2.getEntityByName('Wall_Piece')).toBeDefined();

    // Destroy only the walls
    wallSubFactory.disposeAllInstances();
    expect(wall1.isDisposed).toBe(true);
    expect(wall2.isDisposed).toBe(true);

    // Kit factory remains alive until explicitly disposed
    expect(kitFactory.isDisposed).toBe(false);
    kitFactory.dispose();
    expect(kitFactory.isDisposed).toBe(true);
  });

  it('compiles glTF keyframe animations and binds AnimationPlayer3D to instance root', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const timestamps = new Float32Array([0.0, 1.0, 2.0]);
    const translations = new Float32Array([0, 0, 0, 0, 10, 0, 0, 0, 0]);

    const totalByteLen = positions.byteLength + timestamps.byteLength + translations.byteLength;
    const binBuffer = new Uint8Array(totalByteLen);
    binBuffer.set(new Uint8Array(positions.buffer), 0);
    binBuffer.set(new Uint8Array(timestamps.buffer), positions.byteLength);
    binBuffer.set(
      new Uint8Array(translations.buffer),
      positions.byteLength + timestamps.byteLength
    );

    const gltfDoc = {
      asset: { version: '2.0', generator: 'AnimTest' },
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: timestamps.byteLength },
        {
          buffer: 0,
          byteOffset: positions.byteLength + timestamps.byteLength,
          byteLength: translations.byteLength
        }
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, byteOffset: 0, componentType: 5126, count: 3, type: 'SCALAR' },
        { bufferView: 2, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ name: 'AnimatedTarget', mesh: 0 }],
      animations: [
        {
          name: 'Jump',
          channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
          samplers: [{ input: 1, interpolation: 'LINEAR', output: 2 }]
        }
      ]
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const factory = await loadGltfAsset(realm, glbBytes);
    const instance = factory.instantiate();

    expect(instance.animationPlayer).toBeDefined();
    const player = instance.animationPlayer as any;
    expect(player.clips.has('Jump')).toBe(true);

    const activeState = player.play('Jump', 'repeat');
    expect(activeState).toBeDefined();
    expect(activeState.isPlaying).toBe(true);

    factory.dispose();
  });

  it('handles EXT_mesh_gpu_instancing by creating hardware instanced models', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    // 2 instances with distinct translations
    const instanceTranslations = new Float32Array([10, 0, 0, 20, 0, 0]);

    const totalByteLen = positions.byteLength + instanceTranslations.byteLength;
    const binBuffer = new Uint8Array(totalByteLen);
    binBuffer.set(new Uint8Array(positions.buffer), 0);
    binBuffer.set(new Uint8Array(instanceTranslations.buffer), positions.byteLength);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'InstancingTest' },
      extensionsUsed: ['EXT_mesh_gpu_instancing'],
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: instanceTranslations.byteLength }
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' }
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [
        {
          name: 'InstancedForest',
          mesh: 0,
          extensions: {
            EXT_mesh_gpu_instancing: {
              attributes: {
                TRANSLATION: 1
              }
            }
          }
        }
      ]
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const factory = await loadGltfAsset(realm, glbBytes);
    const instance = factory.instantiate();

    expect(instance.entities.length).toBe(1); // Only root container, instanced meshes live on GPU
    expect(factory.isDisposed).toBe(false);

    factory.dispose();
    expect(factory.isDisposed).toBe(true);
  });

  it('binds skeletal skins to Model3D entities using Skin3DComponent', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const binBuffer = new Uint8Array(positions.buffer);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'SkinTest' },
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binBuffer.byteLength }],
      accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [
        { name: 'CharacterModel', mesh: 0, skin: 0 },
        { name: 'Hips_Bone', children: [2] },
        { name: 'Spine_Bone' }
      ],
      skins: [
        {
          name: 'HumanoidSkin',
          joints: [1, 2]
        }
      ]
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const factory = await loadGltfAsset(realm, glbBytes);
    const instance = factory.instantiate();

    const charEntity = instance.getEntityByName('CharacterModel');
    expect(charEntity).toBeDefined();

    const skinEntities = realm.world.query('Skin3D');
    expect(skinEntities.length).toBe(1);
    const skinComp = realm.world.getComponent(skinEntities[0]!, 'Skin3D');
    expect(skinComp).toBeDefined();
    expect((skinComp as any).modelEntityId).toBe(charEntity!);
    expect((skinComp as any).joints.length).toBe(2);

    factory.dispose();
  });

  it('filters nodes and normalizes node names via ModelImportOptions', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const binBuffer = new Uint8Array(positions.buffer);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'FilterTest' },
      buffers: [{ byteLength: binBuffer.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binBuffer.byteLength }],
      accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ name: 'Prefix_MainHero', mesh: 0 }, { name: 'Editor_HelperCamera' }]
    };

    const glbBytes = createSyntheticGlb(gltfDoc, binBuffer);
    const factory = await loadGltfAsset(realm, glbBytes, {
      filter: (node) => !node.name?.startsWith('Editor_'),
      renameNode: (name) => name.replace('Prefix_', '')
    });

    const instance = factory.instantiate();
    expect(instance.getEntityByName('MainHero')).toBeDefined();
    expect(instance.getEntityByName('Editor_HelperCamera')).toBeUndefined();

    factory.dispose();
  });

  it('sniffs required extensions and throws descriptive error if decoder is missing', async () => {
    const transport = createMockTransport();
    const runtime = createRuntime(transport);
    const realm = runtime.createRealm3D(1);

    const gltfDoc = {
      asset: { version: '2.0', generator: 'DracoRequiredTest' },
      extensionsRequired: ['KHR_draco_mesh_compression'],
      nodes: [{ name: 'DracoNode' }]
    };

    const glbBytes = createSyntheticGlb(gltfDoc);
    expect(loadGltfAsset(realm, glbBytes)).rejects.toThrow('KHR_draco_mesh_compression');
  });
});

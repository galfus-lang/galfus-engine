import { describe, expect, it } from 'bun:test';
import { createAnimationPose, evaluateClip, type Model3DComponent, Realm3D } from '@galfus/engine';
import { PNG } from 'pngjs';
import { readAccessor } from '../src/parser';
import { GltfInstance } from '../src/instance';
import { uploadGltfResources } from '../src/resources';
import type { GlTF } from '../src/types';
import { resolveViewerAlphaMode } from '../../../scripts/gltf-alpha';

describe('glTF regressions', () => {
  it('discards pending morph updates when an instance is disposed before synchronization', () => {
    let morphUpdates = 0;
    const realm = new Realm3D(1);
    realm.bindEngine({
      realm3dCreate: () => {},
      realm3dSetModelMorphWeights: () => {
        morphUpdates++;
      }
    } as any);
    const root = realm.createSpatialNode();
    const model = realm.world.getComponent<Model3DComponent>(root, 'Model3D')!;
    realm.setModelMorphWeights(model.modelId, new Float32Array([1]));
    new GltfInstance({ instanceId: 1, realm, rootEntityId: root, entities: [root] }).dispose();
    realm.sync({ time: 0, dt: 0, frameId: 1 });
    expect(morphUpdates).toBe(0);
  });

  it('applies sparse accessor overrides to an implicit zero base', () => {
    const gltf: GlTF = {
      asset: { version: '2.0' },
      accessors: [
        {
          componentType: 5126,
          count: 2,
          type: 'SCALAR',
          sparse: {
            count: 1,
            indices: { bufferView: 0, componentType: 5121 },
            values: { bufferView: 1 }
          }
        }
      ],
      bufferViews: [
        { buffer: 0, byteLength: 1 },
        { buffer: 1, byteLength: 4 }
      ]
    };
    expect(
      Array.from(
        readAccessor(gltf, [new Uint8Array([1]), new Uint8Array(new Float32Array([7]).buffer)], 0)
      )
    ).toEqual([0, 7]);
  });

  it('samples one cubic morph weight instead of treating tangents as extra weights', () => {
    const pose = createAnimationPose();
    evaluateClip(
      {
        name: 'morph',
        duration: 1,
        tracks: [
          {
            targetEntity: 1,
            path: 'weights',
            interpolation: 'cubicspline',
            timestamps: new Float32Array([0, 1]),
            values: new Float32Array([0, 0.2, 0, 0, 0.8, 0])
          }
        ]
      },
      0,
      pose
    );
    const weights = pose.weights.get(1)!;
    expect(weights.length).toBe(1);
    expect(weights[0]).toBeCloseTo(0.2);
  });

  it('preserves material defaults, alpha mode, and explicit IOR', async () => {
    let material: any;
    const realm = {
      createMaterial: (desc: unknown) => {
        material = desc;
        return { materialId: 1 };
      }
    } as any;
    await uploadGltfResources(
      realm,
      {
        asset: { version: '2.0' },
        materials: [{ alphaMode: 'BLEND', extensions: { KHR_materials_ior: { ior: 2 } } }]
      },
      [],
      {}
    );
    expect(material.metallic).toBe(1);
    expect(material.surfaceType).toBe('transparent');
    expect(material.refractionIndex).toBe(2);
    expect(material.reflectance).toBeCloseTo(2.5 / 3);
  });

  it('allows the viewer to restore cutout depth while preserving explicit transparency', async () => {
    function imageUri(alpha: number): string {
      const image = new PNG({ width: 4, height: 4 });
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i + 3] = alpha;
      }
      return `data:image/png;base64,${PNG.sync.write(image).toString('base64')}`;
    }
    const materials: any[] = [];
    const realm = {
      resources: { loadTexture: () => 1 },
      createMaterial: (desc: unknown) => {
        materials.push(desc);
        return { materialId: materials.length };
      }
    } as any;
    await uploadGltfResources(
      realm,
      {
        asset: { version: '2.0' },
        images: [{ uri: imageUri(255) }, { uri: imageUri(128) }],
        textures: [{ source: 0 }, { source: 1 }],
        materials: [
          {
            name: 'body',
            alphaMode: 'BLEND',
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
          },
          {
            name: 'MatI_Ride_FengHuang_01a',
            alphaMode: 'BLEND',
            pbrMetallicRoughness: { baseColorTexture: { index: 0 } }
          },
          {
            name: 'Boden',
            alphaMode: 'BLEND',
            pbrMetallicRoughness: { baseColorTexture: { index: 1 } }
          },
          { name: 'glass', alphaMode: 'BLEND' },
          {
            name: 'headlights',
            alphaMode: 'BLEND',
            pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.3] }
          }
        ]
      },
      [],
      {},
      undefined,
      resolveViewerAlphaMode
    );
    expect(materials.map((material) => material.surfaceType)).toEqual([
      'masked',
      'masked',
      'transparent',
      'transparent',
      'transparent'
    ]);
    expect(
      resolveViewerAlphaMode({ name: 'smoke', alphaMode: 'BLEND' }, 0, new Uint8Array([1]))
    ).toBe('BLEND');
  });
});

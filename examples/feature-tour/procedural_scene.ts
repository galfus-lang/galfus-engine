import type { RoomMarker } from './types.ts';
import { buildProceduralSkinnedMesh, makePalette } from './procedural_assets.ts';

/**
 * Populates rich procedural 3D scene elements for each room exhibit.
 */
export function buildRoomScene(realmId: number, room: RoomMarker, seed: number, galfus: any): void {
  const baseId = (room.roomIndex + 1) * 1000;
  const [fx, fy, fz] = room.focusPoint;
  const palette = makePalette(room.roomIndex);

  // Common Floor tile per room
  const geomFloor = baseId + 1;
  const matFloor = baseId + 2;
  const modelFloor = baseId + 3;

  galfus.realm3dCreatePlane(realmId, geomFloor, 16.0, 16.0);
  galfus.realm3dCreateMaterial(realmId, matFloor, {
    baseColor: [0.15, 0.17, 0.22, 1.0],
    roughness: 0.7,
    metallic: 0.15
  });
  galfus.realm3dCreateModel(
    realmId,
    modelFloor,
    { geometryId: geomFloor, materialId: matFloor },
    { position: [fx, 0, fz] }
  );

  // Pedestal
  const geomPedestal = baseId + 10;
  const matPedestal = baseId + 11;
  const modelPedestal = baseId + 12;

  galfus.realm3dCreateCylinder(realmId, geomPedestal, 1.8, 0.4, 24);
  galfus.realm3dCreateMaterial(realmId, matPedestal, {
    baseColor: [0.22, 0.25, 0.32, 1.0],
    roughness: 0.3,
    metallic: 0.4
  });
  galfus.realm3dCreateModel(
    realmId,
    modelPedestal,
    { geometryId: geomPedestal, materialId: matPedestal },
    { position: [fx, 0.2, fz] }
  );

  // Room Light (Point light illuminating room exhibit)
  const lightId = baseId + 20;
  galfus.realm3dCreateLight(
    realmId,
    lightId,
    {
      kind: 'point',
      color: palette.primary.slice(0, 3) as [number, number, number],
      intensity: 3.8,
      range: 16.0,
      castShadow: true
    },
    { position: [fx, fy + 2.5, fz + 1.2] }
  );

  // Room-specific feature exhibits
  switch (room.id) {
    case 'entrance': {
      // Golden Cube Monument + Cyan Accent Ring
      const geomCube = baseId + 30;
      const matGold = baseId + 31;
      const modelCube = baseId + 32;

      galfus.realm3dCreateCube(realmId, geomCube, 1.4);
      galfus.realm3dCreateMaterial(realmId, matGold, {
        baseColor: [1.0, 0.82, 0.2, 1.0],
        roughness: 0.15,
        metallic: 0.95,
        emissiveColor: [0.2, 0.15, 0.04, 1.0],
        emissiveIntensity: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        modelCube,
        { geometryId: geomCube, materialId: matGold },
        { position: [fx, 1.5, fz] }
      );

      // Accent Torus Halo
      const geomHalo = baseId + 33;
      const matHalo = baseId + 34;
      const modelHalo = baseId + 35;
      galfus.realm3dCreateTorus(realmId, geomHalo, 1.2, 0.36, 24, 12);
      galfus.realm3dCreateMaterial(realmId, matHalo, {
        baseColor: [0.2, 0.85, 1.0, 1.0],
        roughness: 0.1,
        metallic: 0.8,
        emissiveColor: [0.1, 0.4, 0.6, 1.0],
        emissiveIntensity: 1.2
      });
      galfus.realm3dCreateModel(
        realmId,
        modelHalo,
        { geometryId: geomHalo, materialId: matHalo },
        { position: [fx, 1.5, fz] }
      );
      break;
    }

    case 'geometry': {
      // 5 distinct PBR Primitives: Cube, Sphere, Cylinder, Torus, Plane
      const items = [
        { prim: 'cube', pos: [-2.4, 1.3, 0], color: [0.95, 0.8, 0.2, 1.0], rough: 0.1, metal: 0.9 }, // Gold
        {
          prim: 'sphere',
          pos: [-1.2, 1.3, 0],
          color: [0.9, 0.92, 0.95, 1.0],
          rough: 0.05,
          metal: 1.0
        }, // Chrome
        {
          prim: 'cylinder',
          pos: [0.0, 1.3, 0],
          color: [0.95, 0.15, 0.3, 1.0],
          rough: 0.15,
          metal: 0.2
        }, // Ruby
        { prim: 'torus', pos: [1.2, 1.3, 0], color: [0.2, 0.85, 0.4, 1.0], rough: 0.2, metal: 0.3 }, // Emerald
        { prim: 'sphere', pos: [2.4, 1.3, 0], color: [0.15, 0.6, 1.0, 1.0], rough: 0.7, metal: 0.0 } // Matte Plastic
      ] as const;

      items.forEach((item, idx) => {
        const gid = baseId + 30 + idx * 3;
        const mid = baseId + 31 + idx * 3;
        const modId = baseId + 32 + idx * 3;
        switch (item.prim) {
          case 'cube':
            galfus.realm3dCreateCube(realmId, gid, 0.9);
            break;
          case 'sphere':
            galfus.realm3dCreateSphere(realmId, gid, 0.5, 12, 24);
            break;
          case 'cylinder':
            galfus.realm3dCreateCylinder(realmId, gid, 0.5, 0.9, 24);
            break;
          case 'torus':
            galfus.realm3dCreateTorus(realmId, gid, 0.5, 0.15, 24, 12);
            break;
        }
        galfus.realm3dCreateMaterial(realmId, mid, {
          baseColor: item.color as [number, number, number, number],
          roughness: item.rough,
          metallic: item.metal
        });
        galfus.realm3dCreateModel(
          realmId,
          modId,
          { geometryId: gid, materialId: mid },
          { position: [fx + item.pos[0], item.pos[1], fz + item.pos[2]] }
        );
      });
      break;
    }

    case 'lighting': {
      // Occluder Pillars casting shadows + 3 RGB Dynamic Lights + Glowing Emissive Box
      const p1 = baseId + 40;
      const m1 = baseId + 41;
      galfus.realm3dCreateCylinder(realmId, p1, 0.25, 2.5, 32);
      galfus.realm3dCreateMaterial(realmId, m1, {
        baseColor: [0.35, 0.38, 0.45, 1.0],
        roughness: 0.4,
        metallic: 0.2
      });

      [-1.5, 1.5].forEach((ox, idx) => {
        galfus.realm3dCreateModel(
          realmId,
          baseId + 42 + idx,
          { geometryId: p1, materialId: m1 },
          { position: [fx + ox, 1.25, fz] }
        );
      });

      // Emissive Glowing Box
      const geomBox = baseId + 45;
      const matEmiss = baseId + 46;
      galfus.realm3dCreateCube(realmId, geomBox, 0.8);
      galfus.realm3dCreateMaterial(realmId, matEmiss, {
        baseColor: [1.0, 0.4, 0.1, 1.0],
        emissiveColor: [1.0, 0.5, 0.1, 1.0],
        emissiveIntensity: 4.5,
        roughness: 0.1,
        metallic: 0.0
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 47,
        { geometryId: geomBox, materialId: matEmiss },
        { position: [fx, 1.4, fz] }
      );

      // RGB Point lights
      galfus.realm3dCreateLight(
        realmId,
        baseId + 50,
        { kind: 'point', color: [1.0, 0.2, 0.2], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx - 2.0, 2.0, fz - 1.0] }
      );
      galfus.realm3dCreateLight(
        realmId,
        baseId + 51,
        { kind: 'point', color: [0.2, 1.0, 0.3], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx + 2.0, 2.0, fz - 1.0] }
      );
      galfus.realm3dCreateLight(
        realmId,
        baseId + 52,
        { kind: 'point', color: [0.2, 0.4, 1.0], intensity: 4.0, range: 10.0, castShadow: true },
        { position: [fx, 3.0, fz + 2.0] }
      );
      break;
    }

    case 'particles': {
      // GPU Sparks Fountain + Occluder pillars
      const matPart = baseId + 60;
      galfus.realm3dCreateMaterial(realmId, matPart, {
        surfaceType: 'additive',
        baseColor: [1.0, 0.75, 0.2, 1.0]
      });
      galfus.realm3dCreateParticleEmitter(
        realmId,
        baseId + 61,
        {
          label: 'Tour Spark Fountain',
          materialId: matPart,
          maxParticles: 800,
          spawnRate: 200,
          lifetimeRange: [0.7, 1.5],
          speedRange: [3.8, 6.2],
          direction: [0.0, 1.0, 0.0],
          spreadAngleRad: 0.35,
          gravity: [0.0, -6.5, 0.0],
          sizeRange: [0.05, 0.12]
        },
        { position: [fx, 0.5, fz] }
      );
      break;
    }

    case 'animation': {
      // Kinetic sculptures actively driven by transitions
      const geomCube = baseId + 70;
      const matBounce = baseId + 71;
      const modelBounce = baseId + 72;

      galfus.realm3dCreateCube(realmId, geomCube, 1.0);
      galfus.realm3dCreateMaterial(realmId, matBounce, {
        baseColor: [0.2, 0.7, 1.0, 1.0],
        roughness: 0.2,
        metallic: 0.3
      });
      galfus.realm3dCreateModel(
        realmId,
        modelBounce,
        { geometryId: geomCube, materialId: matBounce },
        { position: [fx - 1.8, 0.6, fz] }
      );

      // Active Transition 1: Vertical Bouncing Cube
      const transBounce = baseId + 80;
      try {
        galfus.animationDestroyTransition(transBounce);
      } catch {}
      galfus.animationCreateTransition(
        transBounce,
        { type: 'transform3D', value: [fx - 1.8, 0.6, fz, 0, 0, 0, 1, 1, 1, 1] },
        { duration: 1.6, delay: 0.1, easing: 'easeOutBounce', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transBounce, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelBounce
      });
      galfus.animationTransitionTo(transBounce, {
        type: 'transform3D',
        value: [fx - 1.8, 3.2, fz, 0, 0.707, 0, 0.707, 1, 1, 1]
      });

      // Model 2: Elastic Pulsing Sphere
      const geomSphere = baseId + 73;
      const matPulse = baseId + 74;
      const modelPulse = baseId + 75;
      galfus.realm3dCreateSphere(realmId, geomSphere, 0.6, 12, 24);
      galfus.realm3dCreateMaterial(realmId, matPulse, {
        baseColor: [1.0, 0.25, 0.45, 1.0],
        roughness: 0.15,
        metallic: 0.7
      });
      galfus.realm3dCreateModel(
        realmId,
        modelPulse,
        { geometryId: geomSphere, materialId: matPulse },
        { position: [fx, 1.4, fz] }
      );

      // Active Transition 2: Pulsing Sphere Scale
      const transPulse = baseId + 81;
      try {
        galfus.animationDestroyTransition(transPulse);
      } catch {}
      galfus.animationCreateTransition(
        transPulse,
        { type: 'transform3D', value: [fx, 1.4, fz, 0, 0, 0, 1, 0.7, 0.7, 0.7] },
        { duration: 1.3, delay: 0.0, easing: 'easeInOutCubic', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transPulse, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelPulse
      });
      galfus.animationTransitionTo(transPulse, {
        type: 'transform3D',
        value: [fx, 1.4, fz, 0, 0, 0, 1, 1.5, 1.5, 1.5]
      });

      // Model 3: Rotating Torus
      const geomTorus = baseId + 76;
      const matTorus = baseId + 77;
      const modelTorus = baseId + 78;
      galfus.realm3dCreateTorus(realmId, geomTorus, 0.7, 0.21, 24, 12);
      galfus.realm3dCreateMaterial(realmId, matTorus, {
        baseColor: [0.3, 0.9, 0.4, 1.0],
        roughness: 0.25,
        metallic: 0.4
      });
      galfus.realm3dCreateModel(
        realmId,
        modelTorus,
        { geometryId: geomTorus, materialId: matTorus },
        { position: [fx + 1.8, 1.4, fz] }
      );

      // Active Transition 3: Smooth Hover Torus
      const transTorus = baseId + 82;
      try {
        galfus.animationDestroyTransition(transTorus);
      } catch {}
      galfus.animationCreateTransition(
        transTorus,
        { type: 'transform3D', value: [fx + 1.8, 0.8, fz, 0, 0, 0, 1, 1, 1, 1] },
        { duration: 1.5, delay: 0.2, easing: 'easeInOutSine', loopMode: 'pingPong' }
      );
      galfus.animationBindTarget(transTorus, {
        kind: 'modelTransform3D',
        realmId,
        modelId: modelTorus
      });
      galfus.animationTransitionTo(transTorus, {
        type: 'transform3D',
        value: [fx + 1.8, 2.4, fz, 0.5, 0.5, 0.5, 0.5, 1, 1, 1]
      });
      break;
    }

    case 'mirror_portal': {
      // Planar Reflection Mirror Quad + Portal Frame + Secret Chamber
      const geomMirror = baseId + 90;
      const matMirror = baseId + 91;
      const modelMirror = baseId + 92;

      galfus.realm3dCreatePlane(realmId, geomMirror, 3.2, 3.2);
      galfus.realm3dCreateMaterial(realmId, matMirror, {
        surfaceType: 'mirror',
        baseColor: [0.95, 0.97, 1.0, 1.0],
        roughness: 0.02,
        metallic: 0.98,
        reflectance: 0.9
      });
      galfus.realm3dCreateModel(
        realmId,
        modelMirror,
        { geometryId: geomMirror, materialId: matMirror },
        { position: [fx, 1.8, fz - 1.5], rotation: [0.7071, 0, 0, 0.7071] } // Upright vertical mirror
      );

      // Register Planar Mirror Portal with Galfus
      galfus.realm3dCreatePortal(realmId, baseId + 93, {
        modelId: modelMirror,
        active: true
      });

      // Decorative Mirror Frame
      const geomFrame = baseId + 94;
      const matFrame = baseId + 95;
      galfus.realm3dCreateCylinder(realmId, geomFrame, 0.1, 3.4, 32);
      galfus.realm3dCreateMaterial(realmId, matFrame, {
        baseColor: [0.85, 0.7, 0.25, 1.0],
        roughness: 0.25,
        metallic: 0.85
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 96,
        { geometryId: geomFrame, materialId: matFrame },
        { position: [fx - 1.6, 1.8, fz - 1.5] }
      );
      galfus.realm3dCreateModel(
        realmId,
        baseId + 97,
        { geometryId: geomFrame, materialId: matFrame },
        { position: [fx + 1.6, 1.8, fz - 1.5] }
      );
      break;
    }

    case 'bones': {
      // 12-Joint Skinned Column / Tentacle
      const geomSkinned = baseId + 100;
      const matSkinned = baseId + 101;
      const modelSkinned = baseId + 102;

      const skinnedMesh = buildProceduralSkinnedMesh(24, 16, 5.0, 12);
      galfus.realm3dCreateGeometry(
        realmId,
        geomSkinned,
        3,
        skinnedMesh.vertexBuffer,
        skinnedMesh.vertexBuffer.byteLength,
        skinnedMesh.indexBuffer,
        skinnedMesh.indexBuffer.length
      );

      galfus.realm3dCreateMaterial(realmId, matSkinned, {
        baseColor: [0.15, 0.85, 0.95, 1.0],
        emissiveColor: [0.05, 0.25, 0.35, 1.0],
        roughness: 0.2,
        metallic: 0.6
      });

      galfus.realm3dCreateModel(
        realmId,
        modelSkinned,
        {
          geometryId: geomSkinned,
          materialId: matSkinned,
          castShadow: true,
          boneCount: 12,
          boneOffset: 0,
          active: true
        },
        { position: [fx, 0.4, fz] }
      );
      break;
    }

    case 'refraction': {
      // Screen-Space Refraction Glass Gems
      const geomSphere = baseId + 110;
      const matGlass = baseId + 111;
      const modelGlass = baseId + 112;

      galfus.realm3dCreateSphere(realmId, geomSphere, 1.0, 16, 32);
      galfus.realm3dCreateMaterial(realmId, matGlass, {
        surfaceType: 'refractive',
        baseColor: [0.1, 0.85, 0.4, 0.35], // Emerald green tint
        roughness: 0.04,
        metallic: 0.0,
        reflectance: 0.7,
        refractionIndex: 1.52, // Crown glass
        refractionDistortion: 0.1
      });
      galfus.realm3dCreateModel(
        realmId,
        modelGlass,
        { geometryId: geomSphere, materialId: matGlass },
        { position: [fx, 1.5, fz] }
      );

      // Background patterned pillar behind the glass to clearly see optical refraction
      const geomBack = baseId + 113;
      const matBack = baseId + 114;
      galfus.realm3dCreateCube(realmId, geomBack, 1.2);
      galfus.realm3dCreateMaterial(realmId, matBack, {
        baseColor: [0.95, 0.2, 0.35, 1.0],
        emissiveColor: [0.3, 0.05, 0.1, 1.0],
        roughness: 0.2,
        metallic: 0.5
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 115,
        { geometryId: geomBack, materialId: matBack },
        { position: [fx, 1.5, fz - 2.5] }
      );
      break;
    }

    case 'effects': {
      // Post-Processing & Screen Effects Exhibit
      const geomPodium = baseId + 120;
      const matPodium = baseId + 121;
      galfus.realm3dCreateTorus(realmId, geomPodium, 1.1, 0.33, 32, 16);
      galfus.realm3dCreateMaterial(realmId, matPodium, {
        baseColor: [0.85, 0.3, 0.9, 1.0],
        emissiveColor: [0.4, 0.1, 0.5, 1.0],
        roughness: 0.1,
        metallic: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 122,
        { geometryId: geomPodium, materialId: matPodium },
        { position: [fx, 1.5, fz] }
      );
      break;
    }

    default: {
      // Spatial Audio Beacon & Finale Room
      const geomBeacon = baseId + 130;
      const matBeacon = baseId + 131;
      galfus.realm3dCreateCylinder(realmId, geomBeacon, 0.7, 2.0, 24);
      galfus.realm3dCreateMaterial(realmId, matBeacon, {
        baseColor: [0.95, 0.8, 0.2, 1.0],
        emissiveColor: [0.35, 0.28, 0.05, 1.0],
        roughness: 0.2,
        metallic: 0.8
      });
      galfus.realm3dCreateModel(
        realmId,
        baseId + 132,
        { geometryId: geomBeacon, materialId: matBeacon },
        { position: [fx, 1.4, fz] }
      );
      break;
    }
  }
}

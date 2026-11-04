import { isKey, type Model3DComponent, quat, utils3D } from '@galfus/engine';
import { runDemoLoop } from '../common/loop';
import { createDemoSession, getScrollY, type HostDemoOptions } from '../common/options';

/**
 * Procedurally generates a 360° equirectangular panoramic skybox texture (1024x512).
 * Features a cosmic nebula, aurora ribbons, twinkling stars, distant mountain silhouettes, and a glowing horizon.
 */
function createPanoramicSkyboxTexture(width = 1024, height = 512): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    // Latitude: 0 = zenith (top), 0.5 = horizon, 1 = nadir (bottom)
    const v = y / (height - 1);
    const elev = (0.5 - v) * Math.PI; // -pi/2 to +pi/2
    const sinElev = Math.sin(elev);

    for (let x = 0; x < width; x++) {
      // Longitude: 0 to 2*PI around azimuth
      const u = x / (width - 1);
      const azim = u * Math.PI * 2;

      let r = 0;
      let g = 0;
      let b = 0;

      if (v <= 0.5) {
        // Upper hemisphere (Sky & Cosmos)
        const skyT = (0.5 - v) * 2.0; // 0 at horizon, 1 at zenith

        // Deep cosmic night sky base gradient
        r = 10 + Math.round(skyT * 22);
        g = 12 + Math.round(skyT * 18);
        b = 28 + Math.round(skyT * 60);

        // Aurora borealis & cosmic nebula waves across azimuth
        const wave1 = Math.sin(azim * 3.0 + skyT * 4.0) * 0.5 + 0.5;
        const wave2 = Math.cos(azim * 2.0 - skyT * 3.0) * 0.5 + 0.5;
        const nebulaIntensity = Math.pow(wave1 * wave2, 1.8) * Math.sin(skyT * Math.PI);

        r += Math.round(nebulaIntensity * 140);
        g += Math.round(nebulaIntensity * 220);
        b += Math.round(nebulaIntensity * 210);

        // Warm twilight/sunset planetary glow in southwest
        const sunAngle = Math.abs(azim - Math.PI * 1.35);
        const sunAzimDist = Math.min(sunAngle, Math.PI * 2 - sunAngle);
        const sunDist = Math.hypot(sunAzimDist * 1.6, v - 0.46);
        if (sunDist < 0.35) {
          const sunGlow = Math.pow(Math.max(0, 1.0 - sunDist / 0.35), 2.2);
          r += Math.round(sunGlow * 255);
          g += Math.round(sunGlow * 170);
          b += Math.round(sunGlow * 70);
        }

        // Distant mountain ridge silhouette near the horizon
        const ridgeHeight =
          0.47 +
          Math.sin(azim * 7.0) * 0.015 +
          Math.sin(azim * 19.0) * 0.008 +
          Math.cos(azim * 31.0) * 0.004;
        if (v > ridgeHeight) {
          const haze = (v - ridgeHeight) / (0.5 - ridgeHeight);
          r = Math.round(18 + haze * 22);
          g = Math.round(20 + haze * 24);
          b = Math.round(34 + haze * 36);
        } else {
          // Sparse twinkling stars
          const starSeed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const starRand = starSeed - Math.floor(starSeed);
          if (starRand > 0.994 && skyT > 0.15) {
            const brightness = Math.round(((starRand - 0.994) / 0.006) * 230);
            r = Math.min(255, r + brightness);
            g = Math.min(255, g + brightness);
            b = Math.min(255, b + brightness);
          }
        }
      } else {
        // Lower hemisphere (Ground reflection / desert basin)
        const groundT = (v - 0.5) * 2.0; // 0 at horizon, 1 at bottom
        r = Math.round(16 - groundT * 10);
        g = Math.round(18 - groundT * 12);
        b = Math.round(26 - groundT * 16);

        // Grid lines on desert floor
        const gridU = Math.abs(Math.sin(azim * 16.0));
        const gridV = Math.abs(Math.sin(groundT * 24.0));
        if (gridU > 0.96 || gridV > 0.96) {
          r += 35;
          g += 45;
          b += 65;
        }
      }

      const offset = (y * width + x) * 4;
      pixels[offset] = Math.min(255, r);
      pixels[offset + 1] = Math.min(255, g);
      pixels[offset + 2] = Math.min(255, b);
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

export async function runDemo3d11(options: HostDemoOptions = {}): Promise<void> {
  const { runtime, targetId, windowId, maxFrames } = createDemoSession(
    'Galfus Host Demo: 3D-11 Imported 360° Panoramic Skybox',
    options,
    [1280, 720]
  );

  try {
    const realm3d = runtime.createRealm3D();

    // 1. Generate and upload 360° Equirectangular panoramic texture
    console.log('[3d11] Generating 1024x512 360° equirectangular skybox panorama...');
    const skyboxPixels = createPanoramicSkyboxTexture(1024, 512);
    const skyboxTextureId = runtime.resources.createTexture(skyboxPixels, {
      width: 1024,
      height: 512,
      format: 'rgba8UnormSrgb'
    });

    let skyboxMode: 'cubemap' | 'procedural' = 'cubemap';
    let skyboxRotation = 0.0;
    let skyboxIntensity = 1.25;
    let autoRotateSkybox = true;

    const applyEnvironment = () => {
      realm3d.setEnvironment({
        ambientColor: [0.18, 0.22, 0.32, 0.45],
        exposure: 1.1,
        outline: { enabled: true, width: 1.0, threshold: 0.25, strength: 0.7 },
        ssao: { radius: 0.55, bias: 0.025, intensity: 1.25, power: 1.6 },
        skybox: {
          mode: skyboxMode,
          textureId: skyboxTextureId,
          intensity: skyboxIntensity,
          rotation: skyboxRotation,
          skyColor: [0.1, 0.15, 0.35, 1.0],
          horizonColor: [0.45, 0.55, 0.75, 1.0],
          groundColor: [0.06, 0.06, 0.08, 1.0],
          sunDirection: [-0.65, 0.45, -0.6, 0.0],
          sunColor: [1.0, 0.9, 0.75, 2.8],
          sunSize: 0.025
        }
      });
    };
    applyEnvironment();

    // 2. Camera setup
    const camPos: [number, number, number] = [0, 2.8, 9.5];
    const camTarget: [number, number, number] = [0, 1.4, 0];
    const camera = realm3d.createCamera(
      { fovY: 52, near: 0.1, far: 300, cameraSlot: 1 },
      { position: camPos, rotation: utils3D.quatFromLookAt(camPos, camTarget) }
    );
    realm3d.setCameraLookAt(camera, { target: camTarget, up: [0, 1, 0] });

    // 3. Lighting matching warm sunset feature in skybox
    realm3d.createLight(
      { kind: 'directional', color: [1.0, 0.88, 0.72], intensity: 2.6, castShadow: true },
      { position: [-7, 12, -8], rotation: utils3D.quatFromLookAt([-7, 12, -8], [0, 0, 0]) }
    );
    realm3d.createLight(
      { kind: 'point', color: [0.35, 0.85, 1.0], intensity: 12.0, range: 18.0, castShadow: false },
      { position: [0, 3.5, 3.5] }
    );

    // 4. Showcase PBR materials reflecting the imported skybox
    const chromeMat = realm3d.createMaterial({
      baseColor: [0.95, 0.95, 0.98, 1.0],
      metallic: 0.98,
      roughness: 0.04
    }).materialId;
    const goldMat = realm3d.createMaterial({
      baseColor: [1.0, 0.82, 0.28, 1.0],
      metallic: 0.92,
      roughness: 0.16
    }).materialId;
    const rubyGlassMat = realm3d.createMaterial({
      surfaceType: 'refractive',
      baseColor: [0.95, 0.15, 0.35, 1.0],
      metallic: 0.0,
      roughness: 0.08,
      refractionIndex: 1.62
    }).materialId;
    const copperMat = realm3d.createMaterial({
      baseColor: [0.95, 0.5, 0.3, 1.0],
      metallic: 0.85,
      roughness: 0.28
    }).materialId;
    const pedestalMat = realm3d.createMaterial({
      baseColor: [0.14, 0.16, 0.2, 1.0],
      metallic: 0.3,
      roughness: 0.65
    }).materialId;

    // Platform & Pedestals
    realm3d.createCylinder(4.8, 0.3, 36, pedestalMat, { position: [0, 0.15, 0] });
    realm3d.createCylinder(0.9, 1.2, 24, pedestalMat, { position: [0, 0.9, 0] });
    realm3d.createCylinder(0.7, 0.9, 24, pedestalMat, { position: [-2.6, 0.75, 0.5] });
    realm3d.createCylinder(0.7, 0.9, 24, pedestalMat, { position: [2.6, 0.75, 0.5] });
    realm3d.createCylinder(0.65, 0.75, 24, pedestalMat, { position: [0, 0.675, -2.6] });

    // Central Chrome Mirror Orb
    const mirrorOrb = realm3d.createSphere(0.9, 32, 48, chromeMat, {
      position: [0, 2.4, 0]
    }).entityId;

    // Gold Torus (left)
    const goldTorus = realm3d.createTorus(0.7, 0.24, 40, 24, goldMat, {
      position: [-2.6, 1.8, 0.5]
    }).entityId;

    // Refractive Ruby Glass Sphere (right)
    const glassOrb = realm3d.createSphere(0.65, 32, 40, rubyGlassMat, {
      position: [2.6, 1.7, 0.5]
    }).entityId;

    // Copper Monolith (back)
    const copperBox = realm3d.createCube(1.0, copperMat, {
      position: [0, 1.8, -2.6],
      scale: [0.8, 1.5, 0.8]
    }).entityId;

    runtime.multiverse.createInvocation({
      realmId: realm3d.realmId,
      targetId,
      cameraSlot: 1,
      clearColor: [0.04, 0.05, 0.09, 1.0]
    });
    realm3d.flush();

    let elapsed = 0;
    let orbitYaw = 0;
    let orbitPitch = 0.25;
    let orbitDist = 9.5;
    let isDragging = false;
    let lastMouse: [number, number] = [0, 0];

    runtime.on('pointer', (ev) => {
      if (ev.type === 'button' && ev.button === 'primary') {
        isDragging = ev.state === 'pressed';
        lastMouse = ev.position;
      } else if (ev.type === 'move' && isDragging) {
        orbitYaw -= (ev.position[0] - lastMouse[0]) * 0.007;
        orbitPitch = Math.max(
          -0.4,
          Math.min(1.2, orbitPitch + (ev.position[1] - lastMouse[1]) * 0.007)
        );
        lastMouse = ev.position;
      } else if (ev.type === 'scroll') {
        orbitDist = Math.max(4.0, Math.min(22.0, orbitDist - getScrollY(ev.delta) * 0.5));
      }
    });

    runtime.on('keyboard', (ev) => {
      if (ev.type === 'input' && ev.state === 'pressed') {
        if (isKey(ev, 'm', ' ')) {
          skyboxMode = skyboxMode === 'cubemap' ? 'procedural' : 'cubemap';
          console.log(`[3d11] Skybox Mode: ${skyboxMode.toUpperCase()}`);
          applyEnvironment();
        } else if (isKey(ev, 'r')) {
          autoRotateSkybox = !autoRotateSkybox;
          console.log(`[3d11] Skybox Auto-Rotate: ${autoRotateSkybox ? 'ON' : 'OFF'}`);
        } else if (isKey(ev, '1', '-')) {
          skyboxIntensity = Math.max(0.1, skyboxIntensity - 0.15);
          console.log(`[3d11] Skybox Intensity: ${skyboxIntensity.toFixed(2)}`);
          applyEnvironment();
        } else if (isKey(ev, '2', '+', '=')) {
          skyboxIntensity = Math.min(3.5, skyboxIntensity + 0.15);
          console.log(`[3d11] Skybox Intensity: ${skyboxIntensity.toFixed(2)}`);
          applyEnvironment();
        }
      }
    });

    const camModel = realm3d.world.getComponent<Model3DComponent>(camera.entityId, 'Model3D')!;
    const orbModel = realm3d.world.getComponent<Model3DComponent>(mirrorOrb, 'Model3D')!;
    const torusModel = realm3d.world.getComponent<Model3DComponent>(goldTorus, 'Model3D')!;
    const glassModel = realm3d.world.getComponent<Model3DComponent>(glassOrb, 'Model3D')!;
    const boxModel = realm3d.world.getComponent<Model3DComponent>(copperBox, 'Model3D')!;

    const rotQ = quat.create();

    runtime.on('tick', ({ dt }) => {
      elapsed += dt;
      if (autoRotateSkybox) {
        skyboxRotation = (skyboxRotation + dt * 0.15) % (Math.PI * 2);
        applyEnvironment();
      }

      // Smooth floating animations
      orbModel.setPosition(0, 2.4 + Math.sin(elapsed * 1.5) * 0.12, 0);
      glassModel.setPosition(2.6, 1.7 + Math.cos(elapsed * 1.8) * 0.08, 0.5);

      quat.fromEuler(rotQ, elapsed * 0.4, elapsed * 0.6, 0);
      torusModel.setRotation(rotQ);

      quat.fromEuler(rotQ, 0, elapsed * 0.5, 0);
      boxModel.setRotation(rotQ);

      // Orbit camera positioning
      const cx = Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      const cy = Math.sin(orbitPitch) * orbitDist + 1.4;
      const cz = Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist;
      camModel.setPosition(cx, cy, cz);
      realm3d.setCameraLookAt(camera, { target: [0, 1.4, 0], up: [0, 1, 0] });
    });

    console.log(
      '[3d11] Ready. M/Space: toggle Imported vs Procedural | R: toggle Skybox rotation | 1/2: Intensity | Drag: orbit | Esc: exit.'
    );
    await runDemoLoop(runtime, { windowId, maxFrames, exitKeys: ['escape', 'q'] });
  } finally {
    runtime.dispose();
  }
}

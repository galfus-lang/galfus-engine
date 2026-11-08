import Fuse from 'fuse.js';
import type { DemoRunOptions } from './common/options';
import { runInteractionDemo } from './host/interaction';
import { runTextInputDemo } from './host/text-input';
import { runTransRealmDemo } from './host/trans-realm';
import { runTutorialDemo } from './host/tutorial';
import { runDemoMv1 } from './multiverse/mv1-split';
import { runDemoMv2 } from './multiverse/mv2-rtt-reuse';
import { runDemoMv3 } from './multiverse/mv3-cycle';
import { runDemoMv4 } from './multiverse/mv4-anti-aliasing';
import { runDemoAnchor1 } from './physics/anchor1-kinematic';
import { runDemoPhys2d1 } from './physics/phys2d1-arena';
import { runDemoPhys2d2 } from './physics/phys2d2-chains';
import { runDemoPhys2d3 } from './physics/phys2d3-hinge';
import { runDemoPhys2d4 } from './physics/phys2d4-forces';
import { runDemoPhys3d1 } from './physics/phys3d1-sandbox';
import { runDemoPhys3d2 } from './physics/phys3d2-joints';
import { runDemoPhys3d3 } from './physics/phys3d3-hinge';
import { runDemoPhys3d4 } from './physics/phys3d4-forces';
import { runDemoAnim1 } from './realm2d/anim1-transitions';
import { runDemo2d1 } from './realm2d/d2d1-shadows';
import { runDemo2d2 } from './realm2d/d2d2-effects-particles';
import { runDemo2d3 } from './realm2d/d2d3-svg';
import { runDemo3d1 } from './realm3d/d3d1-orbit';
import { runDemo3d2 } from './realm3d/d3d2-bones';
import { runDemo3d3 } from './realm3d/d3d3-ssao-shadows';
import { runDemo3d4 } from './realm3d/d3d4-features';
import { runDemo3d5 } from './realm3d/d3d5-particles';
import { runDemo3d6 } from './realm3d/d3d6-refraction';
import { runDemo3d7 } from './realm3d/d3d7-portal-mirror';
import { runDemo3d8 } from './realm3d/d3d8-instancing';
import { runDemo3d9 } from './realm3d/d3d9-sides-normals';
import { runDemo3d10 } from './realm3d/d3d10-morph-targets';
import { runDemo3d11 } from './realm3d/d3d11-imported-skybox';
import { runDemoUi1 } from './ui/ui1-pointer-wheel-image';

export type DemoCategory =
  | 'Host & Interaction'
  | 'UI'
  | 'Physics & Anchors'
  | 'Multiverse'
  | 'Realm 3D'
  | 'Realm 2D & Animation';

export const DEMO_CATEGORIES: readonly DemoCategory[] = [
  'Host & Interaction',
  'UI',
  'Physics & Anchors',
  'Multiverse',
  'Realm 3D',
  'Realm 2D & Animation'
] as const;

export interface DemoDescriptor {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly title: string;
  readonly category: DemoCategory;
  readonly tags: readonly string[];
  readonly description: string;
  readonly run: (options?: DemoRunOptions) => Promise<void>;
}

export const DEMO_CATALOG: readonly DemoDescriptor[] = [
  // 1. Host & Interaction (4 demos)
  {
    id: 'tutorial',
    aliases: ['host-tutorial', 'showcase'],
    title: 'Host Engine Comprehensive Tutorial',
    category: 'Host & Interaction',
    tags: ['host', 'ecs', 'multiverse', 'audio', '3d', '2d', 'skinning'],
    description:
      'Full host engine tour combining 3D PBR, skeletal skinning, 2D polar shadows, spatial audio, and Picture-in-Picture.',
    run: runTutorialDemo
  },
  {
    id: 'interaction',
    aliases: ['hit-test', 'pointer'],
    title: 'Cross-Realm Pointer & Hit-Test Lab',
    category: 'Host & Interaction',
    tags: ['host', 'interaction', 'pointer', 'raycast', 'focus', '2d', '3d'],
    description:
      'Interactive pointer routing, hover/drag states, focus rings, and cross-realm 2D/3D hit-testing.',
    run: runInteractionDemo
  },
  {
    id: 'text-input',
    aliases: ['text', 'caret', 'selection'],
    title: 'Interactive SVG Text Input & Shaping',
    category: 'Host & Interaction',
    tags: ['host', 'text', 'svg', 'input', 'clipboard', 'ime', 'font'],
    description:
      'Single-line and multi-line editable text fields with grapheme cluster shaping, selection, and clipboard.',
    run: runTextInputDemo
  },
  {
    id: 'trans-realm',
    aliases: ['cross-realm', 'portal-ui'],
    title: 'Trans-Realm 3D-to-2D Screen Projection',
    category: 'Host & Interaction',
    tags: ['host', 'projection', 'multiverse', 'hud', '3d', '2d'],
    description:
      'Projects 3D world-space anchors onto 2D HUD overlays and Picture-in-Picture viewports in real time.',
    run: runTransRealmDemo
  },

  // 2. UI (1 demo)
  {
    id: 'ui1',
    aliases: ['ui-events', 'svg-image', 'wheel'],
    title: 'SVG Pointer, Wheel & Engine Texture <image> Lab',
    category: 'UI',
    tags: ['ui', 'svg', 'pointer', 'wheel', 'scroll', 'image', 'textureId', 'clipPath'],
    description:
      'Interactive SVG UI receiving pointer and wheel scroll events, zooming/panning engine textures inside <image textureId="..."> and <clipPath>.',
    run: runDemoUi1
  },

  // 3. Physics & Anchors (5 demos)
  {
    id: 'anchor1',
    aliases: ['anchors', 'kinematic-anchors'],
    title: 'Kinematic Rope, Chain & Spring Anchors',
    category: 'Physics & Anchors',
    tags: ['anchors', 'kinematic', 'rope', 'chain', 'spring', 'attachChain'],
    description:
      'Pure kinematic presetsAnchor (rope, chain, spring) and hierarchy.attachChain solved without a physics engine.',
    run: runDemoAnchor1
  },
  {
    id: 'phys3d1',
    aliases: ['physics-3d', 'sandbox-3d'],
    title: '3D RigidBodies, Colliders & Sensor Triggers',
    category: 'Physics & Anchors',
    tags: ['physics', '3d', 'rapier', 'rigidbody', 'collider', 'sensor', 'impulse'],
    description:
      'Rapier 3D physics sandbox with falling boxes and spheres, static arena walls, sensor triggers, and impulse bursts.',
    run: runDemoPhys3d1
  },
  {
    id: 'phys3d2',
    aliases: ['joints-3d', 'pendulum-3d'],
    title: '3D Physical Joints & Anchored Particle Emitters',
    category: 'Physics & Anchors',
    tags: ['physics', '3d', 'joints', 'rope', 'chain', 'spring', 'particles', 'managedByPhysics'],
    description:
      'Promotes 3D Anchors to physical Rapier joints while keeping child lights and textured particle emitters anchored.',
    run: runDemoPhys3d2
  },
  {
    id: 'phys3d3',
    aliases: ['hinge-3d', 'doors-3d', 'saloon-3d'],
    title: '3D Hinge Joints, Rotation Limits & Swinging Doors',
    category: 'Physics & Anchors',
    tags: ['physics', '3d', 'joints', 'hinge', 'limits', 'doors', 'managedByPhysics'],
    description:
      '3D double saloon doors and trapdoor hatch using Rapier hinge impulse joints with angular limits around custom axes.',
    run: runDemoPhys3d3
  },
  {
    id: 'phys3d4',
    aliases: ['forces-3d', 'torque-3d', 'point-impulse-3d'],
    title: '3D Forces, Continuous Torque & Point Impulses',
    category: 'Physics & Anchors',
    tags: ['physics', '3d', 'forces', 'torque', 'point-impulse', 'turbine', 'drone'],
    description:
      '3D physics playground featuring continuous torque-driven turbine, thrusters with forceAtPoint, and off-center point impulses.',
    run: runDemoPhys3d4
  },
  {
    id: 'phys2d1',
    aliases: ['physics-2d', 'arena-2d'],
    title: '2D RigidBodies, Collisions & Dynamic Shadows',
    category: 'Physics & Anchors',
    tags: ['physics', '2d', 'rapier', 'shadows', 'polygon', 'sensor'],
    description:
      'Rapier 2D physics arena with bouncing boxes, circles, and hexagons casting dynamic polar soft shadows.',
    run: runDemoPhys2d1
  },
  {
    id: 'phys2d2',
    aliases: ['joints-2d', 'chains-2d'],
    title: '2D Physical Chains, Ropes, Springs & Telemetry HUD',
    category: 'Physics & Anchors',
    tags: ['physics', '2d', 'joints', 'chain', 'rope', 'spring', 'svg'],
    description:
      '2D physical pendulum chain, rope tether, and spring oscillator with live velocity telemetry in a reactive SVG HUD.',
    run: runDemoPhys2d2
  },
  {
    id: 'phys2d3',
    aliases: ['hinge-2d', 'gates-2d', 'flipper-2d'],
    title: '2D Hinge Joints, Angular Limits & Swinging Gates',
    category: 'Physics & Anchors',
    tags: ['physics', '2d', 'joints', 'hinge', 'limits', 'gates', 'shadows'],
    description:
      '2D swinging saloon gates with angular limits funneling falling balls with live angular velocity telemetry.',
    run: runDemoPhys2d3
  },
  {
    id: 'phys2d4',
    aliases: ['forces-2d', 'torque-2d', 'point-impulse-2d'],
    title: '2D Forces, Continuous Torque & Point Impulses',
    category: 'Physics & Anchors',
    tags: ['physics', '2d', 'forces', 'torque', 'point-impulse', 'rotor', 'thrust'],
    description:
      '2D physics arena showcasing continuous torque spinner, off-center point impulses, and directional thrusters.',
    run: runDemoPhys2d4
  },

  // 3. Multiverse (4 demos)
  {
    id: 'mv1',
    aliases: ['split-screen', 'multiverse-split'],
    title: 'Split-Screen & Picture-in-Picture Composition',
    category: 'Multiverse',
    tags: ['multiverse', 'viewport', 'split-screen', 'pip'],
    description:
      'Multi-camera 3D scene rendered simultaneously across left/right split-screen and a Picture-in-Picture overlay.',
    run: runDemoMv1
  },
  {
    id: 'mv2',
    aliases: ['rtt', 'render-to-texture'],
    title: 'Offscreen Render-to-Texture (RTT) Reuse',
    category: 'Multiverse',
    tags: ['multiverse', 'rtt', 'render-target', 'texture'],
    description:
      'Renders an offscreen 3D realm into a texture target and binds that live texture onto 3D monitors in a main room.',
    run: runDemoMv2
  },
  {
    id: 'mv3',
    aliases: ['feedback-cycle', 'ping-pong'],
    title: 'Cyclic Render Graph & Ping-Pong History',
    category: 'Multiverse',
    tags: ['multiverse', 'cycle', 'feedback', 'rtt', 'dag'],
    description:
      'Two realms referencing each other’s render targets in a cyclic graph resolved automatically with 1-frame history.',
    run: runDemoMv3
  },
  {
    id: 'mv4',
    aliases: ['anti-aliasing', 'msaa', 'fxaa', 'smaa'],
    title: 'Anti-Aliasing Comparison (None, FXAA, SMAA, MSAA)',
    category: 'Multiverse',
    tags: ['multiverse', 'aa', 'fxaa', 'smaa', 'msaa', 'post-process'],
    description:
      '4-quadrant split-screen comparing None, FXAA, SMAA, and MSAA 4x on high-contrast geometry and sub-pixel wires.',
    run: runDemoMv4
  },

  // 4. Realm 3D (10 demos)
  {
    id: '3d1',
    aliases: ['orbit', 'pbr'],
    title: '3D PBR Primitives & Orbit Camera',
    category: 'Realm 3D',
    tags: ['3d', 'pbr', 'camera', 'orbit', 'primitives', 'gizmos'],
    description:
      'Interactive orbit camera around PBR metallic/roughness primitives with procedural skybox and debug gizmos.',
    run: runDemo3d1
  },
  {
    id: '3d2',
    aliases: ['bones', 'skinning'],
    title: 'Skeletal Animation & GPU Vertex Skinning',
    category: 'Realm 3D',
    tags: ['3d', 'skinning', 'bones', 'skeleton', 'animation'],
    description:
      'Articulated 4-bone robotic arm with smooth procedural joint weights and real-time hierarchy skinning.',
    run: runDemo3d2
  },
  {
    id: '3d3',
    aliases: ['ssao', 'shadows-3d', 'csm'],
    title: 'SSAO & Cascaded Shadow Maps (CSM)',
    category: 'Realm 3D',
    tags: ['3d', 'ssao', 'shadows', 'csm', 'lighting'],
    description:
      'Architectural pillars and arches showcasing Screen-Space Ambient Occlusion and multi-light shadow casting.',
    run: runDemo3d3
  },
  {
    id: '3d4',
    aliases: ['shaders-3d', 'surface-effects-3d'],
    title: 'Custom 3D WGSL Surface & Post-Process Shaders',
    category: 'Realm 3D',
    tags: ['3d', 'wgsl', 'shader', 'hologram', 'lava', 'crt'],
    description:
      'Custom WGSL surface effects (Hologram, Plasma, Rim Pulse, Lava) combined with a retro CRT post-process filter.',
    run: runDemo3d4
  },
  {
    id: '3d5',
    aliases: ['particles-3d', 'textured-particles-3d'],
    title: '3D GPU Particle Emitters (Textured Atlas & Procedural)',
    category: 'Realm 3D',
    tags: ['3d', 'particles', 'atlas', 'uvRect', 'texture', 'vfx'],
    description:
      'Showcases 4 GPU particle emitters combining 2x2 texture atlas sub-rects (star flare, smoke puff, ring) and procedural glow.',
    run: runDemo3d5
  },
  {
    id: '3d6',
    aliases: ['refraction', 'transmission', 'glass'],
    title: 'Screen-Space Transmission, IOR & Roughness Refraction',
    category: 'Realm 3D',
    tags: ['3d', 'refraction', 'transmission', 'ior', 'glass', 'pbr'],
    description:
      'Clear crystal, frosted ice, high-IOR ruby, and amber glass refracting animated emissive pillars behind them.',
    run: runDemo3d6
  },
  {
    id: '3d7',
    aliases: ['portals', 'mirrors', 'stencil'],
    title: 'Recursive Stencil Portals & Planar Mirrors',
    category: 'Realm 3D',
    tags: ['3d', 'portal', 'mirror', 'stencil', 'oblique-clipping'],
    description:
      'Planar mirror reflection and a teleportation portal peering into a distant neon sanctuary with oblique near-plane clipping.',
    run: runDemo3d7
  },
  {
    id: '3d8',
    aliases: ['instancing', 'gpu-instancing'],
    title: 'Hardware GPU Instancing (745 Dynamic Meshes)',
    category: 'Realm 3D',
    tags: ['3d', 'instancing', 'performance', 'wave'],
    description:
      '625 wave-animated cubes and 120 spiraling orbs updated every frame and drawn in just 2 hardware instanced calls.',
    run: runDemo3d8
  },
  {
    id: '3d9',
    aliases: ['normals', 'cull-modes', 'flat-shading'],
    title: 'Tangent-Space Normal Maps, Render Sides & Flat Shading',
    category: 'Realm 3D',
    tags: ['3d', 'normal-map', 'culling', 'doubleSide', 'flatShading'],
    description:
      'Compares procedural brick/wave normal maps, Front/Back/DoubleSide culling, and smooth vs. flat faceted shading.',
    run: runDemo3d9
  },
  {
    id: '3d10',
    aliases: ['morph-targets', 'blend-shapes'],
    title: 'GPU Morph Targets (Blend Shapes)',
    category: 'Realm 3D',
    tags: ['3d', 'morph', 'blend-shapes', 'vertex-animation'],
    description:
      'Custom sphere mesh blending smoothly across 3 morph targets (Starburst Spikes, Rounded Cube, Spiral Twist).',
    run: runDemo3d10
  },
  {
    id: '3d11',
    aliases: ['skybox', 'panoramic', 'hdr-skybox', 'cubemap'],
    title: 'Imported 360° Panoramic Skybox & Reflections',
    category: 'Realm 3D',
    tags: ['3d', 'skybox', 'panoramic', 'equirectangular', 'reflections', 'pbr'],
    description:
      'Imports a 360° equirectangular panoramic texture as a background skybox, reflected across chrome, gold, and glass PBR materials.',
    run: runDemo3d11
  },

  // 5. Realm 2D & Animation (4 demos)
  {
    id: '2d1',
    aliases: ['shadows-2d', 'polar-shadows'],
    title: '2D Polar Soft Shadows & 2.5D Height Bands',
    category: 'Realm 2D & Animation',
    tags: ['2d', 'shadows', 'lighting', 'penumbra', '2.5d'],
    description:
      'Interactive 2D arena with polar soft shadows, adjustable penumbra radius, and 2.5D height-range occlusion.',
    run: runDemo2d1
  },
  {
    id: '2d2',
    aliases: ['particles-2d', 'effects-2d'],
    title: '2D Material Shaders & Textured Particle Emitters',
    category: 'Realm 2D & Animation',
    tags: ['2d', 'shader', 'particles', 'atlas', 'uvRect', 'wgsl'],
    description:
      'Custom 2D WGSL surface shaders (Plasma, Hologram, Lava, Caustics) paired with procedural and atlas-textured 2D particles.',
    run: runDemo2d2
  },
  {
    id: '2d3',
    aliases: ['svg', 'vector-hud'],
    title: 'Reactive 2D Vector SVG & Live DOM Mutations',
    category: 'Realm 2D & Animation',
    tags: ['2d', 'svg', 'vector', 'hud', 'typography'],
    description:
      'Real-time GPU-rasterized SVG cards with live attribute/text mutation, theme switching, and 4-corner text alignment.',
    run: runDemo2d3
  },
  {
    id: 'anim1',
    aliases: ['transitions', 'easing'],
    title: 'Native Transitions, Easing Curves & Reactive SVG',
    category: 'Realm 2D & Animation',
    tags: ['animation', 'transitions', 'easing', 'retarget', 'svg'],
    description:
      'Demonstrates Bounce, Elastic, Cubic, and Back easing curves across 3D transforms and 2D SVG attributes with mid-flight retargeting.',
    run: runDemoAnim1
  }
];

const fuseIndex = new Fuse(DEMO_CATALOG, {
  keys: [
    { name: 'id', weight: 3.0 },
    { name: 'aliases', weight: 2.5 },
    { name: 'title', weight: 2.0 },
    { name: 'tags', weight: 1.5 },
    { name: 'category', weight: 1.0 },
    { name: 'description', weight: 0.8 }
  ],
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true
});

/**
 * Finds a demo by exact `id` or `alias` (case-insensitive).
 */
export function findDemo(query: string): DemoDescriptor | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return undefined;
  return DEMO_CATALOG.find(
    (d) =>
      d.id.toLowerCase() === normalized || d.aliases.some((a) => a.toLowerCase() === normalized)
  );
}

/**
 * Filters the catalog by category name (case-insensitive substring or exact match).
 */
export function filterDemosByCategory(category?: string): readonly DemoDescriptor[] {
  if (!category || category.toLowerCase() === 'all') return DEMO_CATALOG;
  const norm = category.trim().toLowerCase();
  return DEMO_CATALOG.filter((d) => d.category.toLowerCase().includes(norm));
}

/**
 * Performs a fuzzy search across `id`, `aliases`, `title`, `tags`, `category`, and `description`.
 */
export function fuzzySearchDemos(query: string, category?: string): readonly DemoDescriptor[] {
  const pool = filterDemosByCategory(category);
  const trimmed = query.trim();
  if (!trimmed) return pool;

  const exact = findDemo(trimmed);
  const results = fuseIndex.search(trimmed).map((r) => r.item);
  const filtered = category ? results.filter((d) => pool.includes(d)) : results;

  if (exact && (!category || pool.includes(exact))) {
    return [exact, ...filtered.filter((d) => d.id !== exact.id)];
  }
  return filtered;
}

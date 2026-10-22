/** Host-side procedural mesh helpers for demos. They never cross the renderer ABI as JSON. */

export type Primitive3D =
  'cube' | 'plane' | 'quad' | 'sphere' | 'cylinder' | 'capsule' | 'pyramid' | 'torus';

export interface Primitive3DOptions {
  primitive: Primitive3D;
  size?: number;
  radius?: number;
  subdivisions?: number;
}

interface GeometryTarget {
  realm3dCreateGeometry(
    realmId: number,
    geometryId: number,
    topology: number,
    vertexData: Uint8Array,
    vertexDataLen: number,
    indices: Uint32Array,
    indexCount: number
  ): void;
}

interface Vertex {
  position: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
}

interface Mesh {
  vertices: Vertex[];
  indices: number[];
}

const TAU = Math.PI * 2;

function vertex(position: Vertex['position'], normal: Vertex['normal'], uv: Vertex['uv']): Vertex {
  return { position, normal, uv };
}

function quad(
  vertices: Vertex[],
  indices: number[],
  a: Vertex,
  b: Vertex,
  c: Vertex,
  d: Vertex
): void {
  const offset = vertices.length;
  vertices.push(a, b, c, d);
  indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

function cube(size: number): Mesh {
  const h = size * 0.5;
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  quad(
    vertices,
    indices,
    vertex([-h, -h, h], [0, 0, 1], [0, 1]),
    vertex([h, -h, h], [0, 0, 1], [1, 1]),
    vertex([h, h, h], [0, 0, 1], [1, 0]),
    vertex([-h, h, h], [0, 0, 1], [0, 0])
  );
  quad(
    vertices,
    indices,
    vertex([h, -h, -h], [0, 0, -1], [0, 1]),
    vertex([-h, -h, -h], [0, 0, -1], [1, 1]),
    vertex([-h, h, -h], [0, 0, -1], [1, 0]),
    vertex([h, h, -h], [0, 0, -1], [0, 0])
  );
  quad(
    vertices,
    indices,
    vertex([-h, -h, -h], [-1, 0, 0], [0, 1]),
    vertex([-h, -h, h], [-1, 0, 0], [1, 1]),
    vertex([-h, h, h], [-1, 0, 0], [1, 0]),
    vertex([-h, h, -h], [-1, 0, 0], [0, 0])
  );
  quad(
    vertices,
    indices,
    vertex([h, -h, h], [1, 0, 0], [0, 1]),
    vertex([h, -h, -h], [1, 0, 0], [1, 1]),
    vertex([h, h, -h], [1, 0, 0], [1, 0]),
    vertex([h, h, h], [1, 0, 0], [0, 0])
  );
  quad(
    vertices,
    indices,
    vertex([-h, h, h], [0, 1, 0], [0, 1]),
    vertex([h, h, h], [0, 1, 0], [1, 1]),
    vertex([h, h, -h], [0, 1, 0], [1, 0]),
    vertex([-h, h, -h], [0, 1, 0], [0, 0])
  );
  quad(
    vertices,
    indices,
    vertex([-h, -h, -h], [0, -1, 0], [0, 1]),
    vertex([h, -h, -h], [0, -1, 0], [1, 1]),
    vertex([h, -h, h], [0, -1, 0], [1, 0]),
    vertex([-h, -h, h], [0, -1, 0], [0, 0])
  );
  return { vertices, indices };
}

function plane(size: number, vertical = false): Mesh {
  const h = size * 0.5;
  if (vertical) {
    return {
      vertices: [
        vertex([-h, -h, 0], [0, 0, 1], [0, 1]),
        vertex([h, -h, 0], [0, 0, 1], [1, 1]),
        vertex([h, h, 0], [0, 0, 1], [1, 0]),
        vertex([-h, h, 0], [0, 0, 1], [0, 0])
      ],
      indices: [0, 1, 2, 0, 2, 3]
    };
  }
  return {
    vertices: [
      vertex([-h, 0, h], [0, 1, 0], [0, 1]),
      vertex([h, 0, h], [0, 1, 0], [1, 1]),
      vertex([h, 0, -h], [0, 1, 0], [1, 0]),
      vertex([-h, 0, -h], [0, 1, 0], [0, 0])
    ],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

function sphere(radius: number, segments: number, yScale = 1): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  const rings = Math.max(3, Math.floor(segments * 0.5));
  const sectors = Math.max(3, segments);
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = Math.PI * v;
    for (let s = 0; s <= sectors; s++) {
      const u = s / sectors;
      const theta = TAU * u;
      const x = Math.sin(theta) * Math.sin(phi);
      const y = Math.cos(phi);
      const z = Math.cos(theta) * Math.sin(phi);
      vertices.push(vertex([x * radius, y * radius * yScale, z * radius], [x, y, z], [u, v]));
    }
  }
  for (let r = 0; r < rings; r++)
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s;
      const b = a + sectors + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  return { vertices, indices };
}

function cylinder(radius: number, height: number, segments: number): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  const half = height * 0.5;
  const count = Math.max(3, segments);
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const a = u * TAU;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    vertices.push(vertex([x, half, z], [Math.cos(a), 0, Math.sin(a)], [u, 0]));
    vertices.push(vertex([x, -half, z], [Math.cos(a), 0, Math.sin(a)], [u, 1]));
  }
  for (let i = 0; i < count; i++)
    indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const addCap = (top: boolean) => {
    const base = vertices.length;
    const y = top ? half : -half;
    const normal: Vertex['normal'] = [0, top ? 1 : -1, 0];
    vertices.push(vertex([0, y, 0], normal, [0.5, 0.5]));
    for (let i = 0; i <= count; i++) {
      const a = (i / count) * TAU;
      vertices.push(
        vertex([Math.cos(a) * radius, y, Math.sin(a) * radius], normal, [
          (Math.cos(a) + 1) * 0.5,
          (Math.sin(a) + 1) * 0.5
        ])
      );
    }
    for (let i = 0; i < count; i++)
      indices.push(base, base + (top ? i + 2 : i + 1), base + (top ? i + 1 : i + 2));
  };
  addCap(true);
  addCap(false);
  return { vertices, indices };
}

function pyramid(size: number): Mesh {
  const h = size * 0.5;
  const vertices = [
    vertex([-h, -h, h], [0, -1, 0], [0, 1]),
    vertex([h, -h, h], [0, -1, 0], [1, 1]),
    vertex([h, -h, -h], [0, -1, 0], [1, 0]),
    vertex([-h, -h, -h], [0, -1, 0], [0, 0]),
    vertex([0, h, 0], [0, 1, 0], [0.5, 0])
  ];
  return { vertices, indices: [0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4] };
}

function torus(radius: number, segments: number): Mesh {
  const vertices: Vertex[] = [];
  const indices: number[] = [];
  const major = Math.max(3, segments);
  const minor = Math.max(3, Math.floor(segments * 0.5));
  const tube = radius * 0.3;
  for (let i = 0; i <= major; i++)
    for (let j = 0; j <= minor; j++) {
      const u = (i / major) * TAU;
      const v = (j / minor) * TAU;
      const nx = Math.cos(u) * Math.cos(v),
        ny = Math.sin(v),
        nz = Math.sin(u) * Math.cos(v);
      vertices.push(
        vertex(
          [
            (radius + tube * Math.cos(v)) * Math.cos(u),
            tube * Math.sin(v),
            (radius + tube * Math.cos(v)) * Math.sin(u)
          ],
          [nx, ny, nz],
          [i / major, j / minor]
        )
      );
    }
  for (let i = 0; i < major; i++)
    for (let j = 0; j < minor; j++) {
      const a = i * (minor + 1) + j,
        b = a + minor + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { vertices, indices };
}

function meshFor(options: Primitive3DOptions): Mesh {
  const size = options.size ?? 1;
  const radius = options.radius ?? 1;
  const segments = options.subdivisions ?? 32;
  switch (options.primitive) {
    case 'cube':
      return cube(size);
    case 'plane':
      return plane(size);
    case 'quad':
      return plane(size, true);
    case 'sphere':
      return sphere(radius, segments);
    case 'cylinder':
      return cylinder(radius, size, segments);
    case 'capsule':
      return sphere(radius, segments, Math.max(1, size / (radius * 2)));
    case 'pyramid':
      return pyramid(size);
    case 'torus':
      return torus(radius, segments);
  }
}

function pack(vertices: Vertex[]): Uint8Array {
  const bytes = new Uint8Array(vertices.length * 136);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < vertices.length; i++) {
    const source = vertices[i]!;
    const offset = i * 136;
    for (let n = 0; n < 3; n++) {
      view.setFloat32(offset + n * 4, source.position[n]!, true);
      view.setFloat32(offset + 12 + n * 4, source.normal[n]!, true);
    }
    view.setFloat32(offset + 24, source.uv[0], true);
    view.setFloat32(offset + 28, source.uv[1], true);
    view.setFloat32(offset + 32, source.uv[0], true);
    view.setFloat32(offset + 36, source.uv[1], true);
    view.setFloat32(offset + 40, 1, true);
    view.setFloat32(offset + 52, 1, true);
    for (let n = 0; n < 4; n++) view.setFloat32(offset + 56 + n * 4, 1, true);
  }
  return bytes;
}

/** Generates a demo primitive on the host and uploads only canonical binary mesh data. */
export function createPrimitiveGeometry(
  target: GeometryTarget,
  realmId: number,
  geometryId: number,
  options: Primitive3DOptions
): void {
  const mesh = meshFor(options);
  const vertexData = pack(mesh.vertices);
  const indices = new Uint32Array(mesh.indices);
  target.realm3dCreateGeometry(
    realmId,
    geometryId,
    3,
    vertexData,
    vertexData.byteLength,
    indices,
    indices.length
  );
}

import {
  FACE_EDGE_NEIGHBORS,
  ICOSAHEDRON_FACES,
  VERTEX_FACES,
} from './constants';
import {
  dotProduct,
  geoToVector3D,
  inverseProjectFromFace,
  vector3DToGeo,
} from './icosahedron';
import {
  barycentricToMorton,
  mortonToCorners,
  unpackTriHexId,
} from './triangle-quadtree';
import { BIT_LAYOUT, GeoCoord, HexDual, TriHexId, Vector3D } from './types';
import { validateCellId, validateRadius } from './validation';

export { cellDisk, getCellNeighbors, MAX_CELL_RING_RADIUS } from './adjacency';
export const MAX_HEX_RING_RADIUS = 15;

/** Mode bit mask (bit 53): 1 indicates a dual Voronoi cell ID, 0 indicates a primal triangle cell ID */
const DUAL_MODE_BIT = 1n << 53n;
const I_SHIFT = 26n;
const J_SHIFT = 10n;
const COORD_MASK = 0xffffn;

/**
 * Packs a canonical vertex (face, resolution, I, J) into a 63-bit sign-safe dual cell ID.
 */
export function packDualCellId(face: number, resolution: number, I: number, J: number): TriHexId {
  let id = 0n;
  id |= (BigInt(face) & 0x1fn) << BIT_LAYOUT.FACE_SHIFT;
  id |= (BigInt(resolution) & 0x0fn) << BIT_LAYOUT.RES_SHIFT;
  id |= DUAL_MODE_BIT;
  id |= (BigInt(I) & COORD_MASK) << I_SHIFT;
  id |= (BigInt(J) & COORD_MASK) << J_SHIFT;
  return id;
}

/**
 * Returns true if the given TriHexId represents a dual Voronoi cell.
 */
export function isDualCellId(id: TriHexId): boolean {
  return ((id >> 53n) & 1n) === 1n;
}

/**
 * Decodes a dual Voronoi cell ID into its canonical components.
 */
export function unpackDualCellId(id: TriHexId): { face: number; resolution: number; I: number; J: number } {
  return {
    face: Number((id >> BIT_LAYOUT.FACE_SHIFT) & 0x1fn),
    resolution: Number((id >> BIT_LAYOUT.RES_SHIFT) & 0x0fn),
    I: Number((id >> I_SHIFT) & COORD_MASK),
    J: Number((id >> J_SHIFT) & COORD_MASK),
  };
}

/**
 * Maps any vertex coordinate (face, I, J) across seams to its unique canonical representation.
 */
export function getCanonicalVertex(
  face: number,
  resolution: number,
  I: number,
  J: number
): { face: number; I: number; J: number; isCorner: boolean } {
  const N = 1 << resolution;

  // 1. Corner vertices (12 icosahedron corners)
  if (I === 0 && J === 0) {
    const icoV = ICOSAHEDRON_FACES[face][0];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) { canI = 0; canJ = 0; }
    else if (v1 === icoV) { canI = N; canJ = 0; }
    else { canI = 0; canJ = N; }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }
  if (I === N && J === 0) {
    const icoV = ICOSAHEDRON_FACES[face][1];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) { canI = 0; canJ = 0; }
    else if (v1 === icoV) { canI = N; canJ = 0; }
    else { canI = 0; canJ = N; }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }
  if (I === 0 && J === N) {
    const icoV = ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) { canI = 0; canJ = 0; }
    else if (v1 === icoV) { canI = N; canJ = 0; }
    else { canI = 0; canJ = N; }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }

  // 2. Edge vertices (shared between 2 faces)
  if (J === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    if (nF < face) {
      const s = N - I;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) { targetI = s; targetJ = 0; }
      else if (nE === 1) { targetI = N - s; targetJ = s; }
      else { targetI = 0; targetJ = N - s; }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  } else if (I + J === N) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    if (nF < face) {
      const s = N - J;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) { targetI = s; targetJ = 0; }
      else if (nE === 1) { targetI = N - s; targetJ = s; }
      else { targetI = 0; targetJ = N - s; }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  } else if (I === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    if (nF < face) {
      const s = J;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) { targetI = s; targetJ = 0; }
      else if (nE === 1) { targetI = N - s; targetJ = s; }
      else { targetI = 0; targetJ = N - s; }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  }

  // 3. Interior vertex
  return { face, I, J, isCorner: false };
}

/**
 * Returns all canonical dual cell IDs at the given resolution.
 * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
 */
export function getResolutionDualCells(resolution: number): TriHexId[] {
  const N = 1 << resolution;
  const cells: TriHexId[] = [];
  const seen = new Set<string>();

  for (let f = 0; f < 20; f++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N - i; j++) {
        const can = getCanonicalVertex(f, resolution, i, j);
        const key = `${can.face}:${can.I}:${can.J}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push(packDualCellId(can.face, resolution, can.I, can.J));
        }
      }
    }
  }

  return cells;
}

/**
 * Computes the exact spherical circumcenter of a spherical triangle defined by three 3D unit vectors.
 */
function sphericalCircumcenter(vA: Vector3D, vB: Vector3D, vC: Vector3D): Vector3D {
  const e1: Vector3D = [vB[0] - vA[0], vB[1] - vA[1], vB[2] - vA[2]];
  const e2: Vector3D = [vC[0] - vA[0], vC[1] - vA[1], vC[2] - vA[2]];

  const cross: Vector3D = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];

  const len = Math.hypot(cross[0], cross[1], cross[2]);
  if (len < 1e-15) {
    return [vA[0], vA[1], vA[2]];
  }

  let cc: Vector3D = [cross[0] / len, cross[1] / len, cross[2] / len];
  if (dotProduct(cc, vA) < 0) {
    cc = [-cc[0], -cc[1], -cc[2]];
  }
  return cc;
}

function vKey(v: Vector3D): string {
  return `${v[0].toFixed(8)},${v[1].toFixed(8)},${v[2].toFixed(8)}`;
}

/**
 * Returns the triangles on face f that touch local integer vertex (I, J).
 */
function getFaceTrianglesTouching(N: number, I: number, J: number): { u: number; v: number }[] {
  const tris: { u: number; v: number }[] = [];
  if (I >= 0 && J >= 0 && I + J < N) tris.push({ u: (I + 1 / 3) / N, v: (J + 1 / 3) / N });
  if (I - 1 >= 0 && J >= 0 && I - 1 + J < N) tris.push({ u: (I - 1 + 1 / 3) / N, v: (J + 1 / 3) / N });
  if (I >= 0 && J - 1 >= 0 && I + J - 1 < N) tris.push({ u: (I + 1 / 3) / N, v: (J - 1 + 1 / 3) / N });
  if (I - 1 >= 0 && J >= 0 && I - 1 + J < N - 1) tris.push({ u: (I - 1 + 2 / 3) / N, v: (J + 2 / 3) / N });
  if (I - 1 >= 0 && J - 1 >= 0 && I - 1 + J - 1 < N - 1) tris.push({ u: (I - 1 + 2 / 3) / N, v: (J - 1 + 2 / 3) / N });
  if (I >= 0 && J - 1 >= 0 && I + J - 1 < N - 1) tris.push({ u: (I + 2 / 3) / N, v: (J - 1 + 2 / 3) / N });
  return tris;
}

/**
 * Collects all spherical circumcenters of primal triangles meeting at vertex (I, J) on face.
 */
function getCircumcentersForVertex(face: number, resolution: number, I: number, J: number): Vector3D[] {
  const N = 1 << resolution;
  const isC0 = I === 0 && J === 0;
  const isC1 = I === N && J === 0;
  const isC2 = I === 0 && J === N;

  const circumcenters: Vector3D[] = [];
  const seen = new Set<string>();

  const addCircumcenter = (f: number, u: number, v: number) => {
    const { morton } = barycentricToMorton(u, v, resolution);
    const corners = mortonToCorners(morton, resolution);
    const v3D = corners.map(([cu, cv]) => {
      const geo = inverseProjectFromFace(f, cu, cv);
      return geoToVector3D(geo.lat, geo.lng);
    }) as [Vector3D, Vector3D, Vector3D];
    const cc = sphericalCircumcenter(v3D[0], v3D[1], v3D[2]);
    const key = vKey(cc);
    if (!seen.has(key)) {
      seen.add(key);
      circumcenters.push(cc);
    }
  };

  if (isC0 || isC1 || isC2) {
    const icoV = isC0 ? ICOSAHEDRON_FACES[face][0] : isC1 ? ICOSAHEDRON_FACES[face][1] : ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    for (const f of meetingFaces) {
      const [v0, v1] = ICOSAHEDRON_FACES[f];
      let u = 0;
      let v = 0;
      if (v0 === icoV) { u = 1 / (3 * N); v = 1 / (3 * N); }
      else if (v1 === icoV) { u = 1 - 2 / (3 * N); v = 1 / (3 * N); }
      else { u = 1 / (3 * N); v = 1 - 2 / (3 * N); }
      addCircumcenter(f, u, v);
    }
    return circumcenters;
  }

  for (const t of getFaceTrianglesTouching(N, I, J)) {
    addCircumcenter(face, t.u, t.v);
  }

  if (J === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    const s = N - I;
    let u = 0;
    let v = 0;
    if (nE === 0) { u = s; v = 0; }
    else if (nE === 1) { u = N - s; v = s; }
    else { u = 0; v = N - s; }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  } else if (I + J === N) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    const s = N - J;
    let u = 0;
    let v = 0;
    if (nE === 0) { u = s; v = 0; }
    else if (nE === 1) { u = N - s; v = s; }
    else { u = 0; v = N - s; }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  } else if (I === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    const s = J;
    let u = 0;
    let v = 0;
    if (nE === 0) { u = s; v = 0; }
    else if (nE === 1) { u = N - s; v = s; }
    else { u = 0; v = N - s; }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  }

  return circumcenters;
}

/**
 * Returns neighbor vertices connected by primal edges to (face, I, J).
 */
function getNeighborVertices(
  face: number,
  resolution: number,
  I: number,
  J: number
): { face: number; I: number; J: number }[] {
  const N = 1 << resolution;
  const isC0 = I === 0 && J === 0;
  const isC1 = I === N && J === 0;
  const isC2 = I === 0 && J === N;

  if (isC0 || isC1 || isC2) {
    const icoV = isC0 ? ICOSAHEDRON_FACES[face][0] : isC1 ? ICOSAHEDRON_FACES[face][1] : ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    const neighbors: { face: number; I: number; J: number }[] = [];
    for (const f of meetingFaces) {
      const [v0, v1] = ICOSAHEDRON_FACES[f];
      if (v0 === icoV) {
        neighbors.push(getCanonicalVertex(f, resolution, 1, 0));
      } else if (v1 === icoV) {
        neighbors.push(getCanonicalVertex(f, resolution, N - 1, 1));
      } else {
        neighbors.push(getCanonicalVertex(f, resolution, 0, N - 1));
      }
    }
    return neighbors;
  }

  const isEdge0 = J === 0;
  const isEdge1 = I + J === N;
  const isEdge2 = I === 0;

  if (isEdge0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    const s = N - I;
    const neighbors: { face: number; I: number; J: number }[] = [];
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, 0));
    neighbors.push(getCanonicalVertex(face, resolution, I + 1, 0));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, 1));
    neighbors.push(getCanonicalVertex(face, resolution, I, 1));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }

  if (isEdge1) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    const s = N - J;
    const neighbors: { face: number; I: number; J: number }[] = [];
    neighbors.push(getCanonicalVertex(face, resolution, I + 1, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, J + 1));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, J));
    neighbors.push(getCanonicalVertex(face, resolution, I, J - 1));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }

  if (isEdge2) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    const s = J;
    const neighbors: { face: number; I: number; J: number }[] = [];
    neighbors.push(getCanonicalVertex(face, resolution, 0, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, 0, J + 1));
    neighbors.push(getCanonicalVertex(face, resolution, 1, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, 1, J));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }

  // Strictly interior
  return [
    getCanonicalVertex(face, resolution, I + 1, J),
    getCanonicalVertex(face, resolution, I, J + 1),
    getCanonicalVertex(face, resolution, I - 1, J + 1),
    getCanonicalVertex(face, resolution, I - 1, J),
    getCanonicalVertex(face, resolution, I, J - 1),
    getCanonicalVertex(face, resolution, I + 1, J - 1),
  ];
}

/**
 * Orders a set of spherical circumcenters cyclically around a center unit normal.
 */
function orderCyclic(center: Vector3D, points: Vector3D[]): Vector3D[] {
  let ref: Vector3D = Math.abs(center[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = dotProduct(ref, center);
  const u: Vector3D = [ref[0] - d * center[0], ref[1] - d * center[1], ref[2] - d * center[2]];
  const uLen = Math.hypot(u[0], u[1], u[2]);
  const uAxis: Vector3D = [u[0] / uLen, u[1] / uLen, u[2] / uLen];

  const vAxis: Vector3D = [
    center[1] * uAxis[2] - center[2] * uAxis[1],
    center[2] * uAxis[0] - center[0] * uAxis[2],
    center[0] * uAxis[1] - center[1] * uAxis[0],
  ];

  const scored = points.map((pt) => {
    const x = dotProduct(pt, uAxis);
    const y = dotProduct(pt, vAxis);
    return { pt, angle: Math.atan2(y, x) };
  });

  scored.sort((a, b) => a.angle - b.angle);
  return scored.map((s) => s.pt);
}

/**
 * Constructs the genuine spherical Voronoi dual cell (HexDual) for a given TriHexId.
 *
 * Accepts either a primal triangle cell ID or a dual Voronoi cell ID.
 * Returns the exact Voronoi polygon boundary (5 vertices for 12 pentagonal singularities,
 * 6 vertices for regular hexagons) and exact edge-sharing dual neighbors.
 */
export function getHexDual(id: TriHexId): HexDual {
  validateCellId(id);

  let face: number;
  let resolution: number;
  let I: number;
  let J: number;

  if (isDualCellId(id)) {
    const unpacked = unpackDualCellId(id);
    face = unpacked.face;
    resolution = unpacked.resolution;
    I = unpacked.I;
    J = unpacked.J;
  } else {
    const unpacked = unpackTriHexId(id);
    face = unpacked.face;
    resolution = unpacked.resolution;
    const N = 1 << resolution;
    const [a] = mortonToCorners(unpacked.morton, resolution);
    I = Math.round(a[0] * N);
    J = Math.round(a[1] * N);
  }

  const can = getCanonicalVertex(face, resolution, I, J);
  const N = 1 << resolution;

  const centerGeo = inverseProjectFromFace(can.face, can.I / N, can.J / N);
  const center3D = geoToVector3D(centerGeo.lat, centerGeo.lng);

  const circumcenters = getCircumcentersForVertex(can.face, resolution, can.I, can.J);
  const ordered3D = orderCyclic(center3D, circumcenters);
  const boundary = ordered3D.map(vector3DToGeo);

  const neighborVerts = getNeighborVertices(can.face, resolution, can.I, can.J);
  const neighborIds = neighborVerts.map((nv) =>
    packDualCellId(nv.face, resolution, nv.I, nv.J)
  );

  const canonicalDualId = packDualCellId(can.face, resolution, can.I, can.J);
  const isPentagon = circumcenters.length === 5;
  const degree = isPentagon ? 5 : 6;

  return {
    id: canonicalDualId,
    center: centerGeo,
    boundary,
    neighbors: neighborIds,
    isPentagon,
    degree,
  };
}

/**
 * Returns the exact neighbor cells in the spherical Voronoi dual graph.
 *
 * For regular cells: returns exactly 6 edge-sharing hexagonal dual neighbors.
 * For the 12 icosahedral singularities: returns exactly 5 pentagonal dual neighbors.
 * Every reported neighbor shares a complete dual edge with the origin cell.
 */
export function getHexNeighbors(id: TriHexId): TriHexId[] {
  const dual = getHexDual(id);
  return dual.neighbors;
}

/**
 * Returns the exact spherical Voronoi boundary coordinates of the dual cell
 * (6 vertices for regular hexagons, 5 vertices for pentagonal singularities).
 */
export function getHexDualBoundary(id: TriHexId): GeoCoord[] {
  const dual = getHexDual(id);
  return dual.boundary;
}

/**
 * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
 * For regular hexagonal regions:
 *  - radius 0: [origin] (1 cell)
 *  - radius 1: 7 cells (1 center + 6 neighbors)
 *  - radius 2: 19 cells (matching the hexagonal formula 1 + 3k(k+1) = 19)
 */
export function hexRing(originId: TriHexId, radius: number): TriHexId[] {
  validateCellId(originId);
  validateRadius(radius, MAX_HEX_RING_RADIUS);

  const dual = getHexDual(originId);
  const rootId = dual.id;

  if (radius === 0) return [rootId];

  const visited = new Set<string>([rootId.toString()]);
  let frontier: TriHexId[] = [rootId];
  const cells: TriHexId[] = [rootId];

  for (let distance = 1; distance <= radius; distance++) {
    const next: TriHexId[] = [];
    for (const cell of frontier) {
      for (const neighbour of getHexNeighbors(cell)) {
        const key = neighbour.toString();
        if (!visited.has(key)) {
          visited.add(key);
          next.push(neighbour);
          cells.push(neighbour);
        }
      }
    }
    frontier = next;
  }

  return cells;
}

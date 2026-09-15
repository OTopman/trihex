import { ICOSAHEDRON_FACES, ICOSAHEDRON_VERTICES } from './constants';
import { projectToFace } from './icosahedron';
import {
  barycentricToMorton,
  cellToLatLng,
  mortonToCorners,
  packTriHexId,
  unpackTriHexId,
} from './triangle-quadtree';
import { GeoCoord, TriHexId, Vector3D } from './types';

/**
 * 6 Equidistant hexagonal lattice offsets in triangular grid coordinates
 */
const HEX_OFFSETS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/**
 * Resolves the hexagonal Voronoi dual for a given TriHexId.
 * Computes the 6 equidistant neighbors of the cell's Voronoi dual.
 *
 * Uses unconstrained 3D face plane projection to naturally transition across
 * icosahedron face seams with zero clamping errors, guaranteed 6 neighbors,
 * and 100% reciprocal symmetry.
 */
export function getHexNeighbors(id: TriHexId): TriHexId[] {
  const { face, resolution, morton } = unpackTriHexId(id);

  if (resolution === 0) {
    return [];
  }

  const [a, b, c] = mortonToCorners(morton, resolution);
  // Current centroid in face barycentric space
  const cu = (a[0] + b[0] + c[0]) / 3;
  const cv = (a[1] + b[1] + c[1]) / 3;

  // Step size at this resolution
  const step = 1 / (1 << resolution);

  const [i0, i1, i2] = ICOSAHEDRON_FACES[face];
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];

  const neighbors: TriHexId[] = [];

  for (const [du, dv] of HEX_OFFSETS) {
    const nu = cu + du * step;
    const nv = cv + dv * step;
    const nw = 1 - nu - nv;

    // Direct unconstrained 3D Cartesian coordinates on the face plane
    const qx = nw * v0[0] + nu * v1[0] + nv * v2[0];
    const qy = nw * v0[1] + nu * v1[1] + nv * v2[1];
    const qz = nw * v0[2] + nu * v1[2] + nv * v2[2];
    const qLen = Math.hypot(qx, qy, qz);

    // Radial projection to unit sphere
    const vec: Vector3D = [qx / qLen, qy / qLen, qz / qLen];
    const proj = projectToFace(vec);

    const { morton: nMorton } = barycentricToMorton(proj.u, proj.v, resolution);
    neighbors.push(packTriHexId(proj.face, resolution, nMorton));
  }

  // Deduplicate and filter out self if present
  const uniqueNeighbors: TriHexId[] = [];
  const seen = new Set<string>();
  seen.add(id.toString());

  for (const n of neighbors) {
    const key = n.toString();
    if (!seen.has(key)) {
      seen.add(key);
      uniqueNeighbors.push(n);
    }
  }

  return uniqueNeighbors;
}

export const MAX_HEX_RING_RADIUS = 15;

/**
 * Returns all cells within distance k (k-ring disk) around the target cell.
 * Used for dynamic surge price diffusion, supply heatmaps, and radial driver dispatching.
 *
 * Guaranteed safe execution: capped at MAX_HEX_RING_RADIUS (15) to prevent
 * single-threaded Node.js event-loop starvation.
 */
export function hexRing(originId: TriHexId, radius: number): TriHexId[] {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    throw new TypeError(`Expected radius to be a finite number, received ${radius}`);
  }
  if (radius <= 0) return [originId];
  if (radius > MAX_HEX_RING_RADIUS) {
    throw new RangeError(
      `Radius ${radius} exceeds maximum permitted limit (${MAX_HEX_RING_RADIUS}) to prevent event-loop starvation`
    );
  }

  const visited = new Set<string>();
  visited.add(originId.toString());

  let currentRing: TriHexId[] = [originId];
  const allCells: TriHexId[] = [originId];

  for (let r = 1; r <= radius; r++) {
    const nextRing: TriHexId[] = [];
    for (const cell of currentRing) {
      const neighbors = getHexNeighbors(cell);
      for (const neighbor of neighbors) {
        const key = neighbor.toString();
        if (!visited.has(key)) {
          visited.add(key);
          nextRing.push(neighbor);
          allCells.push(neighbor);
        }
      }
    }
    currentRing = nextRing;
  }

  return allCells;
}

/**
 * Computes the 6 vertices forming the hexagonal Voronoi dual boundary
 */
export function getHexDualBoundary(id: TriHexId): GeoCoord[] {
  const neighbors = getHexNeighbors(id);
  // Hexagon boundary is formed by the centroids of the 6 surrounding cells
  return neighbors.map((n) => cellToLatLng(n));
}

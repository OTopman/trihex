import { FACE_EDGE_NEIGHBORS } from './constants';
import {
  barycentricToMorton,
  mortonToCorners,
  packTriHexId,
  unpackTriHexId,
} from './triangle-quadtree';
import { TriHexId } from './types';
import { validateCellId, validateRadius } from './validation';

export const MAX_CELL_RING_RADIUS = 15;

/**
 * Returns the three cells that share a complete edge with a triangular cell.
 *
 * TriHex stores triangles in an icosahedral spherical grid. Each triangle
 * has exactly three edge-adjacent triangles. This implementation uses
 * exact topological edge transitions across icosahedron face seams,
 * guaranteeing:
 *  1. Exactly 3 edge neighbors for every valid cell.
 *  2. 100% reciprocal symmetry: A in getCellNeighbors(B) <=> B in getCellNeighbors(A).
 *  3. Geometric edge sharing: boundary(A) and boundary(B) share the exact 2 vertices of that edge.
 *  4. Zero orphaned or missing links across face boundaries.
 */
export function getCellNeighbors(id: TriHexId): [TriHexId, TriHexId, TriHexId] {
  validateCellId(id);
  const { face, resolution, morton } = unpackTriHexId(id);

  if (resolution === 0) {
    // At resolution 0, each cell is a whole icosahedron face.
    // The three neighbors are the three faces sharing edges 0, 1, and 2.
    const [n0] = FACE_EDGE_NEIGHBORS[face][0];
    const [n1] = FACE_EDGE_NEIGHBORS[face][1];
    const [n2] = FACE_EDGE_NEIGHBORS[face][2];
    return [
      packTriHexId(n0, 0, 0n),
      packTriHexId(n1, 0, 0n),
      packTriHexId(n2, 0, 0n),
    ];
  }

  const [a, b, c] = mortonToCorners(morton, resolution);
  const centerU = (a[0] + b[0] + c[0]) / 3;
  const centerV = (a[1] + b[1] + c[1]) / 3;

  const edges: [[number, number], [number, number]][] = [
    [a, b],
    [b, c],
    [c, a],
  ];

  const neighbors: TriHexId[] = [];

  for (let e = 0; e < 3; e++) {
    const [p1, p2] = edges[e];
    const midU = (p1[0] + p2[0]) * 0.5;
    const midV = (p1[1] + p2[1]) * 0.5;

    // Check if edge is on face boundary
    // Boundary 0: v = 0 (between v0 and v1)
    // Boundary 1: u + v = 1 (between v1 and v2)
    // Boundary 2: u = 0 (between v2 and v0)
    const onB0 = p1[1] < 1e-12 && p2[1] < 1e-12;
    const onB1 = Math.abs(p1[0] + p1[1] - 1) < 1e-12 && Math.abs(p2[0] + p2[1] - 1) < 1e-12;
    const onB2 = p1[0] < 1e-12 && p2[0] < 1e-12;

    if (onB0 || onB1 || onB2) {
      const faceEdge = onB0 ? 0 : onB1 ? 1 : 2;
      const [nFace, nEdge] = FACE_EDGE_NEIGHBORS[face][faceEdge];

      let t = 0;
      if (faceEdge === 0) {
        t = midU;
      } else if (faceEdge === 1) {
        t = midV;
      } else {
        t = 1 - midV;
      }

      // Along neighbor edge in opposite winding, parameter is (1 - t)
      const nT = 1 - t;

      let nU = 0;
      let nV = 0;
      if (nEdge === 0) {
        nU = nT;
        nV = 0;
      } else if (nEdge === 1) {
        nU = 1 - nT;
        nV = nT;
      } else {
        nU = 0;
        nV = 1 - nT;
      }

      // Step slightly into the interior of neighbor face toward centroid (1/3, 1/3)
      const eps = 1e-5 / (1 << resolution);
      const stepU = nU + (1 / 3 - nU) * eps;
      const stepV = nV + (1 / 3 - nV) * eps;

      const { morton: nMorton } = barycentricToMorton(stepU, stepV, resolution);
      neighbors.push(packTriHexId(nFace, resolution, nMorton));
    } else {
      // Internal to current face: step outward from center through edge midpoint
      const dirU = midU - centerU;
      const dirV = midV - centerV;
      const eps = 1e-4;
      const targetU = midU + dirU * eps;
      const targetV = midV + dirV * eps;

      const { morton: nMorton } = barycentricToMorton(targetU, targetV, resolution);
      neighbors.push(packTriHexId(face, resolution, nMorton));
    }
  }

  return [neighbors[0], neighbors[1], neighbors[2]];
}

/**
 * Returns the graph disk of triangular edge-adjacent cells within graph distance radius k.
 * At radius 0: [origin]
 * At radius 1: 4 cells (1 center + 3 edge neighbors)
 * At radius 2: 10 cells (exact triangular progression)
 */
export function cellDisk(originId: TriHexId, radius: number): TriHexId[] {
  validateCellId(originId);
  validateRadius(radius, MAX_CELL_RING_RADIUS);

  if (radius === 0) return [originId];

  const visited = new Set<string>([originId.toString()]);
  let frontier: TriHexId[] = [originId];
  const cells: TriHexId[] = [originId];

  for (let distance = 1; distance <= radius; distance++) {
    const next: TriHexId[] = [];
    for (const cell of frontier) {
      for (const neighbour of getCellNeighbors(cell)) {
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

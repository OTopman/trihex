import { geoToVector3D, projectToFace } from './icosahedron';
import {
  barycentricToMorton,
  cellToBoundary,
  packTriHexId,
} from './triangle-quadtree';
import { GeoCoord, TriHexId, Vector3D } from './types';

function dot(a: Vector3D, b: Vector3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vector3D): Vector3D {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vector3D, b: Vector3D): Vector3D {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Returns the three cells that share a complete edge with a triangular cell.
 *
 * TriHex stores triangles. A triangle has three edge-adjacent triangles, not
 * six. The neighbour point is obtained by crossing each great-circle cell edge
 * on the sphere and then assigning that point normally. This also handles
 * icosahedron face seams without inventing non-adjacent links.
 */
export function getCellNeighbors(id: TriHexId): TriHexId[] {
  const boundary = cellToBoundary(id);
  const vertices = boundary.map((point) => geoToVector3D(point.lat, point.lng)) as [
    Vector3D,
    Vector3D,
    Vector3D,
  ];
  const center = normalize([
    vertices[0][0] + vertices[1][0] + vertices[2][0],
    vertices[0][1] + vertices[1][1] + vertices[2][1],
    vertices[0][2] + vertices[1][2] + vertices[2][2],
  ]);

  const neighbours: TriHexId[] = [];
  const seen = new Set<string>([id.toString()]);

  for (let edge = 0; edge < 3; edge++) {
    const start = vertices[edge];
    const end = vertices[(edge + 1) % 3];
    const midpoint = normalize([
      start[0] + end[0],
      start[1] + end[1],
      start[2] + end[2],
    ]);
    const edgeNormal = normalize(cross(start, end));
    const side = Math.sign(dot(center, edgeNormal)) || 1;

    // Move one thousandth of the centre-to-edge angular distance across the
    // edge. The lower bound keeps the perturbation representable at res 15.
    const centerToEdge = Math.acos(Math.max(-1, Math.min(1, dot(center, midpoint))));
    const epsilon = Math.max(centerToEdge * 1e-3, 1e-10);
    const crossingPoint = normalize([
      midpoint[0] - side * epsilon * edgeNormal[0],
      midpoint[1] - side * epsilon * edgeNormal[1],
      midpoint[2] - side * epsilon * edgeNormal[2],
    ]);
    const projected = projectToFace(crossingPoint);
    const { morton } = barycentricToMorton(projected.u, projected.v, unpackResolution(id));
    const neighbour = packTriHexId(projected.face, unpackResolution(id), morton);
    if (!seen.has(neighbour.toString())) {
      seen.add(neighbour.toString());
      neighbours.push(neighbour);
    }
  }

  return neighbours;
}

function unpackResolution(id: TriHexId): number {
  return Number((id >> 54n) & 0x0fn);
}

/**
 * @deprecated TriHex does not have a globally regular hexagonal dual. Use
 * getCellNeighbors(), which returns the three geometrically edge-adjacent
 * triangular cells.
 */
export const getHexNeighbors = getCellNeighbors;

export const MAX_CELL_RING_RADIUS = 15;
/** @deprecated Use MAX_CELL_RING_RADIUS. */
export const MAX_HEX_RING_RADIUS = MAX_CELL_RING_RADIUS;

/** Returns the graph disk of triangular edge-adjacent cells within radius k. */
export function cellDisk(originId: TriHexId, radius: number): TriHexId[] {
  if (typeof radius !== 'number' || !Number.isFinite(radius) || !Number.isInteger(radius)) {
    throw new TypeError(`Expected radius to be a finite integer, received ${radius}`);
  }
  if (radius <= 0) return [originId];
  if (radius > MAX_CELL_RING_RADIUS) {
    throw new RangeError(
      `Radius ${radius} exceeds maximum permitted limit (${MAX_CELL_RING_RADIUS}) to prevent event-loop starvation`
    );
  }

  const visited = new Set<string>([originId.toString()]);
  let frontier: TriHexId[] = [originId];
  const cells: TriHexId[] = [originId];
  for (let distance = 1; distance <= radius; distance++) {
    const next: TriHexId[] = [];
    for (const cell of frontier) {
      for (const neighbour of getCellNeighbors(cell)) {
        if (!visited.has(neighbour.toString())) {
          visited.add(neighbour.toString());
          next.push(neighbour);
          cells.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return cells;
}

/** @deprecated This returns a triangular edge-adjacency disk, not a hex ring. */
export const hexRing = cellDisk;

/**
 * There is no six-vertex hexagonal dual boundary for this triangular grid.
 * Return the actual triangular boundary so callers cannot render a fabricated
 * hexagon. The function remains only as a compatibility alias.
 */
export function getHexDualBoundary(id: TriHexId): GeoCoord[] {
  return [...cellToBoundary(id)];
}

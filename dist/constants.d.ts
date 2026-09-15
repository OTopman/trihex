import { Vector3D } from './types';
/**
 * 12 Vertices of a regular icosahedron on the unit sphere
 */
export declare const ICOSAHEDRON_VERTICES: Vector3D[];
/**
 * 20 Triangular Faces of a regular icosahedron
 * Vertices arranged counter-clockwise when viewed from outside
 */
export declare const ICOSAHEDRON_FACES: [number, number, number][];
/**
 * Precomputed Face Normals (unit vectors perpendicular to each face plane)
 */
export declare const FACE_NORMALS: Vector3D[];
/**
 * Precomputed Face Centroids on unit sphere
 */
export declare const FACE_CENTROIDS: Vector3D[];
/**
 * Precomputed 30-edge face adjacency table.
 * For each face f (0..19) and edge e (0..2):
 * Edge 0: v0 -> v1 (v = 0)
 * Edge 1: v1 -> v2 (u + v = 1)
 * Edge 2: v2 -> v0 (u = 0)
 *
 * Returns [neighborFace, neighborEdge] where the neighbor edge traverses
 * the same two vertices in opposite winding.
 */
export declare const FACE_EDGE_NEIGHBORS: [number, number][][];
/**
 * Precomputed mapping of each icosahedron vertex (0..11) to the 5 faces meeting at it,
 * arranged in consecutive cyclic order around the vertex.
 */
export declare const VERTEX_FACES: number[][];

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

import { FaceCoord, GeoCoord, Vector3D } from './types';
/**
 * Convert Latitude and Longitude in degrees to 3D Cartesian coordinates on unit sphere
 */
export declare function geoToVector3D(lat: number, lng: number): Vector3D;
/**
 * Convert 3D Cartesian unit vector to Latitude and Longitude in degrees
 */
export declare function vector3DToGeo(v: Vector3D): GeoCoord;
/**
 * Compute dot product of two 3D vectors
 */
export declare function dotProduct(a: Vector3D, b: Vector3D): number;
/**
 * Compute cross product of two 3D vectors
 */
export declare function crossProduct(a: Vector3D, b: Vector3D): Vector3D;
/**
 * Project a 3D unit vector onto the icosahedron face it lies within.
 * Returns face index (0-19) and normalized barycentric coordinates (u, v)
 * where u >= 0, v >= 0, and u + v <= 1.
 */
export declare function projectToFace(vec: Vector3D): FaceCoord;
/**
 * Inverse project from face and barycentric coordinates (u, v) back to unit sphere (lat, lng)
 */
export declare function inverseProjectFromFace(face: number, u: number, v: number): GeoCoord;

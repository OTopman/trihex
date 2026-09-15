import {
  FACE_NORMALS,
  ICOSAHEDRON_FACES,
  ICOSAHEDRON_VERTICES
} from './constants';
import { FaceCoord, GeoCoord, Vector3D } from './types';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Convert Latitude and Longitude in degrees to 3D Cartesian coordinates on unit sphere
 */
export function geoToVector3D(lat: number, lng: number): Vector3D {
  const phi = lat * DEG2RAD;
  const lambda = lng * DEG2RAD;
  const cosPhi = Math.cos(phi);

  return [
    cosPhi * Math.cos(lambda),
    cosPhi * Math.sin(lambda),
    Math.sin(phi),
  ];
}

/**
 * Convert 3D Cartesian unit vector to Latitude and Longitude in degrees
 */
export function vector3DToGeo(v: Vector3D): GeoCoord {
  const len = Math.hypot(v[0], v[1], v[2]);
  const x = v[0] / len;
  const y = v[1] / len;
  const z = Math.max(-1, Math.min(1, v[2] / len));

  const lat = Math.asin(z) * RAD2DEG;
  const lng = Math.atan2(y, x) * RAD2DEG;

  return { lat, lng };
}

/**
 * Compute dot product of two 3D vectors
 */
export function dotProduct(a: Vector3D, b: Vector3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Compute cross product of two 3D vectors
 */
export function crossProduct(a: Vector3D, b: Vector3D): Vector3D {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Project a 3D unit vector onto the icosahedron face it lies within.
 * Returns face index (0-19) and normalized barycentric coordinates (u, v)
 * where u >= 0, v >= 0, and u + v <= 1.
 */
export function projectToFace(vec: Vector3D): FaceCoord {
  let bestFace = 0;
  let bestMinBary = -Infinity;
  let bestU = 0;
  let bestV = 0;

  for (let f = 0; f < 20; f++) {
    const normal = FACE_NORMALS[f];
    const pDotN = dotProduct(vec, normal);
    if (pDotN <= 0.05) {
      // Face is on the opposite side of the sphere
      continue;
    }

    const [i0, i1, i2] = ICOSAHEDRON_FACES[f];
    const v0 = ICOSAHEDRON_VERTICES[i0];
    const v1 = ICOSAHEDRON_VERTICES[i1];
    const v2 = ICOSAHEDRON_VERTICES[i2];

    const d = dotProduct(v0, normal);
    const scale = d / pDotN;
    // Intersection point Q on the face plane
    const q: Vector3D = [vec[0] * scale, vec[1] * scale, vec[2] * scale];

    // Compute barycentric coordinates (u, v) using edge vectors
    const e1: Vector3D = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2: Vector3D = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const qp: Vector3D = [q[0] - v0[0], q[1] - v0[1], q[2] - v0[2]];

    const d00 = dotProduct(e1, e1);
    const d01 = dotProduct(e1, e2);
    const d11 = dotProduct(e2, e2);
    const d20 = dotProduct(qp, e1);
    const d21 = dotProduct(qp, e2);

    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) < 1e-12) continue;

    const u = (d11 * d20 - d01 * d21) / denom;
    const v = (d00 * d21 - d01 * d20) / denom;
    const w = 1 - u - v;

    const minBary = Math.min(u, v, w);

    if (minBary >= -1e-9) {
      // Exact hit inside face
      return {
        face: f,
        u: Math.max(0, Math.min(1, u)),
        v: Math.max(0, Math.min(1, v)),
      };
    }

    if (minBary > bestMinBary) {
      bestMinBary = minBary;
      bestFace = f;
      bestU = Math.max(0, Math.min(1, u));
      bestV = Math.max(0, Math.min(1, v));
    }
  }

  // Ensure u + v <= 1 for safety
  if (bestU + bestV > 1) {
    const sum = bestU + bestV;
    bestU /= sum;
    bestV /= sum;
  }

  return { face: bestFace, u: bestU, v: bestV };
}

/**
 * Inverse project from face and barycentric coordinates (u, v) back to unit sphere (lat, lng)
 */
export function inverseProjectFromFace(face: number, u: number, v: number): GeoCoord {
  const [i0, i1, i2] = ICOSAHEDRON_FACES[face];
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];

  const w = 1 - u - v;

  const q: Vector3D = [
    w * v0[0] + u * v1[0] + v * v2[0],
    w * v0[1] + u * v1[1] + v * v2[1],
    w * v0[2] + u * v1[2] + v * v2[2],
  ];

  return vector3DToGeo(q);
}

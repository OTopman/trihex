"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FACE_CENTROIDS = exports.FACE_NORMALS = exports.ICOSAHEDRON_FACES = exports.ICOSAHEDRON_VERTICES = void 0;
// Golden ratio phi = (1 + sqrt(5)) / 2
const PHI = (1 + Math.sqrt(5)) / 2;
// Normalization factor: sqrt(1 + PHI^2)
const NORM = Math.sqrt(1 + PHI * PHI);
const A = 1 / NORM;
const B = PHI / NORM;
/**
 * 12 Vertices of a regular icosahedron on the unit sphere
 */
exports.ICOSAHEDRON_VERTICES = [
    [-A, B, 0], // 0
    [A, B, 0], // 1
    [-A, -B, 0], // 2
    [A, -B, 0], // 3
    [0, -A, B], // 4
    [0, A, B], // 5
    [0, -A, -B], // 6
    [0, A, -B], // 7
    [B, 0, -A], // 8
    [B, 0, A], // 9
    [-B, 0, -A], // 10
    [-B, 0, A], // 11
];
/**
 * 20 Triangular Faces of a regular icosahedron
 * Vertices arranged counter-clockwise when viewed from outside
 */
exports.ICOSAHEDRON_FACES = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
];
/**
 * Precomputed Face Normals (unit vectors perpendicular to each face plane)
 */
exports.FACE_NORMALS = exports.ICOSAHEDRON_FACES.map(([i0, i1, i2]) => {
    const v0 = exports.ICOSAHEDRON_VERTICES[i0];
    const v1 = exports.ICOSAHEDRON_VERTICES[i1];
    const v2 = exports.ICOSAHEDRON_VERTICES[i2];
    // (v1 - v0) x (v2 - v0)
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const cross = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const len = Math.hypot(cross[0], cross[1], cross[2]);
    return [cross[0] / len, cross[1] / len, cross[2] / len];
});
/**
 * Precomputed Face Centroids on unit sphere
 */
exports.FACE_CENTROIDS = exports.ICOSAHEDRON_FACES.map(([i0, i1, i2]) => {
    const v0 = exports.ICOSAHEDRON_VERTICES[i0];
    const v1 = exports.ICOSAHEDRON_VERTICES[i1];
    const v2 = exports.ICOSAHEDRON_VERTICES[i2];
    const cx = (v0[0] + v1[0] + v2[0]) / 3;
    const cy = (v0[1] + v1[1] + v2[1]) / 3;
    const cz = (v0[2] + v1[2] + v2[2]) / 3;
    const len = Math.hypot(cx, cy, cz);
    return [cx / len, cy / len, cz / len];
});

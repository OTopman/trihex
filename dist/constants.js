"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERTEX_FACES = exports.FACE_EDGE_NEIGHBORS = exports.FACE_CENTROIDS = exports.FACE_NORMALS = exports.ICOSAHEDRON_FACES = exports.ICOSAHEDRON_VERTICES = void 0;
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
exports.FACE_EDGE_NEIGHBORS = (() => {
    const neighbors = Array.from({ length: 20 }, () => []);
    for (let f = 0; f < 20; f++) {
        const [v0, v1, v2] = exports.ICOSAHEDRON_FACES[f];
        const fEdges = [[v0, v1], [v1, v2], [v2, v0]];
        for (let e = 0; e < 3; e++) {
            const [a, b] = fEdges[e];
            let matched = false;
            for (let f2 = 0; f2 < 20; f2++) {
                if (f === f2)
                    continue;
                const [u0, u1, u2] = exports.ICOSAHEDRON_FACES[f2];
                const f2Edges = [[u0, u1], [u1, u2], [u2, u0]];
                for (let e2 = 0; e2 < 3; e2++) {
                    const [c, d] = f2Edges[e2];
                    if (a === d && b === c) {
                        neighbors[f][e] = [f2, e2];
                        matched = true;
                        break;
                    }
                }
                if (matched)
                    break;
            }
            if (!matched) {
                throw new Error(`Icosahedron seam topology error: no matching edge for face ${f} edge ${e}`);
            }
        }
    }
    return neighbors;
})();
/**
 * Precomputed mapping of each icosahedron vertex (0..11) to the 5 faces meeting at it,
 * arranged in consecutive cyclic order around the vertex.
 */
exports.VERTEX_FACES = (() => {
    const vFaces = Array.from({ length: 12 }, () => []);
    for (let f = 0; f < 20; f++) {
        const [v0, v1, v2] = exports.ICOSAHEDRON_FACES[f];
        vFaces[v0].push(f);
        vFaces[v1].push(f);
        vFaces[v2].push(f);
    }
    // Order faces cyclically around each vertex
    for (let v = 0; v < 12; v++) {
        const faces = vFaces[v];
        const ordered = [faces[0]];
        const remaining = new Set(faces.slice(1));
        while (remaining.size > 0) {
            const current = ordered[ordered.length - 1];
            let nextFace = null;
            for (let e = 0; e < 3; e++) {
                const [nF] = exports.FACE_EDGE_NEIGHBORS[current][e];
                if (remaining.has(nF)) {
                    nextFace = nF;
                    break;
                }
            }
            if (nextFace !== null) {
                ordered.push(nextFace);
                remaining.delete(nextFace);
            }
            else {
                break;
            }
        }
        vFaces[v] = ordered;
    }
    return vFaces;
})();

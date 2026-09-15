"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.packTriHexId = packTriHexId;
exports.unpackTriHexId = unpackTriHexId;
exports.barycentricToMorton = barycentricToMorton;
exports.mortonToCorners = mortonToCorners;
exports.cellToParent = cellToParent;
exports.cellToChildrenRange = cellToChildrenRange;
exports.cellToLatLng = cellToLatLng;
exports.cellToBoundary = cellToBoundary;
const icosahedron_1 = require("./icosahedron");
const types_1 = require("./types");
/**
 * Encodes face, resolution, and morton code into a 64-bit TriHexId (63-bit non-negative).
 * Optional dualSector and topoCluster are accepted for backward compatibility.
 */
function packTriHexId(face, resolution, morton, _dualSector = 0, _topoCluster = 0) {
    if (!Number.isInteger(face) || face < 0 || face >= types_1.BIT_LAYOUT.TOTAL_FACES) {
        throw new RangeError(`Face ${face} must be an integer between 0 and ${types_1.BIT_LAYOUT.TOTAL_FACES - 1}`);
    }
    if (!Number.isInteger(resolution) || resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new RangeError(`Resolution ${resolution} must be an integer between 0 and ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
    }
    if (typeof morton !== 'bigint' || morton < 0n || morton >= (1n << BigInt(resolution * 2))) {
        throw new RangeError(`Morton code ${morton} is invalid for resolution ${resolution}`);
    }
    let id = 0n;
    id |= (BigInt(face) & 0x1fn) << types_1.BIT_LAYOUT.FACE_SHIFT;
    id |= (BigInt(resolution) & 0x0fn) << types_1.BIT_LAYOUT.RES_SHIFT;
    id |= (morton & types_1.BIT_LAYOUT.MORTON_MASK) << types_1.BIT_LAYOUT.MORTON_SHIFT;
    return id;
}
/**
 * Decodes a 64-bit TriHexId into its component fields.
 * Returns face, resolution, and morton code.
 */
function unpackTriHexId(id) {
    return {
        face: Number((id >> types_1.BIT_LAYOUT.FACE_SHIFT) & 0x1fn),
        resolution: Number((id >> types_1.BIT_LAYOUT.RES_SHIFT) & 0x0fn),
        morton: (id >> types_1.BIT_LAYOUT.MORTON_SHIFT) & types_1.BIT_LAYOUT.MORTON_MASK,
        dualSector: 0,
        topoCluster: 0,
    };
}
/**
 * Given barycentric coordinates (u, v) on a face, computes the 1:4 triangular
 * Morton code at the specified resolution (0 to 15).
 */
function barycentricToMorton(u, v, resolution) {
    let a = [0, 0];
    let b = [1, 0];
    let c = [0, 1];
    let morton = 0n;
    for (let r = 0; r < resolution; r++) {
        // Relative coordinates in current (a, b, c)
        const e1 = [b[0] - a[0], b[1] - a[1]];
        const e2 = [c[0] - a[0], c[1] - a[1]];
        const d = [u - a[0], v - a[1]];
        const det = e1[0] * e2[1] - e1[1] * e2[0];
        const wB = Math.abs(det) > 1e-15 ? (d[0] * e2[1] - d[1] * e2[0]) / det : 0;
        const wC = Math.abs(det) > 1e-15 ? (e1[0] * d[1] - e1[1] * d[0]) / det : 0;
        const wA = 1 - wB - wC;
        const mab = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
        const mbc = [(b[0] + c[0]) * 0.5, (b[1] + c[1]) * 0.5];
        const mca = [(c[0] + a[0]) * 0.5, (c[1] + a[1]) * 0.5];
        let quad = 3;
        if (wA >= 0.5) {
            quad = 0;
            b = mab;
            c = mca;
        }
        else if (wB >= 0.5) {
            quad = 1;
            a = mab;
            c = mbc;
        }
        else if (wC >= 0.5) {
            quad = 2;
            a = mca;
            b = mbc;
        }
        else {
            quad = 3;
            a = mab;
            b = mbc;
            c = mca;
        }
        morton = (morton << 2n) | BigInt(quad);
    }
    return { morton, corners: [a, b, c] };
}
/**
 * Reconstruct the 3 corners in barycentric coordinates for a given morton code and resolution
 */
function mortonToCorners(morton, resolution) {
    let a = [0, 0];
    let b = [1, 0];
    let c = [0, 1];
    for (let r = resolution - 1; r >= 0; r--) {
        const shift = BigInt(r * 2);
        const quad = Number((morton >> shift) & 0x03n);
        const mab = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
        const mbc = [(b[0] + c[0]) * 0.5, (b[1] + c[1]) * 0.5];
        const mca = [(c[0] + a[0]) * 0.5, (c[1] + a[1]) * 0.5];
        if (quad === 0) {
            b = mab;
            c = mca;
        }
        else if (quad === 1) {
            a = mab;
            c = mbc;
        }
        else if (quad === 2) {
            a = mca;
            b = mbc;
        }
        else {
            a = mab;
            b = mbc;
            c = mca;
        }
    }
    return [a, b, c];
}
/**
 * Returns the parent TriHexId at a coarser resolution using exact bit-shift.
 */
function cellToParent(id, targetResolution) {
    const { face, resolution, morton } = unpackTriHexId(id);
    const targetRes = targetResolution ?? resolution - 1;
    if (targetRes < 0 || targetRes > resolution) {
        throw new Error(`Target resolution ${targetRes} must be between 0 and current resolution ${resolution}`);
    }
    const diff = BigInt(resolution - targetRes);
    const parentMorton = morton >> (diff * 2n);
    return packTriHexId(face, targetRes, parentMorton);
}
/**
 * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
 * at a finer targetResolution for instant B-Tree SQL index scans.
 *
 * Guarantees dense interval: end - start + 1 == 4^(targetResolution - resolution)
 */
function cellToChildrenRange(id, targetResolution) {
    const { face, resolution, morton } = unpackTriHexId(id);
    if (targetResolution < resolution || targetResolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new Error(`Target resolution ${targetResolution} must be >= current resolution ${resolution} and <= ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
    }
    const diff = BigInt(targetResolution - resolution);
    const startMorton = morton << (diff * 2n);
    const count = 1n << (diff * 2n);
    const endMorton = startMorton + count - 1n;
    return {
        start: packTriHexId(face, targetResolution, startMorton),
        end: packTriHexId(face, targetResolution, endMorton),
    };
}
/**
 * Returns the center geographic coordinates (lat, lng) of a TriHex cell
 */
function cellToLatLng(id) {
    const { face, resolution, morton } = unpackTriHexId(id);
    const [a, b, c] = mortonToCorners(morton, resolution);
    const u = (a[0] + b[0] + c[0]) / 3;
    const v = (a[1] + b[1] + c[1]) / 3;
    return (0, icosahedron_1.inverseProjectFromFace)(face, u, v);
}
/**
 * Returns the 3 boundary vertices of the triangular cell
 */
function cellToBoundary(id) {
    const { face, resolution, morton } = unpackTriHexId(id);
    const [a, b, c] = mortonToCorners(morton, resolution);
    return [
        (0, icosahedron_1.inverseProjectFromFace)(face, a[0], a[1]),
        (0, icosahedron_1.inverseProjectFromFace)(face, b[0], b[1]),
        (0, icosahedron_1.inverseProjectFromFace)(face, c[0], c[1]),
    ];
}

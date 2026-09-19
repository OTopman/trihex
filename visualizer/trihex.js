// src/constants.ts
var PHI = (1 + Math.sqrt(5)) / 2;
var NORM = Math.sqrt(1 + PHI * PHI);
var A = 1 / NORM;
var B = PHI / NORM;
var ICOSAHEDRON_VERTICES = [
  [-A, B, 0],
  // 0
  [A, B, 0],
  // 1
  [-A, -B, 0],
  // 2
  [A, -B, 0],
  // 3
  [0, -A, B],
  // 4
  [0, A, B],
  // 5
  [0, -A, -B],
  // 6
  [0, A, -B],
  // 7
  [B, 0, -A],
  // 8
  [B, 0, A],
  // 9
  [-B, 0, -A],
  // 10
  [-B, 0, A]
  // 11
];
var ICOSAHEDRON_FACES = [
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
  [9, 8, 1]
];
var FACE_NORMALS = ICOSAHEDRON_FACES.map(([i0, i1, i2]) => {
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const cross = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ];
  const len = Math.hypot(cross[0], cross[1], cross[2]);
  return [cross[0] / len, cross[1] / len, cross[2] / len];
});
var FACE_CENTROIDS = ICOSAHEDRON_FACES.map(([i0, i1, i2]) => {
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];
  const cx = (v0[0] + v1[0] + v2[0]) / 3;
  const cy = (v0[1] + v1[1] + v2[1]) / 3;
  const cz = (v0[2] + v1[2] + v2[2]) / 3;
  const len = Math.hypot(cx, cy, cz);
  return [cx / len, cy / len, cz / len];
});
var FACE_EDGE_NEIGHBORS = (() => {
  const neighbors = Array.from({ length: 20 }, () => []);
  for (let f = 0; f < 20; f++) {
    const [v0, v1, v2] = ICOSAHEDRON_FACES[f];
    const fEdges = [[v0, v1], [v1, v2], [v2, v0]];
    for (let e = 0; e < 3; e++) {
      const [a, b] = fEdges[e];
      let matched = false;
      for (let f2 = 0; f2 < 20; f2++) {
        if (f === f2) continue;
        const [u0, u1, u2] = ICOSAHEDRON_FACES[f2];
        const f2Edges = [[u0, u1], [u1, u2], [u2, u0]];
        for (let e2 = 0; e2 < 3; e2++) {
          const [c, d] = f2Edges[e2];
          if (a === d && b === c) {
            neighbors[f][e] = [f2, e2];
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (!matched) {
        throw new Error(`Icosahedron seam topology error: no matching edge for face ${f} edge ${e}`);
      }
    }
  }
  return neighbors;
})();
var VERTEX_FACES = (() => {
  const vFaces = Array.from({ length: 12 }, () => []);
  for (let f = 0; f < 20; f++) {
    const [v0, v1, v2] = ICOSAHEDRON_FACES[f];
    vFaces[v0].push(f);
    vFaces[v1].push(f);
    vFaces[v2].push(f);
  }
  for (let v = 0; v < 12; v++) {
    const faces = vFaces[v];
    const ordered = [faces[0]];
    const remaining = new Set(faces.slice(1));
    while (remaining.size > 0) {
      const current = ordered[ordered.length - 1];
      let nextFace = null;
      for (let e = 0; e < 3; e++) {
        const [nF] = FACE_EDGE_NEIGHBORS[current][e];
        if (remaining.has(nF)) {
          nextFace = nF;
          break;
        }
      }
      if (nextFace !== null) {
        ordered.push(nextFace);
        remaining.delete(nextFace);
      } else {
        break;
      }
    }
    vFaces[v] = ordered;
  }
  return vFaces;
})();

// src/icosahedron.ts
var DEG2RAD = Math.PI / 180;
var RAD2DEG = 180 / Math.PI;
var EARTH_RADIUS_METERS = 63710088e-1;
function geoToVector3D(lat, lng) {
  const phi = lat * DEG2RAD;
  const lambda = lng * DEG2RAD;
  const cosPhi = Math.cos(phi);
  return [
    cosPhi * Math.cos(lambda),
    cosPhi * Math.sin(lambda),
    Math.sin(phi)
  ];
}
function vector3DToGeo(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-15) {
    return { lat: 0, lng: 0 };
  }
  const x = v[0] / len;
  const y = v[1] / len;
  const z = Math.max(-1, Math.min(1, v[2] / len));
  const lat = Math.asin(z) * RAD2DEG;
  const lng = Math.atan2(y, x) * RAD2DEG;
  return { lat, lng };
}
function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-15) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}
function slerp(v0, v1, t) {
  let dot = dotProduct(v0, v1);
  dot = Math.max(-1, Math.min(1, dot));
  if (dot > 0.999995) {
    return normalize([
      v0[0] + t * (v1[0] - v0[0]),
      v0[1] + t * (v1[1] - v0[1]),
      v0[2] + t * (v1[2] - v0[2])
    ]);
  }
  const theta0 = Math.acos(dot);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * (sinTheta / sinTheta0);
  const s1 = sinTheta / sinTheta0;
  return [
    s0 * v0[0] + s1 * v1[0],
    s0 * v0[1] + s1 * v1[1],
    s0 * v0[2] + s1 * v1[2]
  ];
}
function geodesicDistance(coordA, coordB) {
  const lat1 = coordA.lat * DEG2RAD;
  const lat2 = coordB.lat * DEG2RAD;
  const dLat = (coordB.lat - coordA.lat) * DEG2RAD;
  const dLng = (coordB.lng - coordA.lng) * DEG2RAD;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_METERS * c;
}
function projectToFace(vec) {
  let bestFace = 0;
  let bestMinBary = -Infinity;
  let bestU = 0;
  let bestV = 0;
  for (let f = 0; f < 20; f++) {
    const normal = FACE_NORMALS[f];
    const pDotN = dotProduct(vec, normal);
    if (pDotN <= 0.05) {
      continue;
    }
    const [i0, i1, i2] = ICOSAHEDRON_FACES[f];
    const v0 = ICOSAHEDRON_VERTICES[i0];
    const v1 = ICOSAHEDRON_VERTICES[i1];
    const v2 = ICOSAHEDRON_VERTICES[i2];
    const d = dotProduct(v0, normal);
    const scale = d / pDotN;
    const q = [vec[0] * scale, vec[1] * scale, vec[2] * scale];
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const qp = [q[0] - v0[0], q[1] - v0[1], q[2] - v0[2]];
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
      let clampedU = Math.max(0, Math.min(1, u));
      let clampedV = Math.max(0, Math.min(1, v));
      if (clampedU + clampedV > 1) {
        const sum = clampedU + clampedV;
        clampedU /= sum;
        clampedV /= sum;
      }
      return {
        face: f,
        u: clampedU,
        v: clampedV
      };
    }
    if (minBary > bestMinBary) {
      bestMinBary = minBary;
      bestFace = f;
      bestU = Math.max(0, Math.min(1, u));
      bestV = Math.max(0, Math.min(1, v));
    }
  }
  if (bestU + bestV > 1) {
    const sum = bestU + bestV;
    bestU /= sum;
    bestV /= sum;
  }
  return { face: bestFace, u: bestU, v: bestV };
}
function inverseProjectFromFace(face, u, v) {
  const [i0, i1, i2] = ICOSAHEDRON_FACES[face];
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];
  const w = 1 - u - v;
  const q = [
    w * v0[0] + u * v1[0] + v * v2[0],
    w * v0[1] + u * v1[1] + v * v2[1],
    w * v0[2] + u * v1[2] + v * v2[2]
  ];
  return vector3DToGeo(q);
}
function faceBarycentricToVector3D(face, u, v) {
  const [i0, i1, i2] = ICOSAHEDRON_FACES[face];
  const v0 = ICOSAHEDRON_VERTICES[i0];
  const v1 = ICOSAHEDRON_VERTICES[i1];
  const v2 = ICOSAHEDRON_VERTICES[i2];
  const w = 1 - u - v;
  return normalize([
    w * v0[0] + u * v1[0] + v * v2[0],
    w * v0[1] + u * v1[1] + v * v2[1],
    w * v0[2] + u * v1[2] + v * v2[2]
  ]);
}

// src/types.ts
var BIT_LAYOUT = {
  FACE_BITS: 5n,
  RES_BITS: 4n,
  MORTON_BITS: 54n,
  FACE_SHIFT: 58n,
  RES_SHIFT: 54n,
  MORTON_SHIFT: 0n,
  FACE_MASK: 0x1fn << 58n,
  RES_MASK: 0x0fn << 54n,
  MORTON_MASK: (1n << 54n) - 1n,
  SIGN_GUARD_BIT: 63n,
  MAX_SIGNED_INT64: 0x7fffffffffffffffn,
  MAX_RESOLUTION: 15,
  TOTAL_FACES: 20,
  TOTAL_VERTICES: 12,
  TOTAL_EDGES: 30
};
var EDGE_BIT_LAYOUT = {
  EDGE_FLAG_BIT: 52n,
  EDGE_FLAG_MASK: 1n << 52n,
  EDGE_INDEX_SHIFT: 49n,
  EDGE_INDEX_BITS: 3n,
  EDGE_INDEX_MASK: 0x7n << 49n,
  ORIGIN_MASK: ~(1n << 52n | 0x7n << 49n) & BIT_LAYOUT.MAX_SIGNED_INT64
};

// src/validation.ts
var HEX_STRING_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;
function validateCellId(id) {
  if (typeof id !== "bigint") {
    throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
  }
  if (id < 0n || id > BIT_LAYOUT.MAX_SIGNED_INT64) {
    throw new RangeError(
      `TriHexId 0x${id.toString(16)} is out of signed 63-bit range [0, 0x7fffffffffffffff]`
    );
  }
  const face = Number(id >> BIT_LAYOUT.FACE_SHIFT & 0x1fn);
  if (face < 0 || face >= BIT_LAYOUT.TOTAL_FACES) {
    throw new RangeError(
      `TriHexId 0x${id.toString(16)} has invalid face ${face} (must be 0..${BIT_LAYOUT.TOTAL_FACES - 1})`
    );
  }
  const resolution = Number(id >> BIT_LAYOUT.RES_SHIFT & 0x0fn);
  if (resolution < 0 || resolution > BIT_LAYOUT.MAX_RESOLUTION) {
    throw new RangeError(
      `TriHexId 0x${id.toString(16)} has invalid resolution ${resolution} (must be 0..${BIT_LAYOUT.MAX_RESOLUTION})`
    );
  }
  const isDual = (id >> 53n & 1n) === 1n;
  if (isDual) {
    const reservedHigh = id >> 42n & 0x7ffn;
    if (reservedHigh !== 0n) {
      throw new RangeError(
        `Dual TriHexId 0x${id.toString(16)} has non-zero reserved padding bits 42..52 (0x${reservedHigh.toString(16)})`
      );
    }
    const reservedLow = id & 0x3ffn;
    if (reservedLow !== 0n) {
      throw new RangeError(
        `Dual TriHexId 0x${id.toString(16)} has non-zero reserved padding bits 0..9 (0x${reservedLow.toString(16)})`
      );
    }
    const N = 1 << resolution;
    const I = Number(id >> 26n & 0xffffn);
    const J = Number(id >> 10n & 0xffffn);
    if (I < 0 || J < 0 || I + J > N) {
      throw new RangeError(
        `Dual TriHexId 0x${id.toString(16)} has invalid coordinates (${I}, ${J}) for resolution ${resolution} (N=${N})`
      );
    }
  } else {
    const maxMortonForRes = resolution === 0 ? 0n : (1n << BigInt(resolution * 2)) - 1n;
    const lowerBits = id & (1n << 54n) - 1n;
    if (lowerBits > maxMortonForRes) {
      throw new RangeError(
        `TriHexId 0x${id.toString(16)} has non-zero reserved bits or Morton code 0x${lowerBits.toString(16)} exceeding resolution ${resolution} capacity (max 0x${maxMortonForRes.toString(16)})`
      );
    }
  }
  if ((id & 1n << BIT_LAYOUT.SIGN_GUARD_BIT) !== 0n) {
    throw new RangeError(`TriHexId 0x${id.toString(16)} has sign bit set`);
  }
}
function isValidCell(input) {
  try {
    let id;
    if (typeof input === "string") {
      const clean = input.trim();
      if (!HEX_STRING_REGEX.test(clean)) return false;
      id = BigInt(clean.startsWith("0x") ? clean : `0x${clean}`);
    } else if (typeof input === "bigint") {
      id = input;
    } else {
      return false;
    }
    validateCellId(id);
    return true;
  } catch {
    return false;
  }
}
function validateCoordinates(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError(
      `Coordinates must be finite numbers. Received lat=${lat}, lng=${lng}`
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new RangeError(
      `Coordinates out of bounds: lat=${lat} (must be [-90, 90]), lng=${lng} (must be [-180, 180])`
    );
  }
}
function validateResolution(resolution) {
  if (typeof resolution !== "number" || !Number.isInteger(resolution) || resolution < 0 || resolution > BIT_LAYOUT.MAX_RESOLUTION) {
    throw new RangeError(
      `Resolution ${resolution} is invalid. Must be an integer between 0 and ${BIT_LAYOUT.MAX_RESOLUTION}`
    );
  }
}
function validateRadius(radius, maxRadius = 15) {
  if (typeof radius !== "number" || !Number.isInteger(radius)) {
    throw new TypeError(`Radius must be an integer. Received ${radius}`);
  }
  if (radius < 0) {
    throw new RangeError(`Radius must be non-negative. Received ${radius}`);
  }
  if (radius > maxRadius) {
    throw new RangeError(
      `Radius ${radius} exceeds maximum permitted limit (${maxRadius}) to prevent event-loop starvation`
    );
  }
}

// src/triangle-quadtree.ts
function packTriHexId(face, resolution, morton, _dualSector = 0, _topoCluster = 0) {
  if (typeof face !== "number" || !Number.isInteger(face) || face < 0 || face >= BIT_LAYOUT.TOTAL_FACES) {
    throw new RangeError(`Face ${face} must be an integer between 0 and ${BIT_LAYOUT.TOTAL_FACES - 1}`);
  }
  if (typeof resolution !== "number" || !Number.isInteger(resolution) || resolution < 0 || resolution > BIT_LAYOUT.MAX_RESOLUTION) {
    throw new RangeError(`Resolution ${resolution} must be an integer between 0 and ${BIT_LAYOUT.MAX_RESOLUTION}`);
  }
  if (typeof morton !== "bigint") {
    throw new TypeError(`Morton code must be a BigInt, received ${typeof morton}`);
  }
  const maxMorton = resolution === 0 ? 0n : (1n << BigInt(resolution * 2)) - 1n;
  if (morton < 0n || morton > maxMorton) {
    throw new RangeError(`Morton code ${morton} is invalid for resolution ${resolution} (must be in [0, ${maxMorton}])`);
  }
  let id = 0n;
  id |= BigInt(face) << BIT_LAYOUT.FACE_SHIFT;
  id |= BigInt(resolution) << BIT_LAYOUT.RES_SHIFT;
  id |= morton << BIT_LAYOUT.MORTON_SHIFT;
  return id;
}
function unpackTriHexId(id) {
  validateCellId(id);
  return {
    face: Number(id >> BIT_LAYOUT.FACE_SHIFT & 0x1fn),
    resolution: Number(id >> BIT_LAYOUT.RES_SHIFT & 0x0fn),
    morton: id & BIT_LAYOUT.MORTON_MASK,
    dualSector: 0,
    topoCluster: 0
  };
}
function barycentricToMorton(u, v, resolution) {
  let a = [0, 0];
  let b = [1, 0];
  let c = [0, 1];
  let morton = 0n;
  for (let r = 0; r < resolution; r++) {
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
    } else if (wB >= 0.5) {
      quad = 1;
      a = mab;
      c = mbc;
    } else if (wC >= 0.5) {
      quad = 2;
      a = mca;
      b = mbc;
    } else {
      quad = 3;
      a = mab;
      b = mbc;
      c = mca;
    }
    morton = morton << 2n | BigInt(quad);
  }
  return { morton, corners: [a, b, c] };
}
function mortonToCorners(morton, resolution) {
  let a = [0, 0];
  let b = [1, 0];
  let c = [0, 1];
  for (let r = resolution - 1; r >= 0; r--) {
    const shift = BigInt(r * 2);
    const quad = Number(morton >> shift & 0x03n);
    const mab = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
    const mbc = [(b[0] + c[0]) * 0.5, (b[1] + c[1]) * 0.5];
    const mca = [(c[0] + a[0]) * 0.5, (c[1] + a[1]) * 0.5];
    if (quad === 0) {
      b = mab;
      c = mca;
    } else if (quad === 1) {
      a = mab;
      c = mbc;
    } else if (quad === 2) {
      a = mca;
      b = mbc;
    } else {
      a = mab;
      b = mbc;
      c = mca;
    }
  }
  return [a, b, c];
}
function cellToParent(id, targetResolution) {
  const { face, resolution, morton } = unpackTriHexId(id);
  const targetRes = targetResolution ?? resolution - 1;
  validateResolution(targetRes);
  if (targetRes > resolution) {
    throw new RangeError(
      `Target resolution ${targetRes} must be <= current resolution ${resolution}`
    );
  }
  const diff = BigInt(resolution - targetRes);
  const parentMorton = morton >> diff * 2n;
  return packTriHexId(face, targetRes, parentMorton);
}
function cellToChildrenRange(id, targetResolution) {
  const { face, resolution, morton } = unpackTriHexId(id);
  validateResolution(targetResolution);
  if (targetResolution < resolution) {
    throw new RangeError(
      `Target resolution ${targetResolution} must be >= current resolution ${resolution}`
    );
  }
  const diff = BigInt(targetResolution - resolution);
  const startMorton = morton << diff * 2n;
  const count = 1n << diff * 2n;
  const endMorton = startMorton + count - 1n;
  return {
    start: packTriHexId(face, targetResolution, startMorton),
    end: packTriHexId(face, targetResolution, endMorton)
  };
}
function cellToChildren(id, targetResolution) {
  const { face, resolution } = unpackTriHexId(id);
  const targetRes = targetResolution ?? resolution + 1;
  const range = cellToChildrenRange(id, targetRes);
  const children = [];
  for (let childId = range.start; childId <= range.end; childId++) {
    children.push(childId);
  }
  return children;
}
function cellToLatLng(id) {
  const { face, resolution, morton } = unpackTriHexId(id);
  const [a, b, c] = mortonToCorners(morton, resolution);
  const u = (a[0] + b[0] + c[0]) / 3;
  const v = (a[1] + b[1] + c[1]) / 3;
  return inverseProjectFromFace(face, u, v);
}
function cellToBoundary(id) {
  const { face, resolution, morton } = unpackTriHexId(id);
  const [a, b, c] = mortonToCorners(morton, resolution);
  return [
    inverseProjectFromFace(face, a[0], a[1]),
    inverseProjectFromFace(face, b[0], b[1]),
    inverseProjectFromFace(face, c[0], c[1])
  ];
}
var getCellBoundary = cellToBoundary;

// src/adjacency.ts
var MAX_CELL_RING_RADIUS = 15;
function getCellNeighbors(id) {
  validateCellId(id);
  const { face, resolution, morton } = unpackTriHexId(id);
  if (resolution === 0) {
    const [n0] = FACE_EDGE_NEIGHBORS[face][0];
    const [n1] = FACE_EDGE_NEIGHBORS[face][1];
    const [n2] = FACE_EDGE_NEIGHBORS[face][2];
    return [
      packTriHexId(n0, 0, 0n),
      packTriHexId(n1, 0, 0n),
      packTriHexId(n2, 0, 0n)
    ];
  }
  const [a, b, c] = mortonToCorners(morton, resolution);
  const centerU = (a[0] + b[0] + c[0]) / 3;
  const centerV = (a[1] + b[1] + c[1]) / 3;
  const edges = [
    [a, b],
    [b, c],
    [c, a]
  ];
  const neighbors = [];
  for (let e = 0; e < 3; e++) {
    const [p1, p2] = edges[e];
    const midU = (p1[0] + p2[0]) * 0.5;
    const midV = (p1[1] + p2[1]) * 0.5;
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
      const eps = 1e-5 / (1 << resolution);
      const stepU = nU + (1 / 3 - nU) * eps;
      const stepV = nV + (1 / 3 - nV) * eps;
      const { morton: nMorton } = barycentricToMorton(stepU, stepV, resolution);
      neighbors.push(packTriHexId(nFace, resolution, nMorton));
    } else {
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
function cellDisk(originId, radius) {
  validateCellId(originId);
  validateRadius(radius, MAX_CELL_RING_RADIUS);
  if (radius === 0) return [originId];
  const visited = /* @__PURE__ */ new Set([originId.toString()]);
  let frontier = [originId];
  const cells = [originId];
  for (let distance = 1; distance <= radius; distance++) {
    const next = [];
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
var getCellDisk = cellDisk;

// src/compaction.ts
function compactCells(cells) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return [];
  }
  const uniqueCells = /* @__PURE__ */ new Set();
  for (const c of cells) {
    validateCellId(c);
    uniqueCells.add(c);
  }
  const allCellStrings = /* @__PURE__ */ new Set();
  for (const c of uniqueCells) {
    allCellStrings.add(c.toString());
  }
  const prunedCells = [];
  for (const c of uniqueCells) {
    const { resolution } = unpackTriHexId(c);
    let hasAncestor = false;
    for (let r = resolution - 1; r >= 0; r--) {
      const ancestor = cellToParent(c, r);
      if (allCellStrings.has(ancestor.toString())) {
        hasAncestor = true;
        break;
      }
    }
    if (!hasAncestor) {
      prunedCells.push(c);
    }
  }
  const resBuckets = /* @__PURE__ */ new Map();
  for (let r = 0; r <= BIT_LAYOUT.MAX_RESOLUTION; r++) {
    resBuckets.set(r, /* @__PURE__ */ new Set());
  }
  for (const c of prunedCells) {
    const { resolution } = unpackTriHexId(c);
    resBuckets.get(resolution).add(c.toString());
  }
  for (let r = BIT_LAYOUT.MAX_RESOLUTION; r >= 1; r--) {
    const currentBucket = resBuckets.get(r);
    if (currentBucket.size === 0) continue;
    const parentGroups = /* @__PURE__ */ new Map();
    for (const cellStr of currentBucket) {
      const cellId = BigInt(cellStr);
      const parentId = cellToParent(cellId, r - 1);
      const parentKey = parentId.toString();
      if (!parentGroups.has(parentKey)) {
        parentGroups.set(parentKey, []);
      }
      parentGroups.get(parentKey).push(cellStr);
    }
    for (const [parentKey, siblings] of parentGroups.entries()) {
      if (siblings.length === 4) {
        for (const s of siblings) {
          currentBucket.delete(s);
        }
        resBuckets.get(r - 1).add(parentKey);
      }
    }
  }
  const compacted = [];
  for (let r = 0; r <= BIT_LAYOUT.MAX_RESOLUTION; r++) {
    for (const cellStr of resBuckets.get(r)) {
      compacted.push(BigInt(cellStr));
    }
  }
  compacted.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return compacted;
}
function uncompactCells(cells, targetResolution) {
  validateResolution(targetResolution);
  if (!Array.isArray(cells) || cells.length === 0) {
    return [];
  }
  const uncompactedSet = /* @__PURE__ */ new Set();
  const uncompacted = [];
  for (const cell of cells) {
    validateCellId(cell);
    const { resolution } = unpackTriHexId(cell);
    if (resolution === targetResolution) {
      const key = cell.toString();
      if (!uncompactedSet.has(key)) {
        uncompactedSet.add(key);
        uncompacted.push(cell);
      }
    } else if (resolution < targetResolution) {
      const range = cellToChildrenRange(cell, targetResolution);
      for (let childId = range.start; childId <= range.end; childId++) {
        const key = childId.toString();
        if (!uncompactedSet.has(key)) {
          uncompactedSet.add(key);
          uncompacted.push(childId);
        }
      }
    } else {
      throw new RangeError(
        `Cannot uncompact cell at resolution ${resolution} to coarser target resolution ${targetResolution}`
      );
    }
  }
  uncompacted.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return uncompacted;
}

// src/hex-dual.ts
var MAX_HEX_RING_RADIUS = 15;
var DUAL_MODE_BIT = 1n << 53n;
var I_SHIFT = 26n;
var J_SHIFT = 10n;
var COORD_MASK = 0xffffn;
function packDualCellId(face, resolution, I, J) {
  let id = 0n;
  id |= (BigInt(face) & 0x1fn) << BIT_LAYOUT.FACE_SHIFT;
  id |= (BigInt(resolution) & 0x0fn) << BIT_LAYOUT.RES_SHIFT;
  id |= DUAL_MODE_BIT;
  id |= (BigInt(I) & COORD_MASK) << I_SHIFT;
  id |= (BigInt(J) & COORD_MASK) << J_SHIFT;
  return id;
}
function isDualCellId(id) {
  return (id >> 53n & 1n) === 1n;
}
function unpackDualCellId(id) {
  return {
    face: Number(id >> BIT_LAYOUT.FACE_SHIFT & 0x1fn),
    resolution: Number(id >> BIT_LAYOUT.RES_SHIFT & 0x0fn),
    I: Number(id >> I_SHIFT & COORD_MASK),
    J: Number(id >> J_SHIFT & COORD_MASK)
  };
}
function getCanonicalVertex(face, resolution, I, J) {
  const N = 1 << resolution;
  if (I === 0 && J === 0) {
    const icoV = ICOSAHEDRON_FACES[face][0];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) {
      canI = 0;
      canJ = 0;
    } else if (v1 === icoV) {
      canI = N;
      canJ = 0;
    } else {
      canI = 0;
      canJ = N;
    }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }
  if (I === N && J === 0) {
    const icoV = ICOSAHEDRON_FACES[face][1];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) {
      canI = 0;
      canJ = 0;
    } else if (v1 === icoV) {
      canI = N;
      canJ = 0;
    } else {
      canI = 0;
      canJ = N;
    }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }
  if (I === 0 && J === N) {
    const icoV = ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    const canFace = Math.min(...meetingFaces);
    const [v0, v1] = ICOSAHEDRON_FACES[canFace];
    let canI = 0;
    let canJ = 0;
    if (v0 === icoV) {
      canI = 0;
      canJ = 0;
    } else if (v1 === icoV) {
      canI = N;
      canJ = 0;
    } else {
      canI = 0;
      canJ = N;
    }
    return { face: canFace, I: canI, J: canJ, isCorner: true };
  }
  if (J === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    if (nF < face) {
      const s = N - I;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) {
        targetI = s;
        targetJ = 0;
      } else if (nE === 1) {
        targetI = N - s;
        targetJ = s;
      } else {
        targetI = 0;
        targetJ = N - s;
      }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  } else if (I + J === N) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    if (nF < face) {
      const s = N - J;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) {
        targetI = s;
        targetJ = 0;
      } else if (nE === 1) {
        targetI = N - s;
        targetJ = s;
      } else {
        targetI = 0;
        targetJ = N - s;
      }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  } else if (I === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    if (nF < face) {
      const s = J;
      let targetI = 0;
      let targetJ = 0;
      if (nE === 0) {
        targetI = s;
        targetJ = 0;
      } else if (nE === 1) {
        targetI = N - s;
        targetJ = s;
      } else {
        targetI = 0;
        targetJ = N - s;
      }
      return { face: nF, I: targetI, J: targetJ, isCorner: false };
    }
  }
  return { face, I, J, isCorner: false };
}
function getResolutionDualCells(resolution) {
  const N = 1 << resolution;
  const cells = [];
  const seen = /* @__PURE__ */ new Set();
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N - i; j++) {
        const can = getCanonicalVertex(f, resolution, i, j);
        const key = `${can.face}:${can.I}:${can.J}`;
        if (!seen.has(key)) {
          seen.add(key);
          cells.push(packDualCellId(can.face, resolution, can.I, can.J));
        }
      }
    }
  }
  return cells;
}
function sphericalCircumcenter(vA, vB, vC) {
  const e1 = [vB[0] - vA[0], vB[1] - vA[1], vB[2] - vA[2]];
  const e2 = [vC[0] - vA[0], vC[1] - vA[1], vC[2] - vA[2]];
  const cross = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ];
  const len = Math.hypot(cross[0], cross[1], cross[2]);
  if (len < 1e-15) {
    return [vA[0], vA[1], vA[2]];
  }
  let cc = [cross[0] / len, cross[1] / len, cross[2] / len];
  if (dotProduct(cc, vA) < 0) {
    cc = [-cc[0], -cc[1], -cc[2]];
  }
  return cc;
}
function vKey(v) {
  return `${v[0].toFixed(8)},${v[1].toFixed(8)},${v[2].toFixed(8)}`;
}
function getFaceTrianglesTouching(N, I, J) {
  const tris = [];
  if (I >= 0 && J >= 0 && I + J < N) tris.push({ u: (I + 1 / 3) / N, v: (J + 1 / 3) / N });
  if (I - 1 >= 0 && J >= 0 && I - 1 + J < N) tris.push({ u: (I - 1 + 1 / 3) / N, v: (J + 1 / 3) / N });
  if (I >= 0 && J - 1 >= 0 && I + J - 1 < N) tris.push({ u: (I + 1 / 3) / N, v: (J - 1 + 1 / 3) / N });
  if (I - 1 >= 0 && J >= 0 && I - 1 + J < N - 1) tris.push({ u: (I - 1 + 2 / 3) / N, v: (J + 2 / 3) / N });
  if (I - 1 >= 0 && J - 1 >= 0 && I - 1 + J - 1 < N - 1) tris.push({ u: (I - 1 + 2 / 3) / N, v: (J - 1 + 2 / 3) / N });
  if (I >= 0 && J - 1 >= 0 && I + J - 1 < N - 1) tris.push({ u: (I + 2 / 3) / N, v: (J - 1 + 2 / 3) / N });
  return tris;
}
function getCircumcentersForVertex(face, resolution, I, J) {
  const N = 1 << resolution;
  const isC0 = I === 0 && J === 0;
  const isC1 = I === N && J === 0;
  const isC2 = I === 0 && J === N;
  const circumcenters = [];
  const seen = /* @__PURE__ */ new Set();
  const addCircumcenter = (f, u, v) => {
    const { morton } = barycentricToMorton(u, v, resolution);
    const corners = mortonToCorners(morton, resolution);
    const v3D = corners.map(([cu, cv]) => {
      const geo = inverseProjectFromFace(f, cu, cv);
      return geoToVector3D(geo.lat, geo.lng);
    });
    const cc = sphericalCircumcenter(v3D[0], v3D[1], v3D[2]);
    const key = vKey(cc);
    if (!seen.has(key)) {
      seen.add(key);
      circumcenters.push(cc);
    }
  };
  if (isC0 || isC1 || isC2) {
    const icoV = isC0 ? ICOSAHEDRON_FACES[face][0] : isC1 ? ICOSAHEDRON_FACES[face][1] : ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    for (const f of meetingFaces) {
      const [v0, v1] = ICOSAHEDRON_FACES[f];
      let u = 0;
      let v = 0;
      if (v0 === icoV) {
        u = 1 / (3 * N);
        v = 1 / (3 * N);
      } else if (v1 === icoV) {
        u = 1 - 2 / (3 * N);
        v = 1 / (3 * N);
      } else {
        u = 1 / (3 * N);
        v = 1 - 2 / (3 * N);
      }
      addCircumcenter(f, u, v);
    }
    return circumcenters;
  }
  for (const t of getFaceTrianglesTouching(N, I, J)) {
    addCircumcenter(face, t.u, t.v);
  }
  if (J === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    const s = N - I;
    let u = 0;
    let v = 0;
    if (nE === 0) {
      u = s;
      v = 0;
    } else if (nE === 1) {
      u = N - s;
      v = s;
    } else {
      u = 0;
      v = N - s;
    }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  } else if (I + J === N) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    const s = N - J;
    let u = 0;
    let v = 0;
    if (nE === 0) {
      u = s;
      v = 0;
    } else if (nE === 1) {
      u = N - s;
      v = s;
    } else {
      u = 0;
      v = N - s;
    }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  } else if (I === 0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    const s = J;
    let u = 0;
    let v = 0;
    if (nE === 0) {
      u = s;
      v = 0;
    } else if (nE === 1) {
      u = N - s;
      v = s;
    } else {
      u = 0;
      v = N - s;
    }
    for (const t of getFaceTrianglesTouching(N, u, v)) {
      addCircumcenter(nF, t.u, t.v);
    }
  }
  return circumcenters;
}
function getNeighborVertices(face, resolution, I, J) {
  const N = 1 << resolution;
  const isC0 = I === 0 && J === 0;
  const isC1 = I === N && J === 0;
  const isC2 = I === 0 && J === N;
  if (isC0 || isC1 || isC2) {
    const icoV = isC0 ? ICOSAHEDRON_FACES[face][0] : isC1 ? ICOSAHEDRON_FACES[face][1] : ICOSAHEDRON_FACES[face][2];
    const meetingFaces = VERTEX_FACES[icoV];
    const neighbors = [];
    for (const f of meetingFaces) {
      const [v0, v1] = ICOSAHEDRON_FACES[f];
      if (v0 === icoV) {
        neighbors.push(getCanonicalVertex(f, resolution, 1, 0));
      } else if (v1 === icoV) {
        neighbors.push(getCanonicalVertex(f, resolution, N - 1, 1));
      } else {
        neighbors.push(getCanonicalVertex(f, resolution, 0, N - 1));
      }
    }
    return neighbors;
  }
  const isEdge0 = J === 0;
  const isEdge1 = I + J === N;
  const isEdge2 = I === 0;
  if (isEdge0) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][0];
    const s = N - I;
    const neighbors = [];
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, 0));
    neighbors.push(getCanonicalVertex(face, resolution, I + 1, 0));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, 1));
    neighbors.push(getCanonicalVertex(face, resolution, I, 1));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }
  if (isEdge1) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][1];
    const s = N - J;
    const neighbors = [];
    neighbors.push(getCanonicalVertex(face, resolution, I + 1, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, J + 1));
    neighbors.push(getCanonicalVertex(face, resolution, I - 1, J));
    neighbors.push(getCanonicalVertex(face, resolution, I, J - 1));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }
  if (isEdge2) {
    const [nF, nE] = FACE_EDGE_NEIGHBORS[face][2];
    const s = J;
    const neighbors = [];
    neighbors.push(getCanonicalVertex(face, resolution, 0, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, 0, J + 1));
    neighbors.push(getCanonicalVertex(face, resolution, 1, J - 1));
    neighbors.push(getCanonicalVertex(face, resolution, 1, J));
    if (nE === 0) {
      neighbors.push(getCanonicalVertex(nF, resolution, s - 1, 1));
      neighbors.push(getCanonicalVertex(nF, resolution, s, 1));
    } else if (nE === 1) {
      neighbors.push(getCanonicalVertex(nF, resolution, N - s - 1, s));
      neighbors.push(getCanonicalVertex(nF, resolution, N - s, s - 1));
    } else {
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s));
      neighbors.push(getCanonicalVertex(nF, resolution, 1, N - s - 1));
    }
    return neighbors;
  }
  return [
    getCanonicalVertex(face, resolution, I + 1, J),
    getCanonicalVertex(face, resolution, I, J + 1),
    getCanonicalVertex(face, resolution, I - 1, J + 1),
    getCanonicalVertex(face, resolution, I - 1, J),
    getCanonicalVertex(face, resolution, I, J - 1),
    getCanonicalVertex(face, resolution, I + 1, J - 1)
  ];
}
function orderCyclic(center, points) {
  let ref = Math.abs(center[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = dotProduct(ref, center);
  const u = [ref[0] - d * center[0], ref[1] - d * center[1], ref[2] - d * center[2]];
  const uLen = Math.hypot(u[0], u[1], u[2]);
  const uAxis = [u[0] / uLen, u[1] / uLen, u[2] / uLen];
  const vAxis = [
    center[1] * uAxis[2] - center[2] * uAxis[1],
    center[2] * uAxis[0] - center[0] * uAxis[2],
    center[0] * uAxis[1] - center[1] * uAxis[0]
  ];
  const scored = points.map((pt) => {
    const x = dotProduct(pt, uAxis);
    const y = dotProduct(pt, vAxis);
    return { pt, angle: Math.atan2(y, x) };
  });
  scored.sort((a, b) => a.angle - b.angle);
  return scored.map((s) => s.pt);
}
function getHexDual(id) {
  validateCellId(id);
  let face;
  let resolution;
  let I;
  let J;
  if (isDualCellId(id)) {
    const unpacked = unpackDualCellId(id);
    face = unpacked.face;
    resolution = unpacked.resolution;
    I = unpacked.I;
    J = unpacked.J;
  } else {
    const unpacked = unpackTriHexId(id);
    face = unpacked.face;
    resolution = unpacked.resolution;
    const N2 = 1 << resolution;
    const [a] = mortonToCorners(unpacked.morton, resolution);
    I = Math.round(a[0] * N2);
    J = Math.round(a[1] * N2);
  }
  const can = getCanonicalVertex(face, resolution, I, J);
  const N = 1 << resolution;
  const centerGeo = inverseProjectFromFace(can.face, can.I / N, can.J / N);
  const center3D = geoToVector3D(centerGeo.lat, centerGeo.lng);
  const circumcenters = getCircumcentersForVertex(can.face, resolution, can.I, can.J);
  const ordered3D = orderCyclic(center3D, circumcenters);
  const boundary = ordered3D.map(vector3DToGeo);
  const neighborVerts = getNeighborVertices(can.face, resolution, can.I, can.J);
  const neighborIds = neighborVerts.map(
    (nv) => packDualCellId(nv.face, resolution, nv.I, nv.J)
  );
  const canonicalDualId = packDualCellId(can.face, resolution, can.I, can.J);
  const isPentagon = circumcenters.length === 5;
  const degree = isPentagon ? 5 : 6;
  return {
    id: canonicalDualId,
    center: centerGeo,
    boundary,
    neighbors: neighborIds,
    isPentagon,
    degree
  };
}
function getHexNeighbors(id) {
  const dual = getHexDual(id);
  return dual.neighbors;
}
function getHexDualBoundary(id) {
  const dual = getHexDual(id);
  return dual.boundary;
}
function hexRing(originId, radius) {
  validateCellId(originId);
  validateRadius(radius, MAX_HEX_RING_RADIUS);
  const dual = getHexDual(originId);
  const rootId = dual.id;
  if (radius === 0) return [rootId];
  const visited = /* @__PURE__ */ new Set([rootId.toString()]);
  let frontier = [rootId];
  const cells = [rootId];
  for (let distance = 1; distance <= radius; distance++) {
    const next = [];
    for (const cell of frontier) {
      for (const neighbour of getHexNeighbors(cell)) {
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
var getDualNeighbors = getHexNeighbors;
var getDualDisk = hexRing;
var getDualBoundary = getHexDualBoundary;

// src/directed-edge.ts
function isDirectedEdge(id) {
  if (typeof id !== "bigint") return false;
  if (id < 0n || id > BIT_LAYOUT.MAX_SIGNED_INT64) return false;
  if ((id & EDGE_BIT_LAYOUT.EDGE_FLAG_MASK) === 0n) return false;
  try {
    validateDirectedEdge(id);
    return true;
  } catch {
    return false;
  }
}
function validateDirectedEdge(edgeId) {
  if (typeof edgeId !== "bigint") {
    throw new TypeError(`Expected BigInt for TriHexEdgeId, received ${typeof edgeId}`);
  }
  if (edgeId < 0n || edgeId > BIT_LAYOUT.MAX_SIGNED_INT64) {
    throw new RangeError(
      `TriHexEdgeId 0x${edgeId.toString(16)} is out of signed 63-bit range [0, 0x7fffffffffffffff]`
    );
  }
  if ((edgeId & EDGE_BIT_LAYOUT.EDGE_FLAG_MASK) === 0n) {
    throw new RangeError(
      `TriHexEdgeId 0x${edgeId.toString(16)} is missing directed edge flag (bit 52 must be 1)`
    );
  }
  const origin = edgeId & EDGE_BIT_LAYOUT.ORIGIN_MASK;
  validateCellId(origin);
  const edgeIndex = Number(edgeId >> EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT & 0x7n);
  const isDual = (origin >> 53n & 1n) === 1n;
  if (!isDual) {
    if (edgeIndex < 0 || edgeIndex > 2) {
      throw new RangeError(
        `Primal directed edge 0x${edgeId.toString(16)} has invalid edgeIndex ${edgeIndex} (must be 0..2)`
      );
    }
  } else {
    const dual = getHexDual(origin);
    if (edgeIndex < 0 || edgeIndex >= dual.neighbors.length) {
      throw new RangeError(
        `Dual directed edge 0x${edgeId.toString(16)} has invalid edgeIndex ${edgeIndex} (must be 0..${dual.neighbors.length - 1} for ${dual.isPentagon ? "pentagon" : "hexagon"})`
      );
    }
  }
}
function getDirectedEdge(origin, destination) {
  validateCellId(origin);
  validateCellId(destination);
  const originDual = isDualCellId(origin);
  const destDual = isDualCellId(destination);
  if (originDual !== destDual) {
    throw new TypeError(
      `Cannot construct directed edge between heterogeneous cell types (origin is ${originDual ? "dual" : "primal"}, destination is ${destDual ? "dual" : "primal"})`
    );
  }
  if (!originDual) {
    const neighbors = getCellNeighbors(origin);
    const index = neighbors.findIndex((n) => n === destination);
    if (index === -1) {
      throw new RangeError(
        `Cells 0x${origin.toString(16)} and 0x${destination.toString(16)} are not adjacent: destination is not an edge neighbor of origin`
      );
    }
    return origin | EDGE_BIT_LAYOUT.EDGE_FLAG_MASK | BigInt(index) << EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT;
  } else {
    const dual = getHexDual(origin);
    const index = dual.neighbors.findIndex((n) => n === destination);
    if (index === -1) {
      throw new RangeError(
        `Dual cells 0x${origin.toString(16)} and 0x${destination.toString(16)} are not adjacent: destination is not a Voronoi neighbor of origin`
      );
    }
    return origin | EDGE_BIT_LAYOUT.EDGE_FLAG_MASK | BigInt(index) << EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT;
  }
}
function getDirectedEdgeOrigin(edgeId) {
  validateDirectedEdge(edgeId);
  return edgeId & EDGE_BIT_LAYOUT.ORIGIN_MASK;
}
function getDirectedEdgeDestination(edgeId) {
  validateDirectedEdge(edgeId);
  const origin = edgeId & EDGE_BIT_LAYOUT.ORIGIN_MASK;
  const edgeIndex = Number(edgeId >> EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT & 0x7n);
  const isDual = (origin >> 53n & 1n) === 1n;
  if (!isDual) {
    const neighbors = getCellNeighbors(origin);
    return neighbors[edgeIndex];
  } else {
    const dual = getHexDual(origin);
    return dual.neighbors[edgeIndex];
  }
}
function getDirectedEdgeBoundary(edgeId) {
  validateDirectedEdge(edgeId);
  const origin = edgeId & EDGE_BIT_LAYOUT.ORIGIN_MASK;
  const edgeIndex = Number(edgeId >> EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT & 0x7n);
  const isDual = (origin >> 53n & 1n) === 1n;
  if (!isDual) {
    const [a, b, c] = cellToBoundary(origin);
    if (edgeIndex === 0) return [a, b];
    if (edgeIndex === 1) return [b, c];
    return [c, a];
  } else {
    const dest = getDirectedEdgeDestination(edgeId);
    const originDual = getHexDual(origin);
    const destDual = getHexDual(dest);
    const shared = [];
    for (const p1 of originDual.boundary) {
      for (const p2 of destDual.boundary) {
        const dLat = Math.abs(p1.lat - p2.lat);
        const dLng = Math.abs(p1.lng - p2.lng);
        if (dLat < 1e-5 && (dLng < 1e-5 || Math.abs(dLng - 360) < 1e-5)) {
          if (!shared.some((s) => Math.abs(s.lat - p1.lat) < 1e-5 && Math.abs(s.lng - p1.lng) < 1e-5)) {
            shared.push(p1);
          }
        }
      }
    }
    if (shared.length >= 2) {
      return [shared[0], shared[1]];
    }
    return [originDual.boundary[0], originDual.boundary[1]];
  }
}
function getDirectedEdgeDetails(edgeId) {
  validateDirectedEdge(edgeId);
  const origin = getDirectedEdgeOrigin(edgeId);
  const destination = getDirectedEdgeDestination(edgeId);
  const edgeIndex = Number(edgeId >> EDGE_BIT_LAYOUT.EDGE_INDEX_SHIFT & 0x7n);
  const isDual = (origin >> 53n & 1n) === 1n;
  const boundary = getDirectedEdgeBoundary(edgeId);
  return {
    edgeId,
    origin,
    destination,
    edgeIndex,
    isDual,
    boundary
  };
}

// src/network-metric.ts
var TopologyPartitionRegistry = class {
  partitions = /* @__PURE__ */ new Map();
  setCluster(id, clusterId) {
    if (!Number.isInteger(clusterId) || clusterId < 0 || clusterId > 4095) {
      throw new RangeError(
        `Topology cluster ID ${clusterId} is invalid. Must be an integer between 0 and 4095`
      );
    }
    this.partitions.set(id.toString(), clusterId);
  }
  getCluster(id) {
    return this.partitions.get(id.toString()) ?? 0;
  }
  isSamePartition(idA, idB) {
    return this.getCluster(idA) === this.getCluster(idB);
  }
  clear() {
    this.partitions.clear();
  }
  get size() {
    return this.partitions.size;
  }
};
var defaultTopologyRegistry = new TopologyPartitionRegistry();
function getTopologyCluster(id, registry = defaultTopologyRegistry) {
  return registry.getCluster(id);
}
function setTopologyCluster(id, clusterId, registry = defaultTopologyRegistry) {
  registry.setCluster(id, clusterId);
}
function withTopologyCluster(id, clusterId, registry = defaultTopologyRegistry) {
  registry.setCluster(id, clusterId);
  return id;
}
function isSameCluster(idA, idB, registry = defaultTopologyRegistry) {
  return registry.isSamePartition(idA, idB);
}
function effectiveDistance(idA, idB, params = {}, costMatrix, registry = defaultTopologyRegistry) {
  const alpha = params.alpha ?? 1;
  const beta = params.beta ?? 1;
  const coordA = cellToLatLng(idA);
  const coordB = cellToLatLng(idB);
  const geoDist = geodesicDistance(coordA, coordB);
  if (costMatrix) {
    const pairKey = `${idA.toString()}:${idB.toString()}`;
    const reverseKey = `${idB.toString()}:${idA.toString()}`;
    const cost = costMatrix.get(pairKey) ?? costMatrix.get(reverseKey);
    if (cost !== void 0) {
      return alpha * geoDist + beta * cost;
    }
  }
  const samePartition = isSameCluster(idA, idB, registry);
  const penalty = params.barrierPenaltyMeters ?? 3e3;
  const clusterPenalty = samePartition ? 0 : penalty;
  return alpha * geoDist + beta * clusterPenalty;
}

// src/serialization.ts
var HEX_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;
function cellToString(id) {
  validateCellId(id);
  return id.toString(16).toLowerCase().padStart(16, "0");
}
function stringToCell(str) {
  if (typeof str !== "string" || !str.trim()) {
    throw new TypeError(`Expected non-empty string, received ${typeof str}`);
  }
  const cleanStr = str.trim();
  if (!HEX_REGEX.test(cleanStr)) {
    throw new Error(`Invalid TriHexId hexadecimal format: "${str}"`);
  }
  const id = BigInt(cleanStr.startsWith("0x") ? cleanStr : `0x${cleanStr}`);
  validateCellId(id);
  return id;
}
function bigIntReplacer(_key, value) {
  if (typeof value === "bigint") {
    return cellToString(value);
  }
  return value;
}

// src/dispatch.ts
var DEFAULT_SHARD_RESOLUTION = 4;
function getSpatialShard(cellId, shardResolution = DEFAULT_SHARD_RESOLUTION) {
  const parent = cellToParent(cellId, shardResolution);
  return cellToString(parent).substring(8, 16);
}
function formatCellKey(cityId, cellId, shardResolution = DEFAULT_SHARD_RESOLUTION) {
  const shard = getSpatialShard(cellId, shardResolution);
  const hex = cellToString(cellId);
  return `{${cityId}:${shard}}:cell:${hex}`;
}
function formatDriverKey(cityId, driverId, cellId, shardResolution = DEFAULT_SHARD_RESOLUTION) {
  if (cellId !== void 0) {
    const shard = getSpatialShard(cellId, shardResolution);
    return `{${cityId}:${shard}}:driver:${driverId}`;
  }
  return `{${cityId}:global}:driver:${driverId}`;
}
var MIGRATE_DRIVER_LUA = `
local newCellKey = KEYS[1]
local driverPosKey = KEYS[2]
local driverId = ARGV[1]
local cellTtl = tonumber(ARGV[2])
local driverTtl = tonumber(ARGV[3])
local payload = ARGV[4]
local incoming = cjson.decode(payload)
local incomingVersion = tonumber(incoming.version) or 0

local existingRaw = redis.call("GET", driverPosKey)
if existingRaw then
  local existing = cjson.decode(existingRaw)
  local existingVersion = tonumber(existing.version) or 0
  if existingVersion >= incomingVersion then
    return 0 -- Stale or duplicate update rejected
  end

  local oldCellKey = existing.cellKey
  if oldCellKey and oldCellKey ~= "" and oldCellKey ~= newCellKey then
    pcall(redis.call, "SREM", oldCellKey, driverId)
  end
end

redis.call("SADD", newCellKey, driverId)
if cellTtl and cellTtl > 0 then
  redis.call("EXPIRE", newCellKey, cellTtl)
end

redis.call("SET", driverPosKey, payload, "EX", driverTtl)
return 1
`;
var REMOVE_DRIVER_LUA = `
local driverPosKey = KEYS[1]
local driverId = ARGV[1]
local tombstoneTtl = tonumber(ARGV[2]) or 60
local tombstonePayload = ARGV[3]
local incoming = cjson.decode(tombstonePayload)
local incomingVersion = tonumber(incoming.version) or 0

local existingRaw = redis.call("GET", driverPosKey)
if existingRaw then
  local existing = cjson.decode(existingRaw)
  local existingVersion = tonumber(existing.version) or 0
  if existingVersion > incomingVersion then
    return 0 -- Stale offline request rejected
  end

  local cellKey = existing.cellKey
  if cellKey and cellKey ~= "" then
    pcall(redis.call, "SREM", cellKey, driverId)
  end
end

redis.call("SET", driverPosKey, tombstonePayload, "EX", tombstoneTtl)
return 1
`;
var InMemoryDriverRegistry = class {
  cellDrivers = /* @__PURE__ */ new Map();
  driverPositions = /* @__PURE__ */ new Map();
  update(pos) {
    const key = `${pos.cityId}:${pos.driverId}`;
    const existing = this.driverPositions.get(key);
    if (existing && existing.version >= pos.version) {
      return false;
    }
    const newCellKey = formatCellKey(pos.cityId, pos.cellId);
    if (existing && existing.cellKey && existing.cellKey !== newCellKey) {
      this.cellDrivers.get(existing.cellKey)?.delete(pos.driverId);
    }
    let drivers = this.cellDrivers.get(newCellKey);
    if (!drivers) {
      drivers = /* @__PURE__ */ new Set();
      this.cellDrivers.set(newCellKey, drivers);
    }
    drivers.add(pos.driverId);
    this.driverPositions.set(key, { ...pos, cellKey: newCellKey });
    return true;
  }
  remove(cityId, driverId, cellId, version) {
    const key = `${cityId}:${driverId}`;
    const existing = this.driverPositions.get(key);
    const tombstoneVer = version ?? Date.now();
    if (existing && existing.version >= tombstoneVer) {
      return false;
    }
    const currentCellId = cellId ?? existing?.cellId;
    if (currentCellId !== void 0) {
      const cellKey = formatCellKey(cityId, currentCellId);
      this.cellDrivers.get(cellKey)?.delete(driverId);
    }
    this.driverPositions.set(key, {
      driverId,
      lat: existing?.lat ?? 0,
      lng: existing?.lng ?? 0,
      cellId: currentCellId ?? 0n,
      cityId,
      version: tombstoneVer,
      updatedAt: Date.now(),
      status: "REMOVED",
      cellKey: ""
    });
    return true;
  }
  getDriversInCell(cellKey) {
    return Array.from(this.cellDrivers.get(cellKey) ?? []);
  }
  getDriverPosition(driverKey) {
    let pos = this.driverPositions.get(driverKey);
    if (!pos) {
      const match = driverKey.match(/\{([^:]+):[^}]+\}:driver:(.+)/);
      if (match) {
        pos = this.driverPositions.get(`${match[1]}:${match[2]}`);
      }
    }
    if (!pos || pos.status === "REMOVED" || pos.status === "OFFLINE") return null;
    return pos;
  }
  clear() {
    this.cellDrivers.clear();
    this.driverPositions.clear();
  }
};
var InMemoryDriverSpatialStore = class {
  constructor(registry = new InMemoryDriverRegistry()) {
    this.registry = registry;
  }
  registry;
  async add(driverId, cell, version, metadata) {
    const cityId = metadata?.cityId ?? "default";
    this.registry.update({
      driverId,
      cellId: cell,
      version,
      cityId,
      lat: metadata?.lat ?? 0,
      lng: metadata?.lng ?? 0,
      updatedAt: metadata?.updatedAt ?? Date.now(),
      status: metadata?.status ?? "AVAILABLE"
    });
  }
  async remove(driverId, cell, version, cityId = "default") {
    this.registry.remove(cityId, driverId, cell, version);
  }
  async findCandidates(cells, limit, cityId = "default") {
    const result = [];
    for (const cell of cells) {
      const cellKey = formatCellKey(cityId, cell);
      const drivers = this.registry.getDriversInCell(cellKey);
      for (const d of drivers) {
        if (!result.includes(d)) {
          result.push(d);
          if (result.length >= limit) return result;
        }
      }
    }
    return result;
  }
  getRegistry() {
    return this.registry;
  }
};
var DispatchEngine = class {
  redis;
  inMemory = new InMemoryDriverRegistry();
  routeCostProvider;
  cellTtl;
  driverTtl;
  tombstoneTtl;
  defaultAverageSpeedMps;
  tier1Limit;
  tier2Limit;
  maxCells;
  maxDriversPerCell;
  rejectCrossBarrierFallback;
  constructor(options = {}) {
    this.redis = options.redisClient;
    this.routeCostProvider = options.routeCostProvider;
    this.cellTtl = options.cellTtlSeconds ?? 300;
    this.driverTtl = options.driverTtlSeconds ?? 60;
    this.tombstoneTtl = options.tombstoneTtlSeconds ?? 60;
    const speedKmh = options.defaultAverageSpeedKmh ?? 30;
    this.defaultAverageSpeedMps = speedKmh * 1e3 / 3600;
    this.tier1Limit = options.tier1CandidateLimit ?? 50;
    this.tier2Limit = options.tier2CandidateLimit ?? 5;
    this.maxCells = options.maxCellsPerSearch ?? 128;
    this.maxDriversPerCell = options.maxDriversPerCell ?? 250;
    this.rejectCrossBarrierFallback = options.rejectCrossBarrierFallback ?? false;
  }
  /**
   * Updates driver position atomically with authoritative monotonic version protection.
   * If Redis is provided, uses atomic Lua script. Otherwise updates in-memory registry.
   */
  async updateDriverPosition(position) {
    validateCoordinates(position.lat, position.lng);
    validateCellId(position.cellId);
    const version = position.version !== void 0 ? position.version : position.updatedAt ?? Date.now();
    if (!Number.isFinite(version) || version < 0) {
      throw new TypeError(`version must be a non-negative number, received ${position.version}`);
    }
    const effectivePos = { ...position, version };
    const newCellKey = formatCellKey(position.cityId, position.cellId);
    const driverKey = formatDriverKey(position.cityId, position.driverId, position.cellId);
    const payload = JSON.stringify({
      ...effectivePos,
      cellId: position.cellId.toString(),
      cellKey: newCellKey
    });
    if (this.redis) {
      const res = await this.redis.eval(
        MIGRATE_DRIVER_LUA,
        2,
        newCellKey,
        driverKey,
        position.driverId,
        this.cellTtl,
        this.driverTtl,
        payload
      );
      return res === 1;
    } else {
      return this.inMemory.update(effectivePos);
    }
  }
  /**
   * Atomically removes a driver when they go offline, writing a tombstone to prevent resurrection.
   */
  async removeDriver(cityId, driverId, currentCellId, version) {
    const driverKey = formatDriverKey(cityId, driverId, currentCellId);
    const tombstoneVersion = version ?? Date.now();
    const tombstonePayload = JSON.stringify({
      driverId,
      cityId,
      version: tombstoneVersion,
      updatedAt: Date.now(),
      status: "REMOVED"
    });
    if (this.redis) {
      const res = await this.redis.eval(
        REMOVE_DRIVER_LUA,
        1,
        driverKey,
        driverId,
        this.tombstoneTtl,
        tombstonePayload
      );
      return res === 1;
    } else {
      return this.inMemory.remove(cityId, driverId, currentCellId, tombstoneVersion);
    }
  }
  /**
   * Retrieves raw driver position by ID.
   */
  async getDriverPosition(cityId, driverId, cellId) {
    const driverKey = formatDriverKey(cityId, driverId, cellId);
    if (this.redis) {
      const raw = await this.redis.get(driverKey);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.status === "REMOVED" || parsed.status === "OFFLINE") return null;
        return {
          ...parsed,
          cellId: BigInt(parsed.cellId)
        };
      } catch {
        return null;
      }
    } else {
      return this.inMemory.getDriverPosition(driverKey);
    }
  }
  /**
   * Retrieves all driver IDs currently indexed in a spatial cell.
   */
  async getDriversInCell(cityId, cellId) {
    const cellKey = formatCellKey(cityId, cellId);
    if (this.redis) {
      return await this.redis.smembers(cellKey);
    } else {
      return this.inMemory.getDriversInCell(cellKey);
    }
  }
  /**
   * Finds, ranks, and dispatches candidate drivers for a pickup request using 3-Tier candidate generation and evaluation:
   *  - Tier 1: High-recall spatial candidate generation.
   *  - Tier 2: Road network routing & turn-by-turn ETA evaluation of retained candidates.
   *  - Tier 3: Dispatch scoring optimization.
   * Note: The final routed candidate is optimal within the retained candidate pool.
   */
  async findCandidates(query) {
    validateCoordinates(query.pickup.lat, query.pickup.lng);
    validateCellId(query.pickupCellId);
    const initialRadius = query.initialRadius ?? 1;
    const maxRadius = query.maxRadius ?? 3;
    const requiredStatus = query.requiredStatus ?? "AVAILABLE";
    const maxResults = query.maxResults ?? this.tier2Limit;
    const seenDriverIds = /* @__PURE__ */ new Set();
    const seenCells = /* @__PURE__ */ new Set();
    const candidateIds = [];
    for (let r = initialRadius; r <= maxRadius; r++) {
      const ringCells = cellDisk(query.pickupCellId, r);
      for (const cell of ringCells) {
        const cKey = cell.toString();
        if (seenCells.has(cKey)) continue;
        seenCells.add(cKey);
        if (seenCells.size > this.maxCells) break;
        const cellKey = formatCellKey(query.cityId, cell);
        let driversInCell = [];
        if (this.redis) {
          if (typeof this.redis.srandmember === "function") {
            driversInCell = await this.redis.srandmember(cellKey, this.maxDriversPerCell);
          } else {
            const allMembers = await this.redis.smembers(cellKey);
            driversInCell = allMembers.slice(0, this.maxDriversPerCell);
          }
        } else {
          const inMem = this.inMemory.getDriversInCell(cellKey);
          driversInCell = inMem.slice(0, this.maxDriversPerCell);
        }
        for (const dId of driversInCell) {
          if (!seenDriverIds.has(dId)) {
            seenDriverIds.add(dId);
            candidateIds.push({ driverId: dId, cellId: cell });
          }
        }
      }
      if (candidateIds.length >= this.tier1Limit || seenCells.size >= this.maxCells) {
        break;
      }
    }
    if (candidateIds.length === 0) {
      return [];
    }
    const activeCandidates = [];
    for (const cand of candidateIds) {
      const pos = await this.getDriverPosition(query.cityId, cand.driverId, cand.cellId);
      if (pos && (pos.status === void 0 || pos.status === requiredStatus)) {
        activeCandidates.push(pos);
      }
    }
    if (activeCandidates.length === 0) {
      return [];
    }
    const tier1Scored = activeCandidates.map((cand) => {
      const dist = geodesicDistance({ lat: cand.lat, lng: cand.lng }, query.pickup);
      const durationSec = dist / this.defaultAverageSpeedMps;
      return { pos: cand, dist, durationSec };
    });
    tier1Scored.sort((a, b) => a.durationSec - b.durationSec);
    const tier2PoolSize = Math.max(maxResults, Math.min(15, tier1Scored.length));
    const tier2Candidates = tier1Scored.slice(0, tier2PoolSize);
    const candidates = [];
    if (this.routeCostProvider) {
      const routePromises = tier2Candidates.map(async (cand) => {
        try {
          const cost = await this.routeCostProvider.getRouteCost(
            { lat: cand.pos.lat, lng: cand.pos.lng },
            query.pickup
          );
          return {
            driverId: cand.pos.driverId,
            lat: cand.pos.lat,
            lng: cand.pos.lng,
            cellId: cand.pos.cellId,
            geodesicDistanceMeters: Math.round(cand.dist),
            estimatedDurationSeconds: Math.round(cand.durationSec),
            routeDistanceMeters: Math.round(cost.distanceMeters),
            routeDurationSeconds: Math.round(cost.durationSeconds),
            finalScore: cost.durationSeconds,
            rank: 0,
            routingFallback: false,
            barrierPenalized: false
          };
        } catch {
          const sameCluster = isSameCluster(cand.pos.cellId, query.pickupCellId);
          if (this.rejectCrossBarrierFallback && !sameCluster) {
            return null;
          }
          const effectiveDist = effectiveDistance(cand.pos.cellId, query.pickupCellId, {
            barrierPenaltyMeters: 5e3
          });
          const isPenalized = effectiveDist > cand.dist * 1.2 || !sameCluster;
          const circuityFactor = isPenalized ? 2.5 : 1.6;
          const fallbackDurationSec = effectiveDist / this.defaultAverageSpeedMps * circuityFactor;
          return {
            driverId: cand.pos.driverId,
            lat: cand.pos.lat,
            lng: cand.pos.lng,
            cellId: cand.pos.cellId,
            geodesicDistanceMeters: Math.round(cand.dist),
            estimatedDurationSeconds: Math.round(cand.durationSec),
            routeDistanceMeters: Math.round(effectiveDist),
            routeDurationSeconds: Math.round(fallbackDurationSec),
            finalScore: fallbackDurationSec,
            rank: 0,
            routingFallback: true,
            barrierPenalized: isPenalized
          };
        }
      });
      const resolved = (await Promise.all(routePromises)).filter((item) => item !== null);
      resolved.sort((a, b) => a.finalScore - b.finalScore);
      const culled = resolved.slice(0, maxResults);
      culled.forEach((item, index) => {
        item.rank = index + 1;
        candidates.push(item);
      });
    } else {
      const culled = tier2Candidates.slice(0, maxResults);
      culled.forEach((cand, index) => {
        const sameCluster = isSameCluster(cand.pos.cellId, query.pickupCellId);
        const effectiveDist = effectiveDistance(cand.pos.cellId, query.pickupCellId, {
          barrierPenaltyMeters: 5e3
        });
        const isPenalized = effectiveDist > cand.dist * 1.2 || !sameCluster;
        const circuity = isPenalized ? 2.5 : 1.6;
        const fallbackDur = effectiveDist / this.defaultAverageSpeedMps * circuity;
        candidates.push({
          driverId: cand.pos.driverId,
          lat: cand.pos.lat,
          lng: cand.pos.lng,
          cellId: cand.pos.cellId,
          geodesicDistanceMeters: Math.round(cand.dist),
          estimatedDurationSeconds: Math.round(cand.durationSec),
          routeDistanceMeters: Math.round(effectiveDist),
          routeDurationSeconds: Math.round(fallbackDur),
          finalScore: fallbackDur,
          rank: index + 1,
          routingFallback: true,
          barrierPenalized: isPenalized
        });
      });
    }
    return candidates;
  }
};

// src/geojson.ts
function cellToGeoJSON(id) {
  validateCellId(id);
  const boundary = cellToBoundary(id);
  const unpacked = unpackTriHexId(id);
  const idStr = cellToString(id);
  const ring = boundary.map((c) => [c.lng, c.lat]);
  ring.push([boundary[0].lng, boundary[0].lat]);
  return {
    type: "Feature",
    id: idStr,
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    },
    properties: {
      id: idStr,
      face: unpacked.face,
      resolution: unpacked.resolution,
      morton: unpacked.morton.toString(16),
      representation: "triangle"
    }
  };
}
function hexDualToGeoJSON(id) {
  validateCellId(id);
  const dual = getHexDual(id);
  const unpacked = unpackTriHexId(id);
  const idStr = cellToString(id);
  const ring = dual.boundary.map((c) => [c.lng, c.lat]);
  if (dual.boundary.length > 0) {
    ring.push([dual.boundary[0].lng, dual.boundary[0].lat]);
  }
  return {
    type: "Feature",
    id: idStr,
    geometry: {
      type: "Polygon",
      coordinates: [ring]
    },
    properties: {
      id: idStr,
      face: unpacked.face,
      resolution: unpacked.resolution,
      morton: unpacked.morton.toString(16),
      representation: "hexDual",
      degree: dual.degree,
      isPentagon: dual.isPentagon
    }
  };
}
function cellsToGeoJSON(ids, mode = "triangle") {
  const features = ids.map(
    (id) => mode === "hexDual" ? hexDualToGeoJSON(id) : cellToGeoJSON(id)
  );
  return {
    type: "FeatureCollection",
    features
  };
}

// src/rasterization.ts
function getResolutionCellRadius(resolution) {
  const boundedRes = Math.max(0, Math.min(BIT_LAYOUT.MAX_RESOLUTION, resolution));
  return 4041451 / (1 << boundedRes);
}
function isPointInRing(point, ring) {
  let inside = false;
  const n = ring.length;
  let pLng = point.lng;
  let crossesAntimeridian = false;
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(ring[i].lng - ring[i + 1].lng) > 180) {
      crossesAntimeridian = true;
      break;
    }
  }
  const normRing = crossesAntimeridian ? ring.map((p) => ({ lat: p.lat, lng: p.lng < 0 ? p.lng + 360 : p.lng })) : ring;
  if (crossesAntimeridian && pLng < 0) {
    pLng += 360;
  }
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = normRing[i].lng;
    const yi = normRing[i].lat;
    const xj = normRing[j].lng;
    const yj = normRing[j].lat;
    const intersect = yi > point.lat !== yj > point.lat && pLng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function isPointInPolygon(point, rings) {
  if (rings.length === 0 || rings[0].length < 3) return false;
  if (!isPointInRing(point, rings[0])) {
    return false;
  }
  for (let h = 1; h < rings.length; h++) {
    if (isPointInRing(point, rings[h])) {
      return false;
    }
  }
  return true;
}
function lineStringToCells(coordinates, resolution, topoCluster = 0) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new TypeError("lineStringToCells requires an array of at least 2 GeoCoord waypoints");
  }
  validateResolution(resolution);
  for (const c of coordinates) {
    validateCoordinates(c.lat, c.lng);
  }
  const cellRadius = getResolutionCellRadius(resolution);
  const stepMeters = Math.max(2, cellRadius * 0.4);
  const result = [];
  let lastCell = null;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const dist = geodesicDistance(p1, p2);
    const steps = Math.max(1, Math.ceil(dist / stepMeters));
    const v1 = geoToVector3D(p1.lat, p1.lng);
    const v2 = geoToVector3D(p2.lat, p2.lng);
    for (let s = 0; s <= steps; s++) {
      if (s === 0 && i > 0) continue;
      const t = s / steps;
      const v = slerp(v1, v2, t);
      const proj = projectToFace(v);
      const { morton } = barycentricToMorton(proj.u, proj.v, resolution);
      const cellId = packTriHexId(proj.face, resolution, morton);
      if (topoCluster !== 0) {
        defaultTopologyRegistry.setCluster(cellId, topoCluster);
      }
      if (lastCell === null || cellId !== lastCell) {
        result.push(cellId);
        lastCell = cellId;
      }
    }
  }
  return result;
}
function polygonToCells(polygonInput, resolution, options) {
  validateResolution(resolution);
  let rings;
  let topoCluster = 0;
  let mode = "intersects";
  let maxCells = 2e5;
  if (typeof options === "number") {
    topoCluster = options;
  } else if (options && typeof options === "object") {
    topoCluster = options.topoCluster ?? 0;
    mode = options.mode ?? "intersects";
    maxCells = options.maxCells ?? 2e5;
  }
  if (Array.isArray(polygonInput) && polygonInput.length > 0 && Array.isArray(polygonInput[0])) {
    rings = polygonInput;
  } else if (Array.isArray(polygonInput)) {
    rings = [polygonInput];
  } else {
    throw new TypeError("polygonToCells requires an array of GeoCoord or GeoCoord[][]");
  }
  if (rings.length === 0 || rings[0].length < 3) {
    throw new RangeError("polygonToCells requires a closed polygon of at least 3 vertices");
  }
  const closedRings = rings.map((ring) => {
    const closed = [...ring];
    const first = closed[0];
    const last = closed[closed.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) {
      closed.push({ lat: first.lat, lng: first.lng });
    }
    return closed;
  });
  const outerRing = closedRings[0];
  let crossesAntimeridian = false;
  for (let i = 0; i < outerRing.length - 1; i++) {
    if (Math.abs(outerRing[i].lng - outerRing[i + 1].lng) > 180) {
      crossesAntimeridian = true;
      break;
    }
  }
  const normOuter = crossesAntimeridian ? outerRing.map((p) => ({ lat: p.lat, lng: p.lng < 0 ? p.lng + 360 : p.lng })) : outerRing;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of normOuter) {
    validateCoordinates(p.lat, crossesAntimeridian && p.lng > 180 ? p.lng - 360 : p.lng);
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const cellRadius = getResolutionCellRadius(resolution);
  const stepDegLat = cellRadius / 111320 * 0.7;
  const avgLat = (minLat + maxLat) * 0.5;
  const cosLat = Math.cos(avgLat * Math.PI / 180);
  const stepDegLng = cellRadius / (111320 * (cosLat === 0 ? 1 : Math.abs(cosLat))) * 0.7;
  const latSteps = Math.ceil((maxLat - minLat) / stepDegLat);
  const lngSteps = Math.ceil((maxLng - minLng) / stepDegLng);
  const estimatedOps = latSteps * lngSteps;
  if (estimatedOps > maxCells) {
    throw new RangeError(
      `polygonToCells: Polygon bounding box covers too many potential cells (${estimatedOps.toLocaleString()}) at resolution ${resolution}. Use a coarser resolution or partition the polygon.`
    );
  }
  const cellIdSet = /* @__PURE__ */ new Set();
  const results = [];
  for (let lat = minLat; lat <= maxLat; lat += stepDegLat) {
    for (let lng = minLng; lng <= maxLng; lng += stepDegLng) {
      const realLng = crossesAntimeridian && lng > 180 ? lng - 360 : lng;
      const pt = { lat, lng: realLng };
      const inside = isPointInPolygon(pt, closedRings);
      if (inside) {
        const v = geoToVector3D(pt.lat, pt.lng);
        const proj = projectToFace(v);
        const { morton } = barycentricToMorton(proj.u, proj.v, resolution);
        const cellId = packTriHexId(proj.face, resolution, morton);
        const key = cellId.toString();
        if (!cellIdSet.has(key)) {
          cellIdSet.add(key);
          if (mode === "covers" || mode === "contains") {
            const boundary = cellToBoundary(cellId);
            const allVerticesInside = boundary.every((b) => isPointInPolygon(b, closedRings));
            if (allVerticesInside) {
              results.push(cellId);
            }
          } else {
            results.push(cellId);
          }
          if (topoCluster !== 0) {
            defaultTopologyRegistry.setCluster(cellId, topoCluster);
          }
        }
      }
    }
  }
  results.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return results;
}
function polygonToCellsHierarchical(polygonInput, resolution, options) {
  validateResolution(resolution);
  return polygonToCells(polygonInput, resolution, options);
}
function polygonToCompactedCells(polygonInput, resolution, options) {
  const cells = polygonToCellsHierarchical(polygonInput, resolution, options);
  return compactCells(cells);
}

// src/routing.ts
var TopologyRoutingProvider = class {
  constructor(topology) {
    this.topology = topology;
  }
  topology;
  async getRouteCost(origin, destination, _options) {
    const fromPos = this.topology.locate(origin);
    const toPos = this.topology.locate(destination);
    const localSpeedMps = 30 * 1e3 / 3600;
    if (fromPos.roadId === toPos.roadId) {
      const localDist = geodesicDistance(origin, destination);
      const localDuration = localDist / localSpeedMps;
      return {
        distanceMeters: Math.round(localDist),
        durationSeconds: Math.round(localDuration),
        roadVersion: this.topology.version,
        trafficTimestamp: Date.now()
      };
    }
    const cost = this.topology.estimateCost(fromPos, toPos);
    if (cost.durationSeconds === Infinity) {
      throw new Error(`Unreachable: no connected road path between locations on version ${this.topology.version}`);
    }
    const accessDist = geodesicDistance(origin, fromPos.coordinate);
    const egressDist = geodesicDistance(toPos.coordinate, destination);
    const totalDist = accessDist + cost.distanceMeters + egressDist;
    const totalDuration = accessDist / localSpeedMps + cost.durationSeconds + egressDist / localSpeedMps;
    return {
      distanceMeters: Math.round(totalDist),
      durationSeconds: Math.round(totalDuration),
      roadVersion: cost.roadVersion,
      trafficTimestamp: Date.now()
    };
  }
  async getRouteMatrix(origins, destinations, _options) {
    const rows = [];
    for (let o = 0; o < origins.length; o++) {
      const row = [];
      const fromPos = this.topology.locate(origins[o]);
      for (let d = 0; d < destinations.length; d++) {
        const toPos = this.topology.locate(destinations[d]);
        const cost = this.topology.estimateCost(fromPos, toPos);
        if (cost.durationSeconds === Infinity) {
          row.push({
            originIndex: o,
            destinationIndex: d,
            distanceMeters: -1,
            durationSeconds: -1,
            status: "NO_ROUTE"
          });
        } else {
          row.push({
            originIndex: o,
            destinationIndex: d,
            distanceMeters: cost.distanceMeters,
            durationSeconds: cost.durationSeconds,
            status: "OK"
          });
        }
      }
      rows.push(row);
    }
    return {
      rows,
      roadVersion: this.topology.version,
      trafficTimestamp: Date.now()
    };
  }
};
var SimulatedRoadRoutingProvider = class {
  constructor(detourFactor = 1.35, speedKmh = 30) {
    this.detourFactor = detourFactor;
    this.speedKmh = speedKmh;
  }
  detourFactor;
  speedKmh;
  async getRouteCost(origin, destination, _options) {
    const geo = geodesicDistance(origin, destination);
    const roadDist = geo * this.detourFactor;
    const speedMps = this.speedKmh * 1e3 / 3600;
    const duration = roadDist / speedMps;
    return {
      distanceMeters: Math.round(roadDist),
      durationSeconds: Math.round(duration),
      roadVersion: "simulated-v1",
      trafficTimestamp: Date.now()
    };
  }
};

// src/topology.ts
var VersionedRoadGraph = class {
  _version;
  nodes = /* @__PURE__ */ new Map();
  edges = /* @__PURE__ */ new Map();
  adjacency = /* @__PURE__ */ new Map();
  constructor(initialVersion = "v1.0.0") {
    this._version = initialVersion;
  }
  get version() {
    return this._version;
  }
  addNode(nodeId, coord) {
    this.nodes.set(nodeId, { ...coord });
    if (!this.adjacency.has(nodeId)) {
      this.adjacency.set(nodeId, []);
    }
  }
  addEdge(fromNodeId, toNodeId, options = {}) {
    const fromCoord = this.nodes.get(fromNodeId);
    const toCoord = this.nodes.get(toNodeId);
    if (!fromCoord || !toCoord) {
      throw new Error(`Both nodes ${fromNodeId} and ${toNodeId} must exist in graph`);
    }
    const dist = options.distanceMeters ?? geodesicDistance(fromCoord, toCoord);
    const speedMps = (options.freeFlowSpeedKmh ?? 40) * 1e3 / 3600;
    const edgeId = `${fromNodeId}->${toNodeId}`;
    const edge = {
      fromNodeId,
      toNodeId,
      distanceMeters: dist,
      freeFlowSpeedMps: speedMps,
      isClosed: options.isClosed ?? false
    };
    this.edges.set(edgeId, edge);
    this.adjacency.get(fromNodeId).push(edge);
    return edgeId;
  }
  setEdgeClosure(fromNodeId, toNodeId, isClosed, newVersion) {
    const edgeId = `${fromNodeId}->${toNodeId}`;
    const edge = this.edges.get(edgeId);
    if (edge) {
      edge.isClosed = isClosed;
    }
    this._version = newVersion ?? `v${Date.now()}`;
  }
  locate(point) {
    let bestNode = "";
    let minDist = Infinity;
    for (const [id, coord2] of this.nodes.entries()) {
      const dist = geodesicDistance(point, coord2);
      if (dist < minDist) {
        minDist = dist;
        bestNode = id;
      }
    }
    const coord = this.nodes.get(bestNode) ?? point;
    return {
      roadId: bestNode,
      coordinate: coord
    };
  }
  reachable(from, to) {
    const cost = this.estimateCost(from, to);
    if (cost.durationSeconds === Infinity) {
      return { reachable: false, reason: "No connected path or barrier closure" };
    }
    return { reachable: true };
  }
  estimateCost(from, to) {
    if (from.roadId === to.roadId) {
      return { distanceMeters: 0, durationSeconds: 0, roadVersion: this._version };
    }
    const dists = /* @__PURE__ */ new Map();
    const times = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    for (const nodeId of this.nodes.keys()) {
      dists.set(nodeId, Infinity);
      times.set(nodeId, Infinity);
    }
    times.set(from.roadId, 0);
    dists.set(from.roadId, 0);
    while (true) {
      let closestNode = null;
      let minTime = Infinity;
      for (const [nodeId, time] of times.entries()) {
        if (!visited.has(nodeId) && time < minTime) {
          minTime = time;
          closestNode = nodeId;
        }
      }
      if (!closestNode || minTime === Infinity) break;
      if (closestNode === to.roadId) break;
      visited.add(closestNode);
      const outgoing = this.adjacency.get(closestNode) ?? [];
      for (const edge of outgoing) {
        if (edge.isClosed || visited.has(edge.toNodeId)) continue;
        const traverseTime = edge.distanceMeters / edge.freeFlowSpeedMps;
        const newTime = minTime + traverseTime;
        const newDist = dists.get(closestNode) + edge.distanceMeters;
        if (newTime < times.get(edge.toNodeId)) {
          times.set(edge.toNodeId, newTime);
          dists.set(edge.toNodeId, newDist);
        }
      }
    }
    const durationSeconds = times.get(to.roadId) ?? Infinity;
    const distanceMeters = dists.get(to.roadId) ?? Infinity;
    return {
      distanceMeters,
      durationSeconds,
      roadVersion: this._version
    };
  }
};

// src/candidate-recall.ts
async function evaluateCandidateRecall(scenarioName, topology, drivers, pickup, pickupCellId, cityId = "lagos") {
  const pickupPos = topology.locate(pickup);
  const groundTruthScored = [];
  const costCache = /* @__PURE__ */ new Map();
  const localSpeedMps = 30 * 1e3 / 3600;
  for (const drv of drivers) {
    const drvCoord = { lat: drv.lat, lng: drv.lng };
    const drvPos = topology.locate(drvCoord);
    if (drvPos.roadId === pickupPos.roadId) {
      const localDist = geodesicDistance(drvCoord, pickup);
      const localDuration = localDist / localSpeedMps;
      groundTruthScored.push({
        driverId: drv.driverId,
        durationSeconds: localDuration,
        distanceMeters: localDist
      });
      continue;
    }
    const pairKey = `${drvPos.roadId}->${pickupPos.roadId}`;
    let cost = costCache.get(pairKey);
    if (!cost) {
      cost = topology.estimateCost(drvPos, pickupPos);
      costCache.set(pairKey, cost);
    }
    if (cost.durationSeconds !== Infinity) {
      const accessDist = geodesicDistance(drvCoord, drvPos.coordinate);
      const egressDist = geodesicDistance(pickupPos.coordinate, pickup);
      const totalDist = accessDist + cost.distanceMeters + egressDist;
      const totalDuration = accessDist / localSpeedMps + cost.durationSeconds + egressDist / localSpeedMps;
      groundTruthScored.push({
        driverId: drv.driverId,
        durationSeconds: totalDuration,
        distanceMeters: totalDist
      });
    }
  }
  groundTruthScored.sort((a, b) => a.durationSeconds - b.durationSeconds);
  const routingProvider = new TopologyRoutingProvider(topology);
  const dispatchEngine = new DispatchEngine({
    routeCostProvider: routingProvider,
    tier1CandidateLimit: 500,
    tier2CandidateLimit: 100,
    maxCellsPerSearch: 256,
    maxDriversPerCell: 500
  });
  for (const drv of drivers) {
    await dispatchEngine.updateDriverPosition(drv);
  }
  const candidates = await dispatchEngine.findCandidates({
    pickup,
    pickupCellId,
    cityId,
    initialRadius: 1,
    maxRadius: 6,
    maxResults: 100
  });
  const retrievedDriverIds = new Set(candidates.map((c) => c.driverId));
  const calcRecallAtK = (k) => {
    const topK = groundTruthScored.slice(0, k);
    if (topK.length === 0) return 1;
    let found = 0;
    for (const item of topK) {
      if (retrievedDriverIds.has(item.driverId)) {
        found++;
      }
    }
    return found / topK.length;
  };
  const bestDriver = groundTruthScored[0];
  let mrr = 0;
  if (bestDriver) {
    const idx = candidates.findIndex((c) => c.driverId === bestDriver.driverId);
    if (idx !== -1) {
      mrr = 1 / (idx + 1);
    }
  }
  const trihexBest = candidates[0];
  const etaRegretSeconds = trihexBest && bestDriver ? Math.max(0, trihexBest.finalScore - bestDriver.durationSeconds) : 0;
  const relativeEtaRegretPct = bestDriver && bestDriver.durationSeconds > 0 ? etaRegretSeconds / bestDriver.durationSeconds * 100 : 0;
  const top5 = groundTruthScored.slice(0, 5);
  const falseNegativeCount = top5.filter((item) => !retrievedDriverIds.has(item.driverId)).length;
  const metrics = {
    scenarioName,
    totalFleetSize: drivers.length,
    retrievedCount: candidates.length,
    recallAt1: calcRecallAtK(1),
    recallAt5: calcRecallAtK(5),
    recallAt10: calcRecallAtK(10),
    recallAt25: calcRecallAtK(25),
    recallAt50: calcRecallAtK(50),
    recallAt100: calcRecallAtK(100),
    mrr,
    etaRegretSeconds,
    relativeEtaRegretPct,
    falseNegativeCount
  };
  return {
    metrics,
    groundTruthTop5: groundTruthScored.slice(0, 5),
    trihexTop5: candidates.slice(0, 5).map((c) => ({
      driverId: c.driverId,
      durationSeconds: c.finalScore,
      rank: c.rank
    }))
  };
}
function createRiverBarrierTopology() {
  const graph = new VersionedRoadGraph("river-barrier-v1");
  graph.addNode("island_1", { lat: 6.45, lng: 3.42 });
  graph.addNode("island_2", { lat: 6.455, lng: 3.425 });
  graph.addNode("island_3", { lat: 6.46, lng: 3.43 });
  graph.addNode("mainland_1", { lat: 6.48, lng: 3.42 });
  graph.addNode("mainland_2", { lat: 6.485, lng: 3.425 });
  graph.addNode("mainland_3", { lat: 6.49, lng: 3.43 });
  graph.addNode("bridge_south", { lat: 6.46, lng: 3.35 });
  graph.addNode("bridge_north", { lat: 6.48, lng: 3.35 });
  graph.addEdge("island_1", "island_2", { freeFlowSpeedKmh: 40 });
  graph.addEdge("island_2", "island_1", { freeFlowSpeedKmh: 40 });
  graph.addEdge("island_2", "island_3", { freeFlowSpeedKmh: 40 });
  graph.addEdge("island_3", "island_2", { freeFlowSpeedKmh: 40 });
  graph.addEdge("island_1", "bridge_south", { distanceMeters: 8e3, freeFlowSpeedKmh: 60 });
  graph.addEdge("bridge_south", "island_1", { distanceMeters: 8e3, freeFlowSpeedKmh: 60 });
  graph.addEdge("mainland_1", "mainland_2", { freeFlowSpeedKmh: 40 });
  graph.addEdge("mainland_2", "mainland_1", { freeFlowSpeedKmh: 40 });
  graph.addEdge("mainland_2", "mainland_3", { freeFlowSpeedKmh: 40 });
  graph.addEdge("mainland_3", "mainland_2", { freeFlowSpeedKmh: 40 });
  graph.addEdge("mainland_1", "bridge_north", { distanceMeters: 8e3, freeFlowSpeedKmh: 60 });
  graph.addEdge("bridge_north", "mainland_1", { distanceMeters: 8e3, freeFlowSpeedKmh: 60 });
  graph.addEdge("bridge_south", "bridge_north", { distanceMeters: 2500, freeFlowSpeedKmh: 70 });
  graph.addEdge("bridge_north", "bridge_south", { distanceMeters: 2500, freeFlowSpeedKmh: 70 });
  return {
    topology: graph,
    pickup: { lat: 6.455, lng: 3.425 },
    bridgeNode: "bridge_south"
  };
}
function createHighwayTopology() {
  const graph = new VersionedRoadGraph("highway-v1");
  graph.addNode("hw_0", { lat: 6.5, lng: 3.3 });
  graph.addNode("hw_1", { lat: 6.53, lng: 3.33 });
  graph.addNode("hw_2", { lat: 6.56, lng: 3.36 });
  graph.addNode("hw_3", { lat: 6.59, lng: 3.39 });
  graph.addEdge("hw_0", "hw_1", { freeFlowSpeedKmh: 100 });
  graph.addEdge("hw_1", "hw_2", { freeFlowSpeedKmh: 100 });
  graph.addEdge("hw_2", "hw_3", { freeFlowSpeedKmh: 100 });
  graph.addNode("local_1", { lat: 6.585, lng: 3.385 });
  graph.addNode("local_2", { lat: 6.588, lng: 3.388 });
  graph.addNode("pickup", { lat: 6.592, lng: 3.392 });
  graph.addEdge("hw_3", "pickup", { distanceMeters: 400, freeFlowSpeedKmh: 40 });
  graph.addEdge("local_1", "local_2", { distanceMeters: 800, freeFlowSpeedKmh: 15 });
  graph.addEdge("local_2", "pickup", { distanceMeters: 800, freeFlowSpeedKmh: 15 });
  return {
    topology: graph,
    pickup: { lat: 6.592, lng: 3.392 }
  };
}

// src/index.ts
var TriHex = class {
  /**
   * Convert geographic coordinates (latitude, longitude) to a 64-bit TriHexId
   * at the specified resolution (0 to 15).
   */
  static latLngToCell(lat, lng, resolution, topoCluster = 0) {
    validateCoordinates(lat, lng);
    validateResolution(resolution);
    if (!Number.isInteger(topoCluster) || topoCluster < 0 || topoCluster > 4095) {
      throw new RangeError(
        `Topology cluster ID ${topoCluster} is invalid. Must be an integer between 0 and 4095`
      );
    }
    const vec = geoToVector3D(lat, lng);
    const proj = projectToFace(vec);
    const { morton } = barycentricToMorton(proj.u, proj.v, resolution);
    const cellId = packTriHexId(proj.face, resolution, morton);
    if (topoCluster !== 0) {
      defaultTopologyRegistry.setCluster(cellId, topoCluster);
    }
    return cellId;
  }
  /**
   * Returns the center geographic coordinates (lat, lng) of a triangular cell
   */
  static cellToLatLng(id) {
    return cellToLatLng(id);
  }
  /**
   * Returns the 3 spherical boundary vertices of the triangular cell
   */
  static cellToBoundary(id) {
    return cellToBoundary(id);
  }
  /**
   * Returns the parent cell at a coarser resolution using exact bit-shift
   */
  static cellToParent(id, targetResolution) {
    return cellToParent(id, targetResolution);
  }
  /**
   * Returns all immediate child cells at targetResolution
   */
  static cellToChildren(id, targetResolution) {
    return cellToChildren(id, targetResolution);
  }
  /**
   * Returns the exact 1D contiguous range [startId, endId] of all descendant cells
   * at a finer targetResolution for instant B-Tree SQL index scans.
   */
  static cellToChildrenRange(id, targetResolution) {
    return cellToChildrenRange(id, targetResolution);
  }
  /**
   * Returns the three cells sharing a complete edge with this triangular cell.
   * Guarantees 100% reciprocal symmetry and edge sharing across icosahedron seams.
   */
  static getCellNeighbors(id) {
    return getCellNeighbors(id);
  }
  /**
   * Returns the triangular edge-adjacency graph disk within radius k.
   */
  static cellDisk(originId, radius) {
    return cellDisk(originId, radius);
  }
  /**
   * Canonical alias for cellDisk: returns the triangular edge-adjacency graph disk within radius k.
   */
  static getCellDisk(originId, radius) {
    return getCellDisk(originId, radius);
  }
  /**
   * Canonical alias for cellToBoundary: returns the 3 spherical boundary vertices of the triangular cell.
   */
  static getCellBoundary(id) {
    return getCellBoundary(id);
  }
  /**
   * Constructs the genuine spherical Voronoi dual cell (HexDual) for this cell.
   * Returns 6 spherical circumcenter vertices for regular hexagons, and 5 for the 12 pentagonal singularities.
   */
  static getHexDual(id) {
    return getHexDual(id);
  }
  /**
   * Returns the exact neighbor cells in the spherical Voronoi dual graph.
   * Returns 6 neighbors for regular hexagons, and 5 for the 12 pentagonal singularities.
   */
  static getHexNeighbors(id) {
    return getHexNeighbors(id);
  }
  /**
   * Canonical alias for getHexNeighbors: returns exact neighbors in the spherical Voronoi dual lattice.
   * Degree 6 for regular hexagons, degree 5 for the 12 pentagonal Euler singularities.
   */
  static getDualNeighbors(id) {
    return getDualNeighbors(id);
  }
  /**
   * Returns the exact spherical Voronoi boundary coordinates of the dual cell
   * (6 vertices for regular hexagons, 5 vertices for pentagons).
   */
  static getHexDualBoundary(id) {
    return getHexDualBoundary(id);
  }
  /**
   * Canonical alias for getHexDualBoundary: returns the perimeter coordinates of the spherical Voronoi dual cell.
   * (6 vertices for regular hexagons, 5 vertices for pentagons).
   */
  static getDualBoundary(id) {
    return getDualBoundary(id);
  }
  /**
   * Expands a breadth-first search on the hexagonal Voronoi dual graph up to radius k.
   * Produces 7 cells at radius 1, and 19 cells at radius 2 for regular hexagonal regions.
   */
  static hexRing(originId, radius) {
    return hexRing(originId, radius);
  }
  /**
   * Canonical alias for hexRing: expands a BFS disk on the spherical Voronoi dual graph up to radius k.
   */
  static getDualDisk(originId, radius) {
    return getDualDisk(originId, radius);
  }
  /**
   * Returns all canonical spherical Voronoi dual cells at the given resolution.
   * Total count is exactly 10 * 4^R + 2 (Euler characteristic).
   */
  static getResolutionDualCells(resolution) {
    return getResolutionDualCells(resolution);
  }
  /**
   * Singleton road network topology partition registry
   */
  static topology = defaultTopologyRegistry;
  /**
   * Compute topology-aware effective distance between two cells
   */
  static effectiveDistance(idA, idB, params, costMatrix, registry = defaultTopologyRegistry) {
    return effectiveDistance(idA, idB, params, costMatrix, registry);
  }
  /**
   * Calculate great-circle geodesic distance between two points in meters
   */
  static geodesicDistance(coordA, coordB) {
    return geodesicDistance(coordA, coordB);
  }
  /**
   * Extract the 12-bit topology cluster ID from the registry
   */
  static getTopologyCluster(id, registry = defaultTopologyRegistry) {
    return getTopologyCluster(id, registry);
  }
  /**
   * Sets a 12-bit topology cluster ID for a cell in the registry
   */
  static setTopologyCluster(id, clusterId, registry = defaultTopologyRegistry) {
    setTopologyCluster(id, clusterId, registry);
  }
  /**
   * Registers a topology cluster ID for the cell and returns the immutable TriHexId
   */
  static withTopologyCluster(id, clusterId, registry = defaultTopologyRegistry) {
    return withTopologyCluster(id, clusterId, registry);
  }
  /**
   * Check if two cells share the same road network partition cluster
   */
  static isSameCluster(idA, idB, registry = defaultTopologyRegistry) {
    return isSameCluster(idA, idB, registry);
  }
  /**
   * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string
   */
  static cellToString(id) {
    return cellToString(id);
  }
  /**
   * Parses a hexadecimal string into a 64-bit TriHexId with strict format validation
   */
  static stringToCell(str) {
    return stringToCell(str);
  }
  /**
   * Validates whether an input is a structurally sound 64-bit TriHexId
   */
  static isValidCell(input) {
    return isValidCell(input);
  }
  /**
   * JSON replacer function to safely serialize BigInt TriHexId values as hex strings
   */
  static bigIntReplacer(key, value) {
    return bigIntReplacer(key, value);
  }
  /**
   * Exports a triangular cell as an RFC 7946 GeoJSON Feature<Polygon>
   */
  static cellToGeoJSON(id) {
    return cellToGeoJSON(id);
  }
  /**
   * Exports the hexagonal Voronoi dual of a cell as an RFC 7946 GeoJSON Feature<Polygon>
   */
  static hexDualToGeoJSON(id) {
    return hexDualToGeoJSON(id);
  }
  /**
   * Bundles multiple TriHex cells into a standard GeoJSON FeatureCollection
   */
  static cellsToGeoJSON(ids, mode = "triangle") {
    return cellsToGeoJSON(ids, mode);
  }
  /**
   * Rasterizes a polyline route into an ordered sequence of contiguous TriHex cells
   * using spherical great-circle interpolation (Slerp).
   */
  static lineStringToCells(coordinates, resolution, topoCluster = 0) {
    return lineStringToCells(coordinates, resolution, topoCluster);
  }
  /**
   * Fills an arbitrary geographic polygon (with optional holes) with enclosing TriHex cells.
   */
  static polygonToCells(coordinates, resolution, options) {
    return polygonToCells(coordinates, resolution, options);
  }
  /**
   * Accelerated hierarchical quadtree polyfill for arbitrary polygons
   */
  static polygonToCellsHierarchical(coordinates, resolution, options) {
    return polygonToCellsHierarchical(coordinates, resolution, options);
  }
  /**
   * Directly rasterizes an arbitrary polygon into a maximally compacted set of mixed-resolution cells
   */
  static polygonToCompactedCells(coordinates, resolution, options) {
    return polygonToCompactedCells(coordinates, resolution, options);
  }
  /**
   * Constructs a canonical 63-bit Directed Edge ID representing flow from origin to adjacent destination
   */
  static getDirectedEdge(origin, destination) {
    return getDirectedEdge(origin, destination);
  }
  /**
   * Returns the origin cell ID of a directed edge
   */
  static getDirectedEdgeOrigin(edgeId) {
    return getDirectedEdgeOrigin(edgeId);
  }
  /**
   * Returns the destination cell ID of a directed edge
   */
  static getDirectedEdgeDestination(edgeId) {
    return getDirectedEdgeDestination(edgeId);
  }
  /**
   * Returns the shared boundary segment between the origin and destination of a directed edge
   */
  static getDirectedEdgeBoundary(edgeId) {
    return getDirectedEdgeBoundary(edgeId);
  }
  /**
   * Returns true if the given value is a valid directed edge ID
   */
  static isDirectedEdge(id) {
    return isDirectedEdge(id);
  }
  /**
   * Returns the approximate circumradius in meters for cells at a given resolution
   */
  static getResolutionCellRadius(resolution) {
    return getResolutionCellRadius(resolution);
  }
  /**
   * Compacts a set of cells by hierarchically merging 4-sibling clusters with deterministic sorting.
   */
  static compactCells(cells) {
    return compactCells(cells);
  }
  /**
   * Expands compacted cells down to a uniform target resolution.
   */
  static uncompactCells(cells, targetResolution) {
    return uncompactCells(cells, targetResolution);
  }
  /**
   * Unpack a 64-bit TriHexId into its individual components
   */
  static unpack(id) {
    return unpackTriHexId(id);
  }
  /**
   * Pack component fields into a 64-bit TriHexId (strictly 63-bit non-negative)
   */
  static pack(face, resolution, morton, _dualSector = 0, topoCluster = 0) {
    const cellId = packTriHexId(face, resolution, morton);
    if (topoCluster !== 0) {
      defaultTopologyRegistry.setCluster(cellId, topoCluster);
    }
    return cellId;
  }
  /**
   * Creates an instance of the Multi-Tier Mobility Dispatch Engine
   */
  static createDispatchEngine(options) {
    return new DispatchEngine(options);
  }
};
var latLngToCell = TriHex.latLngToCell;
var index_default = TriHex;
export {
  BIT_LAYOUT,
  DEFAULT_SHARD_RESOLUTION,
  DispatchEngine,
  EDGE_BIT_LAYOUT,
  FACE_CENTROIDS,
  FACE_EDGE_NEIGHBORS,
  FACE_NORMALS,
  ICOSAHEDRON_FACES,
  ICOSAHEDRON_VERTICES,
  InMemoryDriverRegistry,
  InMemoryDriverSpatialStore,
  MAX_CELL_RING_RADIUS,
  MAX_HEX_RING_RADIUS,
  MIGRATE_DRIVER_LUA,
  REMOVE_DRIVER_LUA,
  SimulatedRoadRoutingProvider,
  TopologyPartitionRegistry,
  TopologyRoutingProvider,
  TriHex,
  VERTEX_FACES,
  VersionedRoadGraph,
  barycentricToMorton,
  bigIntReplacer,
  cellDisk,
  cellToBoundary,
  cellToChildren,
  cellToChildrenRange,
  cellToGeoJSON,
  cellToLatLng,
  cellToParent,
  cellToString,
  cellsToGeoJSON,
  compactCells,
  createHighwayTopology,
  createRiverBarrierTopology,
  crossProduct,
  index_default as default,
  defaultTopologyRegistry,
  dotProduct,
  effectiveDistance,
  evaluateCandidateRecall,
  faceBarycentricToVector3D,
  formatCellKey,
  formatDriverKey,
  geoToVector3D,
  geodesicDistance,
  getCanonicalVertex,
  getCellBoundary,
  getCellDisk,
  getCellNeighbors,
  getDirectedEdge,
  getDirectedEdgeBoundary,
  getDirectedEdgeDestination,
  getDirectedEdgeDetails,
  getDirectedEdgeOrigin,
  getDualBoundary,
  getDualDisk,
  getDualNeighbors,
  getHexDual,
  getHexDualBoundary,
  getHexNeighbors,
  getResolutionCellRadius,
  getResolutionDualCells,
  getSpatialShard,
  getTopologyCluster,
  hexDualToGeoJSON,
  hexRing,
  inverseProjectFromFace,
  isDirectedEdge,
  isDualCellId,
  isSameCluster,
  isValidCell,
  latLngToCell,
  lineStringToCells,
  mortonToCorners,
  normalize,
  packDualCellId,
  packTriHexId,
  polygonToCells,
  polygonToCellsHierarchical,
  polygonToCompactedCells,
  projectToFace,
  setTopologyCluster,
  slerp,
  stringToCell,
  uncompactCells,
  unpackDualCellId,
  unpackTriHexId,
  validateCellId,
  validateCoordinates,
  validateDirectedEdge,
  validateRadius,
  validateResolution,
  vector3DToGeo,
  withTopologyCluster
};

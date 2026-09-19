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
function geodesicDistance(coordA, coordB) {
  const lat1 = coordA.lat * DEG2RAD;
  const lat2 = coordB.lat * DEG2RAD;
  const dLat = (coordB.lat - coordA.lat) * DEG2RAD;
  const dLng = (coordB.lng - coordA.lng) * DEG2RAD;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_METERS * c;
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
function cellToLatLng(id) {
  const { face, resolution, morton } = unpackTriHexId(id);
  const [a, b, c] = mortonToCorners(morton, resolution);
  const u = (a[0] + b[0] + c[0]) / 3;
  const v = (a[1] + b[1] + c[1]) / 3;
  return inverseProjectFromFace(face, u, v);
}

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
function cellToString(id) {
  validateCellId(id);
  return id.toString(16).toLowerCase().padStart(16, "0");
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
export {
  DEFAULT_SHARD_RESOLUTION,
  DispatchEngine,
  InMemoryDriverRegistry,
  InMemoryDriverSpatialStore,
  MIGRATE_DRIVER_LUA,
  REMOVE_DRIVER_LUA,
  formatCellKey,
  formatDriverKey,
  getSpatialShard
};

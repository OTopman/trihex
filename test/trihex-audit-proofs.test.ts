import { TriHex } from '../src/index';
import { geoToVector3D } from '../src/icosahedron';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

function sharesCompleteEdge(a: bigint, b: bigint): boolean {
  const vertices = (id: bigint) => TriHex.cellToBoundary(id)
    .map((point) => geoToVector3D(point.lat, point.lng)
      .map((coordinate) => coordinate.toFixed(10)).join(','));
  const aVertices = vertices(a);
  const bVertices = new Set(vertices(b));
  return aVertices.filter((vertex) => bVertices.has(vertex)).length === 2;
}

function runAuditProofs() {
  console.log('🔬 Starting TriHex Audit Proof & Invariant Verification Suite...\n');

  // =========================================================================
  // PROOF 1: B-Tree 1D Range Containment & Exclusion (P0-1 Fix Verification)
  // =========================================================================
  console.log('▶ Proof 1: B-Tree Range Containment & Exclusion (Zero False Positives)');
  let testedRanges = 0;

  for (let f = 0; f < 20; f++) {
    const parentRes = 6;
    const childRes = 8;
    // Generate parent on face f
    const parentCell = TriHex.pack(f, parentRes, 150n, 0, 0);
    const range = TriHex.cellToChildrenRange(parentCell, childRes);

    assert(range.start <= range.end, `Range start must be <= end for face ${f}`);

    // Verify all 16 valid children are strictly inside [start, end]
    const startMorton = 150n << 4n; // 150 * 16 = 2400
    for (let m = startMorton; m <= startMorton + 15n; m++) {
      const validChild = TriHex.pack(f, childRes, m, 5, 100);
      assert(
        validChild >= range.start && validChild <= range.end,
        `Valid child ${m} must fall inside range [start, end]`
      );
    }

    // Verify foreign faces are strictly EXCLUDED
    for (let foreignFace = 0; foreignFace < 20; foreignFace++) {
      if (foreignFace === f) continue;
      const foreignCell = TriHex.pack(foreignFace, childRes, startMorton, 0, 0);
      assert(
        foreignCell < range.start || foreignCell > range.end,
        `Foreign face ${foreignFace} must NOT be inside range for face ${f}!`
      );
    }

    // Verify foreign resolutions are strictly EXCLUDED
    for (let foreignRes = 0; foreignRes <= 15; foreignRes++) {
      if (foreignRes === childRes) continue;
      const foreignResMorton = foreignRes === 0 ? 0n : (1n << BigInt(foreignRes * 2)) - 1n;
      const foreignResCell = TriHex.pack(f, foreignRes, foreignResMorton, 0, 0);
      assert(
        foreignResCell < range.start || foreignResCell > range.end,
        `Foreign resolution ${foreignRes} must NOT be inside range for childRes ${childRes}!`
      );
    }

    testedRanges++;
  }
  console.log(`  ✓ Verified ${testedRanges} face ranges: 100% containment of children, 0% foreign face leaks, 0% foreign resolution leaks.`);

  // =========================================================================
  // PROOF 2: 3-Edge-Neighbour Count & Reciprocal Symmetry (P0-2 Fix Verification)
  // =========================================================================
  console.log('\n▶ Proof 2: 3-Edge-Neighbour Adjacency & Reciprocal Symmetry');
  const sampleCount = 5_000;
  let asymmetricEdges = 0;
  let totalEdges = 0;
  let nonThreeNeighbors = 0;
  let nonEdgeNeighbors = 0;

  for (let i = 0; i < sampleCount; i++) {
    const lat = (Math.random() - 0.5) * 170;
    const lng = (Math.random() - 0.5) * 360;
    const cellA = TriHex.latLngToCell(lat, lng, 6);
    const neighborsOfA = TriHex.getCellNeighbors(cellA);

    if (neighborsOfA.length !== 3) {
      nonThreeNeighbors++;
    }

    for (const cellB of neighborsOfA) {
      totalEdges++;
      if (!sharesCompleteEdge(cellA, cellB)) {
        nonEdgeNeighbors++;
      }
      const neighborsOfB = TriHex.getCellNeighbors(cellB);
      if (!neighborsOfB.some((c) => c === cellA)) {
        asymmetricEdges++;
      }
    }
  }

  assert(nonThreeNeighbors === 0, `Expected 0 cells with != 3 neighbours, got ${nonThreeNeighbors}`);
  assert(nonEdgeNeighbors === 0, `Expected every neighbour to share a complete edge, got ${nonEdgeNeighbors} violations`);
  assert(asymmetricEdges === 0, `Expected 0 asymmetric edges, got ${asymmetricEdges}`);
  console.log(`  ✓ Sampled ${sampleCount} global cells: exactly 3 edge neighbours for 100% of cells.`);
  console.log(`  ✓ Verified ${totalEdges} directed shared edges: 100.00% reciprocal symmetry (zero orphaned links).`);

  // =========================================================================
  // PROOF 3: Antimeridian Crossing & Scanline Rasterization (P0-3 Fix Verification)
  // =========================================================================
  console.log('\n▶ Proof 3: Antimeridian (+/-180 deg) Crossing & Bounded Rasterization');
  const fijiPolygon = [
    { lat: -16.0, lng: 179.0 },
    { lat: -16.0, lng: -179.0 },
    { lat: -17.0, lng: -179.0 },
    { lat: -17.0, lng: 179.0 },
  ];

  const startTime = performance.now();
  const fijiCells = TriHex.polygonToCells(fijiPolygon, 8);
  const elapsedMs = performance.now() - startTime;

  // The polygon area is ~1 deg x 2 deg. At Res 8 (circumradius ~15.8km), it should have < 250 cells, NOT 12,000+!
  assert(fijiCells.length > 0, 'Must produce cells inside polygon');
  assert(
    fijiCells.length < 300,
    `Antimeridian crossing must not leak across entire planet! Expected < 300 cells, got ${fijiCells.length}`
  );
  assert(elapsedMs < 50, `Scanline rasterization must be fast (< 50ms), took ${elapsedMs.toFixed(2)}ms`);
  console.log(`  ✓ Antimeridian crossing successfully resolved: ${fijiCells.length} cells in ${elapsedMs.toFixed(2)}ms (zero planetary leakage).`);

  // =========================================================================
  // PROOF 4: Compaction Ancestor Pruning & Canonicity (P1-3 Fix Verification)
  // =========================================================================
  console.log('\n▶ Proof 4: Hierarchical Compaction Ancestor Pruning');
  const grandparent = TriHex.latLngToCell(6.5244, 3.3792, 5);
  const parent = TriHex.latLngToCell(6.5244, 3.3792, 6);
  const child = TriHex.latLngToCell(6.5244, 3.3792, 7);

  // Input contains grandparent, parent, and child!
  const mixedInput = [child, parent, grandparent];
  const compacted = TriHex.compactCells(mixedInput);

  assert(compacted.length === 1, `Compacted set must contain only 1 cell (the grandparent), got ${compacted.length}`);
  assert(compacted[0] === grandparent, 'Subsumed parent and child must be pruned in favor of grandparent');
  console.log(`  ✓ Redundant descendants successfully pruned: [grandparent, parent, child] collapsed to [grandparent].`);

  // =========================================================================
  // PROOF 5: Input Validation & Boundary Robustness
  // =========================================================================
  console.log('\n▶ Proof 5: Strict Input Validation & Boundary Robustness');
  assert(!TriHex.isValidCell(''), 'Empty string is invalid');
  assert(!TriHex.isValidCell('0x'), 'Lone prefix is invalid');
  assert(!TriHex.isValidCell('0x123456789abcdef01'), 'More than 16 hex chars is invalid');
  assert(!TriHex.isValidCell(-5n), 'Negative BigInt is invalid');

  // Verify that stringToCell throws descriptive errors on malformed inputs
  let threwExpected = false;
  try {
    TriHex.stringToCell('not-hex');
  } catch (err) {
    threwExpected = true;
  }
  assert(threwExpected, 'stringToCell must throw on invalid input');
  console.log('  ✓ Robust validation verified across malformed strings, out-of-bounds BigInts, and overflow cases.');

  // =========================================================================
  // PROOF 6: PostgreSQL Signed 64-Bit Compatibility (Bit 63 == 0)
  // =========================================================================
  console.log('\n▶ Proof 6: PostgreSQL Signed 64-Bit Compatibility (Non-Negative int64)');
  const signedBuf = new BigInt64Array(1);
  for (let f = 0; f < 20; f++) {
    for (let r = 0; r <= 15; r++) {
      const maxMorton = (1n << BigInt(r * 2)) - 1n;
      const cell = TriHex.pack(f, r, maxMorton, 15, 4095);

      // Must not exceed 0x7fffffffffffffffn
      assert(
        cell <= 0x7fffffffffffffffn,
        `Cell on face ${f} exceeds 63-bit signed integer maximum: 0x${cell.toString(16)}`
      );
      assert(cell >= 0n, `Cell must be non-negative: ${cell}`);

      // Check signed int64 conversion
      signedBuf[0] = cell;
      const signedVal = signedBuf[0];
      assert(
        signedVal >= 0n,
        `Cell on face ${f} overflows into negative signed int64: ${signedVal}`
      );
      assert(signedVal === cell, `Signed int64 value must equal unsigned BigInt`);
    }
  }

  // Cross-face monotonicity in PostgreSQL B-Tree
  for (let f = 0; f < 19; f++) {
    const cellA = TriHex.pack(f, 9, 0n, 0, 0);
    const cellB = TriHex.pack(f + 1, 9, 0n, 0, 0);
    signedBuf[0] = cellA;
    const signedA = signedBuf[0];
    signedBuf[0] = cellB;
    const signedB = signedBuf[0];
    assert(cellA < cellB, `Face ${f} must be < Face ${f + 1} in unsigned comparison`);
    assert(
      signedA < signedB,
      `Face ${f} must be < Face ${f + 1} in signed int64 comparison (PostgreSQL B-Tree order)`
    );
  }
  console.log(
    '  ✓ Verified all 20 faces and 16 resolutions: 100% positive signed 64-bit integers with zero sign inversion in PostgreSQL B-Trees.'
  );

  // =========================================================================
  // PROOF 7: Input Sanitization & Denial-of-Service Guards
  // =========================================================================
  console.log('\n▶ Proof 7: Input Sanitization & Denial-of-Service Guards');
  // NaN coordinates
  let threwNaN = false;
  try {
    TriHex.latLngToCell(NaN, 10, 9);
  } catch (err: any) {
    threwNaN = err instanceof TypeError;
  }
  assert(threwNaN, 'latLngToCell must throw TypeError on NaN latitude');

  // Infinity coordinates
  let threwInf = false;
  try {
    TriHex.latLngToCell(10, Infinity, 9);
  } catch (err: any) {
    threwInf = err instanceof TypeError;
  }
  assert(threwInf, 'latLngToCell must throw TypeError on Infinity longitude');

  // Out of bounds coordinates
  let threwOOB = false;
  try {
    TriHex.latLngToCell(95.0, 10, 9);
  } catch (err: any) {
    threwOOB = err instanceof RangeError;
  }
  assert(threwOOB, 'latLngToCell must throw RangeError on latitude > 90');

  // Malformed component packing must reject rather than mask into another ID.
  const invalidPacks: [number, number, bigint][] = [
    [-1, 0, 0n],
    [20, 0, 0n],
    [0, -1, 0n],
    [0, 16, 0n],
    [0, 2, -1n],
    [0, 2, 16n],
  ];
  for (const [face, resolution, morton] of invalidPacks) {
    let threw = false;
    try {
      TriHex.pack(face, resolution, morton);
    } catch (err: any) {
      threw = err instanceof RangeError;
    }
    assert(threw, `pack must reject invalid components (${face}, ${resolution}, ${morton})`);
  }

  // Out of bounds cluster ID
  let threwCluster = false;
  try {
    TriHex.latLngToCell(10, 10, 9, 5000);
  } catch (err: any) {
    threwCluster = err instanceof RangeError;
  }
  assert(threwCluster, 'latLngToCell must throw RangeError on cluster ID > 4095');

  // cellDisk DoS guard
  let threwRingDoS = false;
  try {
    const validCell = TriHex.latLngToCell(0, 0, 9);
    TriHex.cellDisk(validCell, 100);
  } catch (err: any) {
    threwRingDoS = err instanceof RangeError;
  }
  assert(threwRingDoS, 'cellDisk must throw RangeError when radius exceeds MAX_CELL_RING_RADIUS (15)');

  console.log(
    '  ✓ Verified strict input rejection: NaNs, Infinities, latitude bounds, cluster IDs, and cellDisk DoS limits all safely enforced.'
  );

  console.log('\n🏆 ALL AUDIT PROOFS VERIFIED WITH 100% MATHEMATICAL RIGOR!\n');
}

runAuditProofs();

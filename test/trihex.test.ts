import { TriHex } from '../src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

function runTests() {
  console.log('🧪 Starting TriHex Test Suite...\n');

  // 1. Basic Coordinate to Cell Encoding
  console.log('▶ Test 1: Coordinate to Cell Encoding');
  const lagos = { lat: 6.5244, lng: 3.3792 };
  const cellRes9 = TriHex.latLngToCell(lagos.lat, lagos.lng, 9);
  assert(typeof cellRes9 === 'bigint', 'TriHexId must be a bigint');
  assert(cellRes9 > 0n, 'TriHexId must be a positive 64-bit integer');
  const unpacked = TriHex.unpack(cellRes9);
  assert(unpacked.resolution === 9, `Expected resolution 9, got ${unpacked.resolution}`);
  console.log(`  ✓ Lagos Cell ID (Res 9): 0x${cellRes9.toString(16)} (Face: ${unpacked.face})`);

  // 2. Center Coordinate Reconstruction (Roundtrip)
  console.log('\n▶ Test 2: Center Coordinate Reconstruction (Roundtrip)');
  const testLocations = [
    { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
    { name: 'Abuja', lat: 9.0765, lng: 7.3986 },
    { name: 'London', lat: 51.5074, lng: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'New York', lat: 40.7128, lng: -74.006 },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  ];

  for (const loc of testLocations) {
    const cellId = TriHex.latLngToCell(loc.lat, loc.lng, 14);
    const center = TriHex.cellToLatLng(cellId);
    const dist = TriHex.geodesicDistance(loc, center);
    // At res 14, circumradius is ~250m, point to centroid should be < 350m
    assert(dist < 350, `Roundtrip distance error too large for ${loc.name}: ${dist.toFixed(1)}m`);
    console.log(`  ✓ ${loc.name} Res 14 roundtrip distance to cell center: ${dist.toFixed(1)}m`);
  }

  // 3. Exact 1:4 Hierarchical Nesting & Contiguous 1D Range Scans
  console.log('\n▶ Test 3: Exact 1:4 Hierarchical Nesting & 1D B-Tree Range Scans');
  const parentRes = 6;
  const childRes = 8;
  const parentCell = TriHex.latLngToCell(lagos.lat, lagos.lng, parentRes);
  const range = TriHex.cellToChildrenRange(parentCell, childRes);

  assert(range.start <= range.end, 'Range start must be <= range end');
  const expectedChildCount = 1n << (BigInt(childRes - parentRes) * 2n); // 4^(8-6) = 16
  const actualChildCount = range.end - range.start + 1n;
  assert(
    actualChildCount === expectedChildCount,
    `Expected ${expectedChildCount} child cells in range, got ${actualChildCount}`
  );

  // Verify that any child point encoded at childRes falls strictly inside this range
  const directChild = TriHex.latLngToCell(lagos.lat, lagos.lng, childRes);
  assert(
    directChild >= range.start && directChild <= range.end,
    'Direct child cell must fall strictly inside parent range [start, end]'
  );

  // Verify cellToParent bit-shift
  const rollUpParent = TriHex.cellToParent(directChild, parentRes);
  assert(rollUpParent === parentCell, 'Parent roll-up must match original parent');
  console.log(`  ✓ Exact 1:4 nesting verified: 1 parent has ${expectedChildCount} contiguous child cells`);
  console.log(`  ✓ SQL Range Query: WHERE cell BETWEEN 0x${range.start.toString(16)} AND 0x${range.end.toString(16)}`);

  // 4. Triangular edge neighbours
  console.log('\n▶ Test 4: Triangular Edge Adjacency');
  const neighbors = TriHex.getCellNeighbors(cellRes9);
  assert(neighbors.length === 3, `Expected 3 edge neighbors, got ${neighbors.length}`);
  console.log(`  ✓ Triangular grid produced ${neighbors.length} edge neighbours`);

  // Verify k-ring expansion
  const diskR1 = TriHex.cellDisk(cellRes9, 1);
  assert(diskR1.length === 4, `Expected 4 cells in edge disk(1), got ${diskR1.length}`);
  const diskR2 = TriHex.cellDisk(cellRes9, 2);
  assert(diskR2.length === 10, `Expected 10 cells in edge disk(2), got ${diskR2.length}`);
  console.log(`  ✓ Triangular edge disk(1) = ${diskR1.length} cells, disk(2) = ${diskR2.length} cells`);

  // 5. Network Topology & Partition Cluster Embedding
  console.log('\n▶ Test 5: Road Network Topology Cluster Embedding');
  const islandCluster = 101; // E.g., Lagos Island
  const mainlandCluster = 102; // E.g., Lagos Mainland

  const cellIsland = TriHex.withTopologyCluster(cellRes9, islandCluster);
  const cellMainland = TriHex.withTopologyCluster(neighbors[0], mainlandCluster);

  assert(TriHex.getTopologyCluster(cellIsland) === islandCluster, 'Cluster ID must roundtrip');
  assert(TriHex.getTopologyCluster(cellMainland) === mainlandCluster, 'Cluster ID must roundtrip');
  assert(!TriHex.isSameCluster(cellIsland, cellMainland), 'Cells across barrier must have different clusters');

  const effDistDifferentCluster = TriHex.effectiveDistance(cellIsland, cellMainland);
  const effDistSameCluster = TriHex.effectiveDistance(cellIsland, TriHex.withTopologyCluster(neighbors[0], islandCluster));

  assert(
    effDistDifferentCluster > effDistSameCluster,
    'Crossing a physical barrier cluster must yield a higher effective distance'
  );
  console.log(
    `  ✓ Same-cluster distance: ${effDistSameCluster.toFixed(0)}m vs Cross-barrier effective distance: ${effDistDifferentCluster.toFixed(0)}m`
  );

  console.log('\n🎉 ALL TRIHEX UNIT TESTS PASSED SUCCESSFULLY!\n');
}

runTests();

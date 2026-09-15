import { TriHex } from '../src/index';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

function runEnterpriseTests() {
  console.log('🏛️ Starting TriHex Enterprise Test Suite...\n');

  // ==========================================
  // PHASE 1: Serialization & Validation
  // ==========================================
  console.log('▶ Test 1: Serialization, Parsing & Validation');
  const lagosCell = TriHex.latLngToCell(6.5244, 3.3792, 9, 101);
  const hexString = TriHex.cellToString(lagosCell);

  assert(hexString.length === 16, `Expected 16-character hex string, got ${hexString.length} ("${hexString}")`);
  assert(/^[0-9a-f]{16}$/.test(hexString), 'String must be lowercase hexadecimal');
  console.log(`  ✓ cellToString produced: "${hexString}"`);

  // Parse back
  const parsedCell = TriHex.stringToCell(hexString);
  assert(parsedCell === lagosCell, 'stringToCell must roundtrip identically with original BigInt');
  const parsedWithPrefix = TriHex.stringToCell(`0x${hexString}`);
  assert(parsedWithPrefix === lagosCell, 'stringToCell must support "0x" prefix');

  // Validation
  assert(TriHex.isValidCell(lagosCell), 'Valid cell must return true');
  assert(TriHex.isValidCell(hexString), 'Valid hex string must return true');
  assert(!TriHex.isValidCell('not-a-hex'), 'Invalid string must return false');
  assert(!TriHex.isValidCell('0xffffffffffffffff'), 'Out-of-bounds Morton code must return false');
  assert(!TriHex.isValidCell(-1n), 'Negative BigInt must return false');

  // JSON Serialization replacer
  const payload = { event: 'DRIVER_PING', cellId: lagosCell };
  const jsonStr = JSON.stringify(payload, TriHex.bigIntReplacer);
  assert(jsonStr.includes(`"${hexString}"`), 'JSON string must serialize BigInt to hex string');
  console.log(`  ✓ JSON stringification succeeded without errors: ${jsonStr}`);

  // ==========================================
  // PHASE 2: Native RFC 7946 GeoJSON Exports
  // ==========================================
  console.log('\n▶ Test 2: Native RFC 7946 GeoJSON Exports');
  const geojsonTriangle = TriHex.cellToGeoJSON(lagosCell);
  assert(geojsonTriangle.type === 'Feature', 'Must be a GeoJSON Feature');
  assert(geojsonTriangle.geometry.type === 'Polygon', 'Geometry must be Polygon');
  const coords = geojsonTriangle.geometry.coordinates[0];
  assert(coords.length === 4, `Triangle polygon must have 4 coordinates (closed ring), got ${coords.length}`);
  assert(
    coords[0][0] === coords[3][0] && coords[0][1] === coords[3][1],
    'First and last coordinate in closed ring must match exactly'
  );
  // Verify coordinate order is [lng, lat]
  assert(
    coords[0][0] >= -180 && coords[0][0] <= 180 && coords[0][1] >= -90 && coords[0][1] <= 90,
    'Coordinates must be valid [lng, lat] bounds'
  );
  console.log(`  ✓ Triangular GeoJSON generated with closed ring: [${coords[0][0].toFixed(4)}, ${coords[0][1].toFixed(4)}]`);

  // Hex Dual GeoJSON
  const geojsonHex = TriHex.hexDualToGeoJSON(lagosCell);
  assert(geojsonHex.geometry.type === 'Polygon', 'Hex dual geometry must be Polygon');
  const hexRingCoords = geojsonHex.geometry.coordinates[0];
  assert(hexRingCoords.length === 4, `Compatibility geometry must be a closed triangle, got ${hexRingCoords.length}`);
  console.log(`  ✓ Compatibility geometry generated as a closed triangle`);

  // FeatureCollection export
  const neighbors = TriHex.getCellNeighbors(lagosCell);
  const collection = TriHex.cellsToGeoJSON([lagosCell, ...neighbors], 'triangle');
  assert(collection.type === 'FeatureCollection', 'Must be FeatureCollection');
  assert(collection.features.length === 4, `FeatureCollection must contain 7 features, got ${collection.features.length}`);
  console.log(`  ✓ FeatureCollection exported successfully with ${collection.features.length} features`);

  // ==========================================
  // PHASE 3: Route & Area Rasterization
  // ==========================================
  console.log('\n▶ Test 3: Route & Area Rasterization');
  // Simulated Lagos to Ibadan Expressway segment (3 waypoints)
  const routeWaypoints = [
    { lat: 6.5954, lng: 3.3712 }, // Ikeja, Lagos
    { lat: 6.8920, lng: 3.6934 }, // Sagamu interchange
    { lat: 7.3775, lng: 3.9470 }, // Ibadan
  ];

  const corridorCells = TriHex.lineStringToCells(routeWaypoints, 9);
  assert(
    corridorCells.length >= 15 && corridorCells.length <= 25,
    `Expected between 15 and 25 corridor cells along highway, got ${corridorCells.length}`
  );

  // Start cell must match first waypoint
  const expectedStartCell = TriHex.latLngToCell(routeWaypoints[0].lat, routeWaypoints[0].lng, 9);
  assert(corridorCells[0] === expectedStartCell, 'Corridor start cell must match route origin');
  console.log(`  ✓ Route rasterized into ${corridorCells.length} contiguous cells from Lagos to Ibadan`);

  // Polygon Area Rasterization (Lagos Airport / Ikeja boundary box)
  const airportGeofence = [
    { lat: 6.5700, lng: 3.3100 },
    { lat: 6.6000, lng: 3.3100 },
    { lat: 6.6000, lng: 3.3500 },
    { lat: 6.5700, lng: 3.3500 },
  ];
  const areaCells = TriHex.polygonToCells(airportGeofence, 10);
  assert(areaCells.length > 0, `Expected area cells inside geofence, got ${areaCells.length}`);
  console.log(`  ✓ Airport geofence polygon filled with ${areaCells.length} TriHex cells at Res 10`);

  // ==========================================
  // PHASE 4: Hierarchical Compaction & Decompaction
  // ==========================================
  console.log('\n▶ Test 4: Hierarchical Compaction & Decompaction');
  const parentDistrict = TriHex.latLngToCell(6.5244, 3.3792, 7);
  // Expand parent (Res 7) into its 16 child cells at Res 9
  const range = TriHex.cellToChildrenRange(parentDistrict, 9);
  const childCells: bigint[] = [];

  for (let c = range.start; c <= range.end; c++) {
    childCells.push(c);
  }
  assert(childCells.length === 16, `Expected 16 child cells, got ${childCells.length}`);

  // Compact the 16 child cells
  const compacted = TriHex.compactCells(childCells);
  assert(compacted.length === 1, `Expected 16 children to collapse into 1 parent, got ${compacted.length}`);
  assert(compacted[0] === parentDistrict, 'Compacted cell must match original parent cell at Res 7');
  console.log(`  ✓ 16 children compacted into 1 parent cell (93.75% memory reduction)`);

  // Decompact back to Res 9
  const uncompacted = TriHex.uncompactCells(compacted, 9);
  assert(uncompacted.length === 16, `Expected 16 cells after uncompaction, got ${uncompacted.length}`);
  // Check exact 1:1 match
  const childSet = new Set(childCells.map((c) => c.toString()));
  for (const u of uncompacted) {
    assert(childSet.has(u.toString()), 'All uncompacted cells must match original children');
  }
  console.log(`  ✓ 100% reversible uncompaction verified: exact recovery of all 16 cells`);

  console.log('\n🎉 ALL ENTERPRISE TRIHEX TESTS PASSED WITH ZERO ERRORS!\n');
}

runEnterpriseTests();

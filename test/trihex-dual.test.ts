import { geoToVector3D } from '../src/icosahedron';
import { TriHex } from '../src/index';
import { TriHexId } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

function vKey(lat: number, lng: number): string {
  const v = geoToVector3D(lat, lng);
  return `${v[0].toFixed(8)},${v[1].toFixed(8)},${v[2].toFixed(8)}`;
}

/**
 * Checks whether two dual cells share a complete dual edge (exactly two circumcenter vertices).
 */
function sharesCompleteDualEdge(cellA: TriHexId, cellB: TriHexId): boolean {
  const boundaryA = TriHex.getHexDualBoundary(cellA).map((c) => vKey(c.lat, c.lng));
  const boundaryB = new Set(TriHex.getHexDualBoundary(cellB).map((c) => vKey(c.lat, c.lng)));
  const shared = boundaryA.filter((v) => boundaryB.has(v));
  return shared.length === 2;
}

async function runDualTests() {
  console.log('⬡ Starting TriHex Genuine Spherical Voronoi Dual Test Suite...\n');

  // =========================================================================
  // TEST 1: Exhaustive Resolution 1 Dual Verification (All 42 Canonical Cells)
  // =========================================================================
  console.log('▶ Test 1: Exhaustive Resolution 1 Dual Graph Verification (Euler V = 10*4^1 + 2 = 42)');
  const res1DualCells = TriHex.getResolutionDualCells(1);
  assert(res1DualCells.length === 42, `Expected 42 canonical dual cells at res 1, got ${res1DualCells.length}`);

  let pentagons = 0;
  let hexagons = 0;
  let directedLinks = 0;
  let sharedEdgeViolations = 0;
  let reciprocityViolations = 0;

  for (const cellId of res1DualCells) {
    const dual = TriHex.getHexDual(cellId);

    if (dual.isPentagon) {
      pentagons++;
      assert(dual.degree === 5, `Pentagon must have degree 5, got ${dual.degree}`);
      assert(dual.boundary.length === 5, `Pentagon must have 5 boundary vertices, got ${dual.boundary.length}`);
      assert(dual.neighbors.length === 5, `Pentagon must have 5 neighbors, got ${dual.neighbors.length}`);
    } else {
      hexagons++;
      assert(dual.degree === 6, `Hexagon must have degree 6, got ${dual.degree}`);
      assert(dual.boundary.length === 6, `Hexagon must have 6 boundary vertices, got ${dual.boundary.length}`);
      assert(dual.neighbors.length === 6, `Hexagon must have 6 neighbors, got ${dual.neighbors.length}`);
    }

    // Check each neighbor
    for (const nId of dual.neighbors) {
      directedLinks++;
      // Verify shared dual edge
      if (!sharesCompleteDualEdge(cellId, nId)) {
        sharedEdgeViolations++;
      }
      // Verify reciprocity
      const nNeighbors = TriHex.getHexNeighbors(nId);
      if (!nNeighbors.some((back) => back === cellId)) {
        reciprocityViolations++;
      }
    }
  }

  console.log(`  ✓ Evaluated 42 canonical dual cells at resolution 1 (${directedLinks} directed dual neighbor links)`);
  console.log(`  ✓ Hexagons found: ${hexagons}, Pentagons found: ${pentagons}`);
  console.log(`  ✓ Shared-edge violations: ${sharedEdgeViolations} (100% of reported links share complete dual edge)`);
  console.log(`  ✓ Reciprocity violations: ${reciprocityViolations} (100% reciprocal symmetry)`);
  assert(pentagons === 12, `Must find exactly 12 icosahedral pentagons, got ${pentagons}`);
  assert(hexagons === 30, `Must find exactly 30 hexagons at res 1, got ${hexagons}`);
  assert(sharedEdgeViolations === 0, 'All reported dual links must share a complete dual edge');
  assert(reciprocityViolations === 0, 'All dual links must be reciprocal');

  // =========================================================================
  // TEST 2: Primal Triangle -> Dual Voronoi Cell Mapping
  // =========================================================================
  console.log('\n▶ Test 2: Primal Triangle Cell to Dual Voronoi Mapping (All 80 Primal Triangles)');
  let trianglesTested = 0;
  for (let f = 0; f < 20; f++) {
    for (let m = 0n; m < 4n; m++) {
      const primalId = TriHex.pack(f, 1, m);
      const dual = TriHex.getHexDual(primalId);
      assert(dual.degree === 5 || dual.degree === 6, 'Dual cell must have degree 5 or 6');
      assert(dual.boundary.length === dual.degree, 'Boundary length must match degree');
      assert(dual.neighbors.length === dual.degree, 'Neighbor count must match degree');
      trianglesTested++;
    }
  }
  console.log(`  ✓ Successfully mapped ${trianglesTested} primal triangles to valid spherical Voronoi dual cells`);

  // =========================================================================
  // TEST 3: Hexagonal Ring Formula Verification (1 + 3k(k+1) = 19 for k=2)
  // =========================================================================
  console.log('\n▶ Test 3: Hexagonal Ring BFS Expansion (hexRing)');
  const lagosCell = TriHex.latLngToCell(6.5244, 3.3792, 9);
  const ring1 = TriHex.hexRing(lagosCell, 1);
  const ring2 = TriHex.hexRing(lagosCell, 2);

  // For regular hexagonal tiling:
  // k = 1: 1 + 6 = 7 cells
  // k = 2: 1 + 6 + 12 = 19 cells
  assert(ring1.length === 7, `Expected 7 cells in hexRing(1) for regular hexagon, got ${ring1.length}`);
  assert(ring2.length === 19, `Expected 19 cells in hexRing(2) for regular hexagon, got ${ring2.length}`);
  console.log(`  ✓ hexRing(origin, 1) = ${ring1.length} cells (1 center + 6 neighbors)`);
  console.log(`  ✓ hexRing(origin, 2) = ${ring2.length} cells (matches exact formula 1 + 3*2*3 = 19)`);

  // =========================================================================
  // TEST 4: GeoJSON Hexagonal Polygon Export
  // =========================================================================
  console.log('\n▶ Test 4: RFC 7946 GeoJSON Hex Dual Polygon Export');
  const geojson = TriHex.hexDualToGeoJSON(lagosCell);
  assert(geojson.type === 'Feature', 'Must be GeoJSON Feature');
  assert(geojson.geometry.type === 'Polygon', 'Geometry must be Polygon');
  const coordinates = geojson.geometry.coordinates[0];
  assert(coordinates.length === 7, `Closed hexagon ring must have 7 coordinates (6 vertices + close), got ${coordinates.length}`);
  assert(
    coordinates[0][0] === coordinates[6][0] && coordinates[0][1] === coordinates[6][1],
    'First and last coordinate in closed ring must match'
  );
  assert(geojson.properties.degree === 6, 'Regular cell must have degree 6');
  assert(!geojson.properties.isPentagon, 'Regular cell must not be pentagon');
  console.log(`  ✓ GeoJSON hexagon exported successfully with closed ring: [${coordinates[0][0].toFixed(4)}, ${coordinates[0][1].toFixed(4)}]`);

  console.log('\n🏆 ALL GENUINE SPHERICAL VORONOI DUAL TESTS PASSED WITH 100% GEOMETRIC INTEGRITY!\n');
}

runDualTests().catch((err) => {
  console.error('Fatal error during dual tests:', err);
  process.exit(1);
});

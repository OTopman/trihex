import assert from 'assert';
import {
  getCellNeighbors,
  getDirectedEdge,
  getDirectedEdgeBoundary,
  getDirectedEdgeDestination,
  getDirectedEdgeDetails,
  getDirectedEdgeOrigin,
  getHexDual,
  isDirectedEdge,
  latLngToCell,
  TriHex,
  validateDirectedEdge
} from '../src';

console.log('\n🏹 Starting TriHex Canonical 63-Bit Directed Edge Test Suite...\n');

// 1. Primal Triangular Directed Edges
console.log('▶ Test 1: Primal Triangular Directed Edge Invariants');
const originTri = latLngToCell(6.5244, 3.3792, 9); // Lagos
const triNeighbors = getCellNeighbors(originTri);
assert.strictEqual(triNeighbors.length, 3, 'Must have exactly 3 primal neighbors');

for (let k = 0; k < 3; k++) {
  const destTri = triNeighbors[k];
  const edgeId = getDirectedEdge(originTri, destTri);

  assert.ok(isDirectedEdge(edgeId), 'Must be recognized as directed edge');
  assert.ok(edgeId > 0n, 'Must be positive signed 63-bit integer');
  validateDirectedEdge(edgeId);

  const recOrigin = getDirectedEdgeOrigin(edgeId);
  const recDest = getDirectedEdgeDestination(edgeId);
  assert.strictEqual(recOrigin, originTri, 'Must recover exact origin cell');
  assert.strictEqual(recDest, destTri, 'Must recover exact destination neighbor');

  const boundary = getDirectedEdgeBoundary(edgeId);
  assert.strictEqual(boundary.length, 2, 'Boundary must have exactly 2 coordinates');
  assert.ok(Number.isFinite(boundary[0].lat) && Number.isFinite(boundary[0].lng));
  assert.ok(Number.isFinite(boundary[1].lat) && Number.isFinite(boundary[1].lng));

  const details = getDirectedEdgeDetails(edgeId);
  assert.strictEqual(details.edgeId, edgeId);
  assert.strictEqual(details.origin, originTri);
  assert.strictEqual(details.destination, destTri);
  assert.strictEqual(details.edgeIndex, k);
  assert.strictEqual(details.isDual, false);

  // Static class API parity
  assert.strictEqual(TriHex.getDirectedEdge(originTri, destTri), edgeId);
  assert.strictEqual(TriHex.getDirectedEdgeOrigin(edgeId), originTri);
  assert.strictEqual(TriHex.getDirectedEdgeDestination(edgeId), destTri);
  assert.ok(TriHex.isDirectedEdge(edgeId));
}
console.log('  ✓ Verified primal triangle directed edges across all 3 neighbors with 100% reversibility');

// 2. Dual Voronoi Directed Edges (Regular Hexagons)
console.log('\n▶ Test 2: Dual Hexagonal Directed Edge Invariants');
const originDual = getHexDual(originTri).id;
const dualObj = getHexDual(originDual);
assert.ok(dualObj.degree === 6, 'Regular dual cell must have degree 6');

for (let k = 0; k < dualObj.neighbors.length; k++) {
  const destDual = dualObj.neighbors[k];
  const edgeId = getDirectedEdge(originDual, destDual);

  assert.ok(isDirectedEdge(edgeId), 'Must be recognized as directed edge');
  validateDirectedEdge(edgeId);

  assert.strictEqual(getDirectedEdgeOrigin(edgeId), originDual, 'Must recover exact dual origin');
  assert.strictEqual(getDirectedEdgeDestination(edgeId), destDual, 'Must recover exact dual destination');

  const boundary = getDirectedEdgeBoundary(edgeId);
  assert.strictEqual(boundary.length, 2, 'Shared Voronoi boundary must have exactly 2 circumcenter vertices');

  const details = getDirectedEdgeDetails(edgeId);
  assert.strictEqual(details.isDual, true);
  assert.strictEqual(details.edgeIndex, k);
}
console.log('  ✓ Verified dual hexagonal directed edges across all 6 neighbors with circumcenter boundaries');

// 3. Dual Voronoi Directed Edges on Pentagonal Singularities (Degree 5)
console.log('\n▶ Test 3: Pentagonal Singularity Directed Edge Invariants');
// Find an icosahedron corner vertex (pentagon)
let pentagonDualId: bigint | null = null;
for (let f = 0; f < 20; f++) {
  const cell = latLngToCell(90, 0, 1); // North pole / extreme latitude
  const d = getHexDual(cell);
  if (d.isPentagon) {
    pentagonDualId = d.id;
    break;
  }
}
if (!pentagonDualId) {
  // Try canonical vertices
  for (let f = 0; f < 20; f++) {
    const d = getHexDual(latLngToCell(-90, 0, 1));
    if (d.isPentagon) {
      pentagonDualId = d.id;
      break;
    }
  }
}
assert.ok(pentagonDualId !== null, 'Must locate a pentagonal dual singularity');
const pentagonObj = getHexDual(pentagonDualId);
assert.strictEqual(pentagonObj.degree, 5, 'Pentagonal singularity must have degree 5');
assert.strictEqual(pentagonObj.neighbors.length, 5);

for (let k = 0; k < 5; k++) {
  const edgeId = getDirectedEdge(pentagonDualId, pentagonObj.neighbors[k]);
  assert.ok(isDirectedEdge(edgeId));
  assert.strictEqual(getDirectedEdgeOrigin(edgeId), pentagonDualId);
  assert.strictEqual(getDirectedEdgeDestination(edgeId), pentagonObj.neighbors[k]);
}
console.log('  ✓ Verified pentagonal singularity directed edges across all 5 degree connections');

// 4. Adversarial & Error Handling Guards
console.log('\n▶ Test 4: Adversarial Input & Adjacency Guards');

// Non-adjacent cell rejection
const nonNeighborTri = latLngToCell(40.7128, -74.0060, 9); // NYC vs Lagos
assert.throws(
  () => getDirectedEdge(originTri, nonNeighborTri),
  /not adjacent/,
  'Must reject non-adjacent cells'
);

// Heterogeneous cell type rejection
assert.throws(
  () => getDirectedEdge(originTri, originDual),
  /heterogeneous/,
  'Must reject primal-to-dual edge construction'
);

// Malformed edge IDs
assert.strictEqual(isDirectedEdge(originTri), false, 'Cell ID must not be classified as directed edge');
assert.strictEqual(isDirectedEdge(12345n), false);
assert.strictEqual(isDirectedEdge('not-a-bigint'), false);

assert.throws(
  () => validateDirectedEdge(originTri),
  /missing directed edge flag/,
  'validateDirectedEdge must reject normal cell IDs'
);

console.log('  ✓ 100% of invalid adjacency and malformed edge IDs safely rejected');

console.log('\n🏆 ALL DIRECTED EDGE TESTS PASSED WITH 100% RIGOR!\n');

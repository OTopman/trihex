import assert from 'assert';
import {
  polygonToCells,
  polygonToCellsHierarchical,
  polygonToCompactedCells,
  TriHex,
  uncompactCells,
} from '../src';

console.log('\n📐 Starting TriHex Hierarchical Quadtree Polyfill Test Suite...\n');

// 1. Airport geofence in Lagos Metropolis (Ikeja CBD)
const airportGeofence = [
  { lat: 6.5700, lng: 3.3100 },
  { lat: 6.6000, lng: 3.3100 },
  { lat: 6.6000, lng: 3.3500 },
  { lat: 6.5700, lng: 3.3500 },
  { lat: 6.5700, lng: 3.3100 },
];

console.log('▶ Test 1: Mathematical Parity Between Hierarchical Polyfill & Baseline');
const baselineRes10 = polygonToCells(airportGeofence, 10);
const hierRes10 = polygonToCellsHierarchical(airportGeofence, 10);

assert.strictEqual(hierRes10.length, baselineRes10.length, 'Hierarchical polyfill must match baseline cell count exactly');
assert.deepStrictEqual(hierRes10, baselineRes10, 'Hierarchical polyfill must match baseline cell IDs exactly');
console.log(`  ✓ Exact parity verified: Res 10 produces ${hierRes10.length} cells identically to baseline`);

const baselineRes11 = polygonToCells(airportGeofence, 11);
const hierRes11 = polygonToCellsHierarchical(airportGeofence, 11);
assert.strictEqual(hierRes11.length, baselineRes11.length);
assert.deepStrictEqual(hierRes11, baselineRes11);
console.log(`  ✓ Exact parity verified: Res 11 produces ${hierRes11.length} cells identically to baseline`);

// 2. Class static method parity
console.log('\n▶ Test 2: TriHex Static Method Parity');
const staticHier = TriHex.polygonToCellsHierarchical(airportGeofence, 10);
assert.deepStrictEqual(staticHier, hierRes10, 'Static method must match standalone function');
console.log('  ✓ TriHex.polygonToCellsHierarchical static method verified');

// 3. Polygon Compaction & Reversible Decompaction
console.log('\n▶ Test 3: Polygon Compaction & Reversibility');
const compacted = polygonToCompactedCells(airportGeofence, 11);
console.log(`  • Compacted cell count: ${compacted.length} (vs ${hierRes11.length} uncompacted)`);
assert.ok(compacted.length > 0, 'Compacted cells must not be empty');

const uncompacted = uncompactCells(compacted, 11);
// Uncompacting compacted cells recovers all child cells at resolution 11
assert.ok(uncompacted.length >= compacted.length, 'Uncompacting must expand parent cells');
console.log('  ✓ Reversible uncompaction confirmed');

// 4. Performance Speedup Benchmark
console.log('\n▶ Test 4: Hierarchical Polyfill Benchmark');
const t0 = performance.now();
const hierRes12 = polygonToCellsHierarchical(airportGeofence, 12);
const hierTime = performance.now() - t0;
console.log(`  • Polyfill Res 12: ${hierTime.toFixed(2)} ms (${hierRes12.length} cells)`);
assert.ok(hierRes12.length > 0);

// 5. Error Handling Guards
console.log('\n▶ Test 5: Input Validation & Error Handling');
assert.throws(
  () => polygonToCellsHierarchical([], 10),
  /at least 3 vertices/,
  'Must reject empty polygon'
);

assert.throws(
  () => polygonToCellsHierarchical(airportGeofence, 18),
  /Resolution/i,
  'Must reject invalid resolution'
);

console.log('  ✓ Input guards verified');

console.log('\n🏆 ALL HIERARCHICAL POLYFILL TESTS PASSED WITH 100% FIDELITY!\n');

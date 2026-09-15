import { TriHex } from '../src/index';

function runBenchmarks() {
  console.log('⚡ Running TriHex High-Performance Benchmark Suite...\n');

  const iterations = 100_000;
  const sampleLats = [6.5244, 9.0765, 51.5074, 35.6762, 40.7128];
  const sampleLngs = [3.3792, 7.3986, -0.1278, 139.6503, -74.006];

  // 1. latLngToCell Benchmark
  {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const idx = i % sampleLats.length;
      TriHex.latLngToCell(sampleLats[idx], sampleLngs[idx], 9);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / (elapsed / 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const usPerOp = (elapsed / iterations * 1000).toFixed(2);
    console.log(`🚀 latLngToCell (Res 9):         ${opsPerSec} ops/sec (${usPerOp} µs/op)`);
  }

  // 2. cellToLatLng Benchmark
  {
    const sampleCell = TriHex.latLngToCell(6.5244, 3.3792, 9);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      TriHex.cellToLatLng(sampleCell);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / (elapsed / 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const usPerOp = (elapsed / iterations * 1000).toFixed(2);
    console.log(`🚀 cellToLatLng:                ${opsPerSec} ops/sec (${usPerOp} µs/op)`);
  }

  // 3. cellToParent (Exact Bit-Shift) Benchmark
  {
    const sampleCell = TriHex.latLngToCell(6.5244, 3.3792, 12);
    const start = performance.now();
    for (let i = 0; i < iterations * 5; i++) {
      TriHex.cellToParent(sampleCell, 8);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = ((iterations * 5) / (elapsed / 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const usPerOp = (elapsed / (iterations * 5) * 1000).toFixed(2);
    console.log(`🚀 cellToParent (Bit-shift):     ${opsPerSec} ops/sec (${usPerOp} µs/op)`);
  }

  // 4. cellToChildrenRange (1D SQL Range Calculation) Benchmark
  {
    const sampleCell = TriHex.latLngToCell(6.5244, 3.3792, 6);
    const start = performance.now();
    for (let i = 0; i < iterations * 5; i++) {
      TriHex.cellToChildrenRange(sampleCell, 9);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = ((iterations * 5) / (elapsed / 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const usPerOp = (elapsed / (iterations * 5) * 1000).toFixed(2);
    console.log(`🚀 cellToChildrenRange (Range):  ${opsPerSec} ops/sec (${usPerOp} µs/op)`);
  }

  // 5. getCellNeighbors (edge lookup) Benchmark
  {
    const sampleCell = TriHex.latLngToCell(6.5244, 3.3792, 9);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      TriHex.getCellNeighbors(sampleCell);
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / (elapsed / 1000)).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const usPerOp = (elapsed / iterations * 1000).toFixed(2);
    console.log(`🚀 getCellNeighbors (edge):    ${opsPerSec} ops/sec (${usPerOp} µs/op)`);
  }

  console.log('\n✅ Benchmark Completed!\n');
}

runBenchmarks();

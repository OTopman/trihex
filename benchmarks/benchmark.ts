import os from 'os';
import { TriHex } from '../src/index';

interface BenchmarkResult {
  name: string;
  iterations: number;
  opsPerSec: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
  p999Us: number;
  heapAllocMb: number;
}

function printEnvironment() {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
  console.log('================================================================================');
  console.log('🔬 TRIHEX RIGOROUS STATISTICAL BENCHMARK HARNESS');
  console.log('================================================================================');
  console.log(`Platform:    ${os.platform()} (${os.arch()}) | Node: ${process.version}`);
  console.log(`CPU Model:   ${cpuModel} (${cpus.length} logical cores)`);
  console.log(`Memory:      ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB RAM`);
  console.log('Methodology: 10,000 warmup iterations (V8 TurboFan JIT tier-up),');
  console.log('             uniform random coordinate sampling, per-batch HR-time percentiles,');
  console.log('             and GC / heap allocation delta monitoring.');
  console.log('================================================================================\n');
}

function runBenchmarkTest<T>(
  name: string,
  warmupIterations: number,
  measuredIterations: number,
  setupFn: () => () => T
): BenchmarkResult {
  const fn = setupFn();

  // 1. Warmup Phase (Trigger V8 JIT tier-up, IC optimization, and deopt stabilization)
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  // 2. Garbage Collection Hint (if exposed) / Baseline Memory Measurement
  if (global.gc) {
    global.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;

  // 3. Measured Phase with Batch Timing (to minimize process.hrtime overhead while capturing fine distribution)
  const batchSize = 100;
  const numBatches = Math.floor(measuredIterations / batchSize);
  const batchTimesUs: number[] = new Array(numBatches);

  const tStart = process.hrtime.bigint();

  for (let b = 0; b < numBatches; b++) {
    const bStart = process.hrtime.bigint();
    for (let i = 0; i < batchSize; i++) {
      fn();
    }
    const bEnd = process.hrtime.bigint();
    batchTimesUs[b] = Number(bEnd - bStart) / (batchSize * 1000); // microseconds per single op
  }

  const tEnd = process.hrtime.bigint();
  const memAfter = process.memoryUsage().heapUsed;

  const totalTimeSec = Number(tEnd - tStart) / 1_000_000_000;
  const actualIterations = numBatches * batchSize;
  const opsPerSec = Math.round(actualIterations / totalTimeSec);
  const heapAllocMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

  batchTimesUs.sort((a, b) => a - b);
  const p50Us = batchTimesUs[Math.floor(numBatches * 0.50)];
  const p95Us = batchTimesUs[Math.floor(numBatches * 0.95)];
  const p99Us = batchTimesUs[Math.floor(numBatches * 0.99)];
  const p999Us = batchTimesUs[Math.floor(numBatches * 0.999)];

  return {
    name,
    iterations: actualIterations,
    opsPerSec,
    p50Us,
    p95Us,
    p99Us,
    p999Us,
    heapAllocMb,
  };
}

function formatResult(r: BenchmarkResult): string {
  const opsStr = r.opsPerSec.toLocaleString().padStart(12);
  const p50Str = `${r.p50Us.toFixed(3)} µs`.padStart(11);
  const p95Str = `${r.p95Us.toFixed(3)} µs`.padStart(11);
  const p99Str = `${r.p99Us.toFixed(3)} µs`.padStart(11);
  const p999Str = `${r.p999Us.toFixed(3)} µs`.padStart(11);
  const heapStr = `${r.heapAllocMb.toFixed(2)} MB`.padStart(9);
  return `${r.name.padEnd(38)} | ${opsStr} | ${p50Str} | ${p95Str} | ${p99Str} | ${p999Str} | ${heapStr}`;
}

async function runAllBenchmarks() {
  printEnvironment();

  console.log(
    'Operation                              |   Throughput |    p50 (µs) |    p95 (µs) |    p99 (µs) |  p99.9 (µs) | Heap Delta'
  );
  console.log(
    '---------------------------------------+--------------+-------------+-------------+-------------+-------------+------------'
  );

  // Pre-generate 10,000 diverse random coordinates to benchmark realistic global lookups
  const sampleSize = 10_000;
  const lats = new Float64Array(sampleSize);
  const lngs = new Float64Array(sampleSize);
  for (let i = 0; i < sampleSize; i++) {
    lats[i] = (Math.random() * 170) - 85;
    lngs[i] = (Math.random() * 360) - 180;
  }

  // Benchmark 1: latLngToCell (Resolution 9 - City Uber/Lyft Micro-dispatch)
  const bench1 = runBenchmarkTest('latLngToCell (Res 9, City)', 10_000, 100_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.latLngToCell(lats[idx], lngs[idx], 9);
    };
  });
  console.log(formatResult(bench1));

  // Benchmark 2: latLngToCell (Resolution 14 - High-Precision Sub-meter)
  const bench2 = runBenchmarkTest('latLngToCell (Res 14, Sub-meter)', 10_000, 100_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.latLngToCell(lats[idx], lngs[idx], 14);
    };
  });
  console.log(formatResult(bench2));

  // Benchmark 3: cellToLatLng (Reconstruction to Great-Circle Spherical Centroid)
  const sampleCells = Array.from({ length: sampleSize }, (_, i) => TriHex.latLngToCell(lats[i], lngs[i], 9));
  const bench3 = runBenchmarkTest('cellToLatLng (Spherical Centroid)', 10_000, 100_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.cellToLatLng(sampleCells[idx]);
    };
  });
  console.log(formatResult(bench3));

  // Benchmark 4: cellToParent (Exact Bit-Shift Quadtree Ancestor)
  const bench4 = runBenchmarkTest('cellToParent (Bit-shift Hierarchical)', 10_000, 200_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.cellToParent(sampleCells[idx], 6);
    };
  });
  console.log(formatResult(bench4));

  // Benchmark 5: cellToChildrenRange (1D SQL B-Tree Range)
  const bench5 = runBenchmarkTest('cellToChildrenRange (1D B-Tree Range)', 10_000, 200_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.cellToChildrenRange(sampleCells[idx], 11);
    };
  });
  console.log(formatResult(bench5));

  // Benchmark 6: getCellNeighbors (3-Edge Triangular Adjacent Neighbours)
  const bench6 = runBenchmarkTest('getCellNeighbors (3-Edge Adjacent)', 10_000, 100_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.getCellNeighbors(sampleCells[idx]);
    };
  });
  console.log(formatResult(bench6));

  // Benchmark 7: getHexNeighbors (6-Neighbor Spherical Voronoi Dual)
  const bench7 = runBenchmarkTest('getHexNeighbors (6-Neighbor Voronoi Dual)', 5_000, 50_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.getHexNeighbors(sampleCells[idx]);
    };
  });
  console.log(formatResult(bench7));

  // Benchmark 8: cellDisk(origin, 2) (10-Cell Triangular BFS Expansion)
  const bench8 = runBenchmarkTest('cellDisk (Radius 2, 10 Triangles)', 5_000, 50_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.cellDisk(sampleCells[idx], 2);
    };
  });
  console.log(formatResult(bench8));

  // Benchmark 9: hexRing(origin, 2) (19-Cell Hexagonal Voronoi Dual Expansion)
  const bench9 = runBenchmarkTest('hexRing (Radius 2, 19 Hexagons)', 2_000, 20_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.hexRing(sampleCells[idx], 2);
    };
  });
  console.log(formatResult(bench9));

  // Benchmark 10: cellToString & stringToCell (16-Char Hex Serialization)
  const bench10 = runBenchmarkTest('cellToString (Canonical 16-Char Hex)', 10_000, 100_000, () => {
    let cursor = 0;
    return () => {
      const idx = cursor++ % sampleSize;
      return TriHex.cellToString(sampleCells[idx]);
    };
  });
  console.log(formatResult(bench10));

  console.log(
    '---------------------------------------+--------------+-------------+-------------+-------------+-------------+------------\n'
  );
  console.log('✅ Rigorous Statistical Benchmark Completed Successfully!\n');
}

runAllBenchmarks().catch((err) => {
  console.error('Fatal error during benchmarks:', err);
  process.exit(1);
});

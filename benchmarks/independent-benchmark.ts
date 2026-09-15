/**
 * TriHex Independent Performance Benchmark Suite
 *
 * Requirements:
 *  - Independent timing harness (process.hrtime.bigint)
 *  - Randomized global coordinate workloads
 *  - Reports p50, p95, p99, p99.9, throughput, and heap allocations
 *  - Covers Core and Mobility/Store interactions
 *  - Discloses hardware and execution environment
 */

import * as os from 'os';
import {
  DispatchEngine,
  InMemoryDriverSpatialStore,
  TriHex,
  getCellNeighbors,
  getHexDual,
  hexRing
} from '../src';

function percentile(arr: Float64Array, p: number): number {
  const idx = (p / 100) * (arr.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return arr[lower] * (1 - weight) + arr[upper] * weight;
}

function benchmarkSync(name: string, fn: (i: number) => void, iterations = 20000) {
  // Warmup
  for (let i = 0; i < Math.min(2000, iterations); i++) fn(i);

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const latencies = new Float64Array(iterations);
  const startTotal = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    fn(i);
    const t1 = process.hrtime.bigint();
    latencies[i] = Number(t1 - t0) / 1000; // microseconds
  }

  const endTotal = process.hrtime.bigint();
  const memAfter = process.memoryUsage().heapUsed;

  latencies.sort();
  const totalSec = Number(endTotal - startTotal) / 1e9;
  const opsSec = Math.round(iterations / totalSec);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const p999 = percentile(latencies, 99.9);
  const heapAllocMB = Math.max(0, memAfter - memBefore) / (1024 * 1024);

  console.log(
    `| ${name.padEnd(32)} | ${opsSec.toLocaleString().padStart(12)} | ${p50.toFixed(2).padStart(7)} µs | ${p95.toFixed(2).padStart(7)} µs | ${p99.toFixed(2).padStart(7)} µs | ${p999.toFixed(2).padStart(8)} µs | ${heapAllocMB.toFixed(2).padStart(7)} MB |`
  );
}

async function benchmarkAsync(name: string, fn: (i: number) => Promise<void>, iterations = 5000) {
  // Warmup
  for (let i = 0; i < Math.min(500, iterations); i++) await fn(i);

  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  const latencies = new Float64Array(iterations);
  const startTotal = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await fn(i);
    const t1 = process.hrtime.bigint();
    latencies[i] = Number(t1 - t0) / 1000; // microseconds
  }

  const endTotal = process.hrtime.bigint();
  const memAfter = process.memoryUsage().heapUsed;

  latencies.sort();
  const totalSec = Number(endTotal - startTotal) / 1e9;
  const opsSec = Math.round(iterations / totalSec);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const p999 = percentile(latencies, 99.9);
  const heapAllocMB = Math.max(0, memAfter - memBefore) / (1024 * 1024);

  console.log(
    `| ${name.padEnd(32)} | ${opsSec.toLocaleString().padStart(12)} | ${p50.toFixed(2).padStart(7)} µs | ${p95.toFixed(2).padStart(7)} µs | ${p99.toFixed(2).padStart(7)} µs | ${p999.toFixed(2).padStart(8)} µs | ${heapAllocMB.toFixed(2).padStart(7)} MB |`
  );
}

async function runIndependentBenchmark() {
  console.log('========================================================================================');
  console.log('⚡ TriHex Independent Microbenchmark Suite & Hardware Disclosure');
  console.log('========================================================================================');
  console.log(`Hardware Environment:`);
  console.log(`  - CPU:          ${os.cpus()[0]?.model} (${os.cpus().length} logical cores)`);
  console.log(`  - OS / Arch:    ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`  - Node Runtime: ${process.version}`);
  console.log(`  - Total RAM:    ${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB`);
  console.log(`  - Note:         Measured on host hardware. Benchmarks are hardware/runtime dependent.`);
  console.log('========================================================================================\n');

  const N = 20000;
  const coords: { lat: number; lng: number }[] = [];
  for (let i = 0; i < N; i++) {
    coords.push({
      lat: (Math.random() - 0.5) * 160,
      lng: (Math.random() - 0.5) * 360,
    });
  }
  const cellsRes9 = coords.map((c) => TriHex.latLngToCell(c.lat, c.lng, 9));
  const cellsRes14 = coords.map((c) => TriHex.latLngToCell(c.lat, c.lng, 14));

  console.log('| Operation                        |      ops/sec |     p50 |     p95 |     p99 |    p99.9 | Heap Alloc |');
  console.log('|:---------------------------------|-------------:|--------:|--------:|--------:|---------:|-----------:|');

  // Core Operations
  benchmarkSync('Core: latLngToCell (Res 9)', (i) => {
    const c = coords[i % N];
    TriHex.latLngToCell(c.lat, c.lng, 9);
  });

  benchmarkSync('Core: latLngToCell (Res 14)', (i) => {
    const c = coords[i % N];
    TriHex.latLngToCell(c.lat, c.lng, 14);
  });

  benchmarkSync('Core: cellToLatLng (Centroid)', (i) => {
    TriHex.cellToLatLng(cellsRes9[i % N]);
  });

  benchmarkSync('Core: cellToParent (ΔRes 3)', (i) => {
    TriHex.cellToParent(cellsRes9[i % N], 6);
  });

  benchmarkSync('Core: cellToChildrenRange (B-Tree)', (i) => {
    TriHex.cellToChildrenRange(cellsRes9[i % N], 11);
  });

  benchmarkSync('Core: cellToString (Hex)', (i) => {
    TriHex.cellToString(cellsRes9[i % N]);
  });

  benchmarkSync('Core: getCellNeighbors (3-edge)', (i) => {
    getCellNeighbors(cellsRes9[i % N]);
  });

  benchmarkSync('Core: getHexDual (Spherical Voronoi)', (i) => {
    getHexDual(cellsRes9[i % 1000]);
  }, 2000);

  benchmarkSync('Core: hexRing (Radius 1, 7 cells)', (i) => {
    hexRing(cellsRes9[i % 500], 1);
  }, 1000);

  // Mobility & Store Operations
  const dispatch = new DispatchEngine();
  const store = new InMemoryDriverSpatialStore();

  await benchmarkAsync('Mobility: updateDriverPosition', async (i) => {
    const c = coords[i % N];
    await dispatch.updateDriverPosition({
      driverId: `drv_bench_${i % 500}`,
      cityId: 'market',
      cellId: cellsRes9[i % N],
      lat: c.lat,
      lng: c.lng,
      version: i + 1,
      updatedAt: Date.now(),
      status: 'AVAILABLE',
    });
  }, 5000);

  await benchmarkAsync('Mobility: findCandidates (Tier 1)', async (i) => {
    const c = coords[i % N];
    await dispatch.findCandidates({
      pickup: c,
      pickupCellId: cellsRes9[i % N],
      cityId: 'market',
      initialRadius: 1,
      maxRadius: 2,
      maxResults: 5,
    });
  }, 2000);

  await benchmarkAsync('Store: findCandidates (Spatial)', async (i) => {
    await store.findCandidates([cellsRes9[i % N]], 10, 'market');
  }, 5000);

  console.log('========================================================================================\n');
}

runIndependentBenchmark().catch(console.error);

import {
  cellDisk,
  cellToString,
  DispatchEngine,
  latLngToCell
} from './trihex-bridge';
import { DispatchRequest, DispatchResponse } from './types';

export interface DispatchServiceConfig {
  resolution?: number;
  defaultRadiusCells?: number;
  defaultMaxCandidates?: number;
}

export class DispatchApiService {
  private engine: DispatchEngine;
  private config: Required<DispatchServiceConfig>;

  constructor(engine: DispatchEngine, config?: DispatchServiceConfig) {
    this.engine = engine;
    this.config = {
      resolution: config?.resolution ?? 10,
      defaultRadiusCells: config?.defaultRadiusCells ?? 2,
      defaultMaxCandidates: config?.defaultMaxCandidates ?? 5
    };
  }

  /**
   * Dispatches the top matching candidate drivers for a ride request
   */
  public async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    const startTime = performance.now();
    const radius = request.radiusCells ?? this.config.defaultRadiusCells;

    // 1. Convert rider GPS coordinates to discrete TriHex cell ID
    const riderCellId = latLngToCell(request.riderLat, request.riderLng, this.config.resolution);
    const riderCellHex = cellToString(riderCellId);

    // 2. Expand search space via cellDisk
    const candidateCells = cellDisk(riderCellId, radius);

    // 3. Execute two-tier candidate retrieval and road-network scoring via DispatchEngine
    const candidates = await this.engine.findCandidates({
      cityId: request.cityId,
      pickup: { lat: request.riderLat, lng: request.riderLng },
      pickupCellId: riderCellId,
      initialRadius: 1,
      maxRadius: radius,
      maxResults: request.maxCandidates ?? this.config.defaultMaxCandidates
    });

    const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

    return {
      cityId: request.cityId,
      riderCellHex,
      riderCellId: riderCellId.toString(),
      searchRadiusCells: radius,
      cellsQueriedCount: candidateCells.length,
      totalCandidatesEvaluated: candidates.length,
      rankedCandidates: candidates,
      executionTimeMs
    };
  }
}

// Entrypoint for running the Dispatch API as an HTTP server
if (require.main === module) {
  const http = require('http');
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  // In standalone mode, use DispatchEngine's built-in in-memory registry
  const engine = new DispatchEngine({
    tier1CandidateLimit: 50,
    tier2CandidateLimit: 5
  });

  const apiService = new DispatchApiService(engine);

  const server = http.createServer(async (req: any, res: any) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'UP', service: 'trihex-dispatch-api', timestamp: Date.now() }));
      return;
    }

    if (req.url === '/api/v1/dispatch' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          if (!payload.cityId || payload.riderLat === undefined || payload.riderLng === undefined) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: cityId, riderLat, riderLng' }));
            return;
          }

          const result = await apiService.dispatch(payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found', endpoints: ['GET /health', 'POST /api/v1/dispatch'] }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 TriHex Dispatch API listening on port ${port} (http://0.0.0.0:${port})`);
  });
}

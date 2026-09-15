import { geodesicDistance } from './icosahedron';
import { RoadTopology } from './topology';
import { GeoCoord } from './types';

export interface RouteCostResult {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly roadVersion?: string;
  readonly trafficTimestamp?: number;
}

export interface RouteMatrixElement {
  readonly originIndex: number;
  readonly destinationIndex: number;
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly status: 'OK' | 'NO_ROUTE' | 'TIMEOUT' | 'ERROR';
}

export interface RouteMatrixResult {
  readonly rows: RouteMatrixElement[][];
  readonly roadVersion?: string;
  readonly trafficTimestamp?: number;
}

export interface RoutingOptions {
  readonly timeoutMs?: number;
  readonly abortSignal?: AbortSignal;
  readonly retryAttempts?: number;
  readonly maxDurationSeconds?: number;
}

/**
 * Production Routing Engine Contract (e.g. OSRM, Valhalla, GraphHopper).
 * Supports both point-to-point routing and high-throughput one-to-many matrix routing.
 */
export interface RouteCostProvider {
  getRouteCost(
    origin: GeoCoord,
    destination: GeoCoord,
    options?: RoutingOptions
  ): Promise<RouteCostResult>;

  getRouteMatrix?(
    origins: GeoCoord[],
    destinations: GeoCoord[],
    options?: RoutingOptions
  ): Promise<RouteMatrixResult>;
}

/**
 * Routing provider wrapping a versioned RoadTopology graph.
 */
export class TopologyRoutingProvider implements RouteCostProvider {
  constructor(private readonly topology: RoadTopology) { }

  public async getRouteCost(
    origin: GeoCoord,
    destination: GeoCoord,
    _options?: RoutingOptions
  ): Promise<RouteCostResult> {
    const fromPos = this.topology.locate(origin);
    const toPos = this.topology.locate(destination);
    const localSpeedMps = (30 * 1000) / 3600; // 30 km/h local street speed

    if (fromPos.roadId === toPos.roadId) {
      const localDist = geodesicDistance(origin, destination);
      const localDuration = localDist / localSpeedMps;
      return {
        distanceMeters: Math.round(localDist),
        durationSeconds: Math.round(localDuration),
        roadVersion: this.topology.version,
        trafficTimestamp: Date.now(),
      };
    }

    const cost = this.topology.estimateCost(fromPos, toPos);
    if (cost.durationSeconds === Infinity) {
      throw new Error(`Unreachable: no connected road path between locations on version ${this.topology.version}`);
    }

    const accessDist = geodesicDistance(origin, fromPos.coordinate);
    const egressDist = geodesicDistance(toPos.coordinate, destination);
    const totalDist = accessDist + cost.distanceMeters + egressDist;
    const totalDuration = accessDist / localSpeedMps + cost.durationSeconds + egressDist / localSpeedMps;

    return {
      distanceMeters: Math.round(totalDist),
      durationSeconds: Math.round(totalDuration),
      roadVersion: cost.roadVersion,
      trafficTimestamp: Date.now(),
    };
  }

  public async getRouteMatrix(
    origins: GeoCoord[],
    destinations: GeoCoord[],
    _options?: RoutingOptions
  ): Promise<RouteMatrixResult> {
    const rows: RouteMatrixElement[][] = [];

    for (let o = 0; o < origins.length; o++) {
      const row: RouteMatrixElement[] = [];
      const fromPos = this.topology.locate(origins[o]);

      for (let d = 0; d < destinations.length; d++) {
        const toPos = this.topology.locate(destinations[d]);
        const cost = this.topology.estimateCost(fromPos, toPos);

        if (cost.durationSeconds === Infinity) {
          row.push({
            originIndex: o,
            destinationIndex: d,
            distanceMeters: -1,
            durationSeconds: -1,
            status: 'NO_ROUTE',
          });
        } else {
          row.push({
            originIndex: o,
            destinationIndex: d,
            distanceMeters: cost.distanceMeters,
            durationSeconds: cost.durationSeconds,
            status: 'OK',
          });
        }
      }
      rows.push(row);
    }

    return {
      rows,
      roadVersion: this.topology.version,
      trafficTimestamp: Date.now(),
    };
  }
}

/**
 * Deterministic benchmark & test routing provider with simulated road network detour multiplier.
 */
export class SimulatedRoadRoutingProvider implements RouteCostProvider {
  constructor(
    private readonly detourFactor = 1.35,
    private readonly speedKmh = 30
  ) { }

  public async getRouteCost(
    origin: GeoCoord,
    destination: GeoCoord,
    _options?: RoutingOptions
  ): Promise<RouteCostResult> {
    const geo = geodesicDistance(origin, destination);
    const roadDist = geo * this.detourFactor;
    const speedMps = (this.speedKmh * 1000) / 3600;
    const duration = roadDist / speedMps;

    return {
      distanceMeters: Math.round(roadDist),
      durationSeconds: Math.round(duration),
      roadVersion: 'simulated-v1',
      trafficTimestamp: Date.now(),
    };
  }
}

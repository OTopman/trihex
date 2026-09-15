"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulatedRoadRoutingProvider = exports.TopologyRoutingProvider = void 0;
const icosahedron_1 = require("./icosahedron");
/**
 * Routing provider wrapping a versioned RoadTopology graph.
 */
class TopologyRoutingProvider {
    topology;
    constructor(topology) {
        this.topology = topology;
    }
    async getRouteCost(origin, destination, _options) {
        const fromPos = this.topology.locate(origin);
        const toPos = this.topology.locate(destination);
        const cost = this.topology.estimateCost(fromPos, toPos);
        if (cost.durationSeconds === Infinity) {
            throw new Error(`Unreachable: no connected road path between locations on version ${this.topology.version}`);
        }
        return {
            distanceMeters: cost.distanceMeters,
            durationSeconds: cost.durationSeconds,
            roadVersion: cost.roadVersion,
            trafficTimestamp: Date.now(),
        };
    }
    async getRouteMatrix(origins, destinations, _options) {
        const rows = [];
        for (let o = 0; o < origins.length; o++) {
            const row = [];
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
                }
                else {
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
exports.TopologyRoutingProvider = TopologyRoutingProvider;
/**
 * Deterministic benchmark & test routing provider with simulated road network detour multiplier.
 */
class SimulatedRoadRoutingProvider {
    detourFactor;
    speedKmh;
    constructor(detourFactor = 1.35, speedKmh = 30) {
        this.detourFactor = detourFactor;
        this.speedKmh = speedKmh;
    }
    async getRouteCost(origin, destination, _options) {
        const geo = (0, icosahedron_1.geodesicDistance)(origin, destination);
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
exports.SimulatedRoadRoutingProvider = SimulatedRoadRoutingProvider;

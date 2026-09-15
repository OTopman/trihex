"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionedRoadGraph = void 0;
const icosahedron_1 = require("./icosahedron");
/**
 * In-memory versioned road network topology graph for production simulation and testing.
 * Supports dynamic closures, reopening, and graph version incrementing.
 */
class VersionedRoadGraph {
    _version;
    nodes = new Map();
    edges = new Map();
    adjacency = new Map();
    constructor(initialVersion = 'v1.0.0') {
        this._version = initialVersion;
    }
    get version() {
        return this._version;
    }
    addNode(nodeId, coord) {
        this.nodes.set(nodeId, { ...coord });
        if (!this.adjacency.has(nodeId)) {
            this.adjacency.set(nodeId, []);
        }
    }
    addEdge(fromNodeId, toNodeId, options = {}) {
        const fromCoord = this.nodes.get(fromNodeId);
        const toCoord = this.nodes.get(toNodeId);
        if (!fromCoord || !toCoord) {
            throw new Error(`Both nodes ${fromNodeId} and ${toNodeId} must exist in graph`);
        }
        const dist = options.distanceMeters ?? (0, icosahedron_1.geodesicDistance)(fromCoord, toCoord);
        const speedMps = ((options.freeFlowSpeedKmh ?? 40) * 1000) / 3600;
        const edgeId = `${fromNodeId}->${toNodeId}`;
        const edge = {
            fromNodeId,
            toNodeId,
            distanceMeters: dist,
            freeFlowSpeedMps: speedMps,
            isClosed: options.isClosed ?? false,
        };
        this.edges.set(edgeId, edge);
        this.adjacency.get(fromNodeId).push(edge);
        return edgeId;
    }
    setEdgeClosure(fromNodeId, toNodeId, isClosed, newVersion) {
        const edgeId = `${fromNodeId}->${toNodeId}`;
        const edge = this.edges.get(edgeId);
        if (edge) {
            edge.isClosed = isClosed;
        }
        this._version = newVersion ?? `v${Date.now()}`;
    }
    locate(point) {
        let bestNode = '';
        let minDist = Infinity;
        for (const [id, coord] of this.nodes.entries()) {
            const dist = (0, icosahedron_1.geodesicDistance)(point, coord);
            if (dist < minDist) {
                minDist = dist;
                bestNode = id;
            }
        }
        const coord = this.nodes.get(bestNode) ?? point;
        return {
            roadId: bestNode,
            coordinate: coord,
        };
    }
    reachable(from, to) {
        const cost = this.estimateCost(from, to);
        if (cost.durationSeconds === Infinity) {
            return { reachable: false, reason: 'No connected path or barrier closure' };
        }
        return { reachable: true };
    }
    estimateCost(from, to) {
        if (from.roadId === to.roadId) {
            return { distanceMeters: 0, durationSeconds: 0, roadVersion: this._version };
        }
        // Dijkstra's shortest path algorithm
        const dists = new Map();
        const times = new Map();
        const visited = new Set();
        for (const nodeId of this.nodes.keys()) {
            dists.set(nodeId, Infinity);
            times.set(nodeId, Infinity);
        }
        times.set(from.roadId, 0);
        dists.set(from.roadId, 0);
        while (true) {
            let closestNode = null;
            let minTime = Infinity;
            for (const [nodeId, time] of times.entries()) {
                if (!visited.has(nodeId) && time < minTime) {
                    minTime = time;
                    closestNode = nodeId;
                }
            }
            if (!closestNode || minTime === Infinity)
                break;
            if (closestNode === to.roadId)
                break;
            visited.add(closestNode);
            const outgoing = this.adjacency.get(closestNode) ?? [];
            for (const edge of outgoing) {
                if (edge.isClosed || visited.has(edge.toNodeId))
                    continue;
                const traverseTime = edge.distanceMeters / edge.freeFlowSpeedMps;
                const newTime = minTime + traverseTime;
                const newDist = dists.get(closestNode) + edge.distanceMeters;
                if (newTime < times.get(edge.toNodeId)) {
                    times.set(edge.toNodeId, newTime);
                    dists.set(edge.toNodeId, newDist);
                }
            }
        }
        const durationSeconds = times.get(to.roadId) ?? Infinity;
        const distanceMeters = dists.get(to.roadId) ?? Infinity;
        return {
            distanceMeters,
            durationSeconds,
            roadVersion: this._version,
        };
    }
}
exports.VersionedRoadGraph = VersionedRoadGraph;

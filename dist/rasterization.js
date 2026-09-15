"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResolutionCellRadius = getResolutionCellRadius;
exports.lineStringToCells = lineStringToCells;
exports.polygonToCells = polygonToCells;
const icosahedron_1 = require("./icosahedron");
const network_metric_1 = require("./network-metric");
const triangle_quadtree_1 = require("./triangle-quadtree");
const types_1 = require("./types");
/**
 * Approximate circumradius (in meters) of a micro-triangle at a given resolution (0 to 15)
 */
function getResolutionCellRadius(resolution) {
    const boundedRes = Math.max(0, Math.min(types_1.BIT_LAYOUT.MAX_RESOLUTION, resolution));
    // At resolution 0, icosahedron edge is ~7,000 km, circumradius is ~4,041 km
    return 4_041_451 / (1 << boundedRes);
}
/**
 * Rasterizes a polyline (sequence of waypoints) into an ordered sequence of contiguous TriHex cells.
 * Uses supercover step interpolation to ensure continuous cell connectivity with zero gaps.
 */
function lineStringToCells(coordinates, resolution, topoCluster = 0) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('lineStringToCells requires an array of at least 2 GeoCoord waypoints');
    }
    if (resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new Error(`Resolution ${resolution} must be between 0 and ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
    }
    const cellRadius = getResolutionCellRadius(resolution);
    // Step size: half the cell radius ensures dense supercover sampling
    const stepMeters = Math.max(2, cellRadius * 0.5);
    const result = [];
    let lastCell = null;
    for (let i = 0; i < coordinates.length - 1; i++) {
        const p1 = coordinates[i];
        const p2 = coordinates[i + 1];
        const dist = (0, network_metric_1.geodesicDistance)(p1, p2);
        const steps = Math.max(1, Math.ceil(dist / stepMeters));
        for (let s = 0; s <= steps; s++) {
            if (s === 0 && i > 0)
                continue;
            const t = s / steps;
            const lat = p1.lat + t * (p2.lat - p1.lat);
            let lng = p1.lng + t * (p2.lng - p1.lng);
            // Handle antimeridian crossing interpolation if points cross +/-180
            if (Math.abs(p2.lng - p1.lng) > 180) {
                const lng1 = p1.lng < 0 ? p1.lng + 360 : p1.lng;
                const lng2 = p2.lng < 0 ? p2.lng + 360 : p2.lng;
                let interpLng = lng1 + t * (lng2 - lng1);
                if (interpLng > 180)
                    interpLng -= 360;
                lng = interpLng;
            }
            const vec = (0, icosahedron_1.geoToVector3D)(lat, lng);
            const proj = (0, icosahedron_1.projectToFace)(vec);
            const { morton } = (0, triangle_quadtree_1.barycentricToMorton)(proj.u, proj.v, resolution);
            const cellId = (0, triangle_quadtree_1.packTriHexId)(proj.face, resolution, morton);
            if (topoCluster !== 0) {
                network_metric_1.defaultTopologyRegistry.setCluster(cellId, topoCluster);
            }
            if (lastCell === null || cellId !== lastCell) {
                result.push(cellId);
                lastCell = cellId;
            }
        }
    }
    return result;
}
/**
 * Fills an arbitrary geographic polygon (geofence, administrative boundary)
 * with all enclosing TriHex cells at the specified resolution using scanline filling.
 *
 * Supports antimeridian crossings (+/- 180 deg) and includes iteration guards to
 * prevent event-loop starvation on un-chunked continental polygons.
 */
function polygonToCells(coordinates, resolution, topoCluster = 0) {
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
        throw new Error('polygonToCells requires a closed polygon of at least 3 vertices');
    }
    if (resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new Error(`Resolution ${resolution} must be between 0 and ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
    }
    // Ensure closed polygon
    let poly = [...coordinates];
    const first = poly[0];
    const last = poly[poly.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) {
        poly.push({ lat: first.lat, lng: first.lng });
    }
    // Detect and normalize antimeridian crossing
    let crossesAntimeridian = false;
    for (let i = 0; i < poly.length - 1; i++) {
        if (Math.abs(poly[i].lng - poly[i + 1].lng) > 180) {
            crossesAntimeridian = true;
            break;
        }
    }
    if (crossesAntimeridian) {
        poly = poly.map((p) => ({
            lat: p.lat,
            lng: p.lng < 0 ? p.lng + 360 : p.lng,
        }));
    }
    // Calculate bounding box
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of poly) {
        if (p.lat < minLat)
            minLat = p.lat;
        if (p.lat > maxLat)
            maxLat = p.lat;
        if (p.lng < minLng)
            minLng = p.lng;
        if (p.lng > maxLng)
            maxLng = p.lng;
    }
    const cellRadius = getResolutionCellRadius(resolution);
    const stepDegLat = (cellRadius / 111_320) * 0.7;
    const avgLat = (minLat + maxLat) * 0.5;
    const cosLat = Math.cos((avgLat * Math.PI) / 180);
    const stepDegLng = (cellRadius / (111_320 * (cosLat === 0 ? 1 : Math.abs(cosLat)))) * 0.7;
    const latSteps = Math.ceil((maxLat - minLat) / stepDegLat);
    const lngSteps = Math.ceil((maxLng - minLng) / stepDegLng);
    const estimatedOperations = latSteps * lngSteps;
    // DoS Guard: Prevent freezing Node.js event loop on massive regions
    if (estimatedOperations > 200_000) {
        throw new RangeError(`polygonToCells: Polygon bounding box covers too many potential cells (${estimatedOperations.toLocaleString()}) at resolution ${resolution}. ` +
            `Use a coarser resolution (e.g. resolution ${Math.max(0, resolution - 2)}) or partition the polygon.`);
    }
    const cellSet = new Set();
    const cells = [];
    const addCell = (id) => {
        const key = id.toString();
        if (!cellSet.has(key)) {
            cellSet.add(key);
            cells.push(id);
        }
    };
    // 1. Trace perimeter boundary using original un-shifted coordinates
    const perimeterCoords = crossesAntimeridian
        ? poly.map((p) => ({ lat: p.lat, lng: p.lng > 180 ? p.lng - 360 : p.lng }))
        : poly;
    const perimeterCells = lineStringToCells(perimeterCoords, resolution, topoCluster);
    for (const c of perimeterCells) {
        addCell(c);
    }
    // 2. High-performance scanline filling for polygon interior
    const n = poly.length;
    for (let lat = minLat; lat <= maxLat; lat += stepDegLat) {
        const intersections = [];
        for (let i = 0; i < n - 1; i++) {
            const p1 = poly[i];
            const p2 = poly[i + 1];
            if ((p1.lat <= lat && p2.lat > lat) || (p2.lat <= lat && p1.lat > lat)) {
                const x = p1.lng + ((lat - p1.lat) / (p2.lat - p1.lat)) * (p2.lng - p1.lng);
                intersections.push(x);
            }
        }
        intersections.sort((a, b) => a - b);
        for (let i = 0; i < intersections.length - 1; i += 2) {
            const xStart = intersections[i];
            const xEnd = intersections[i + 1];
            for (let rawLng = xStart; rawLng <= xEnd; rawLng += stepDegLng) {
                let lng = rawLng;
                if (crossesAntimeridian && lng > 180) {
                    lng -= 360;
                }
                const vec = (0, icosahedron_1.geoToVector3D)(lat, lng);
                const proj = (0, icosahedron_1.projectToFace)(vec);
                const { morton } = (0, triangle_quadtree_1.barycentricToMorton)(proj.u, proj.v, resolution);
                const cellId = (0, triangle_quadtree_1.packTriHexId)(proj.face, resolution, morton);
                if (topoCluster !== 0) {
                    network_metric_1.defaultTopologyRegistry.setCluster(cellId, topoCluster);
                }
                addCell(cellId);
            }
        }
    }
    return cells;
}

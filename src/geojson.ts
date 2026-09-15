import { getHexDualBoundary } from './hex-dual';
import { cellToString } from './serialization';
import { cellToBoundary, unpackTriHexId } from './triangle-quadtree';
import { TriHexId } from './types';

export interface GeoJSONPolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJSONFeature<G = GeoJSONPolygonGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  id?: string;
  geometry: G;
  properties: P;
}

export interface GeoJSONFeatureCollection<G = GeoJSONPolygonGeometry, P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoJSONFeature<G, P>[];
}

export interface CellFeatureProperties {
  id: string;
  face: number;
  resolution: number;
  morton: string;
  representation: 'triangle' | 'hexDual';
  dualSector?: number;
  topoCluster?: number;
}

/**
 * Converts a triangular TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 * Coordinates are formatted as [longitude, latitude] in closed rings.
 */
export function cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties> {
  const boundary = cellToBoundary(id);
  const unpacked = unpackTriHexId(id);
  const idStr = cellToString(id);

  // GeoJSON requires [lng, lat] coordinate order and closed ring (first vertex repeated at the end)
  const ring: [number, number][] = boundary.map((c) => [c.lng, c.lat]);
  ring.push([boundary[0].lng, boundary[0].lat]);

  return {
    type: 'Feature',
    id: idStr,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties: {
      id: idStr,
      face: unpacked.face,
      resolution: unpacked.resolution,
      morton: unpacked.morton.toString(16),
      dualSector: 0,
      topoCluster: 0,
      representation: 'triangle',
    },
  };
}

/**
 * Converts the hexagonal Voronoi dual of a TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 */
export function hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties> {
  const boundary = getHexDualBoundary(id);
  const unpacked = unpackTriHexId(id);
  const idStr = cellToString(id);

  // GeoJSON closed ring
  const ring: [number, number][] = boundary.map((c) => [c.lng, c.lat]);
  if (boundary.length > 0) {
    ring.push([boundary[0].lng, boundary[0].lat]);
  }

  return {
    type: 'Feature',
    id: idStr,
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
    properties: {
      id: idStr,
      face: unpacked.face,
      resolution: unpacked.resolution,
      morton: unpacked.morton.toString(16),
      dualSector: 0,
      topoCluster: 0,
      representation: 'hexDual',
    },
  };
}

/**
 * Bundles multiple TriHex cells into a unified GeoJSON FeatureCollection
 * suitable for immediate rendering in Mapbox GL, Leaflet, or Kepler.gl.
 */
export function cellsToGeoJSON(
  ids: TriHexId[],
  mode: 'triangle' | 'hexDual' = 'triangle'
): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties> {
  const features = ids.map((id) =>
    mode === 'hexDual' ? hexDualToGeoJSON(id) : cellToGeoJSON(id)
  );

  return {
    type: 'FeatureCollection',
    features,
  };
}

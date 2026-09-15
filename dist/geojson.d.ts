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
export declare function cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
/**
 * @deprecated TriHex stores triangles and has no globally regular hexagonal
 * dual. This compatibility export returns the actual triangular cell geometry.
 */
export declare function hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
/**
 * Bundles multiple TriHex cells into a unified GeoJSON FeatureCollection
 * suitable for immediate rendering in Mapbox GL, Leaflet, or Kepler.gl.
 */
export declare function cellsToGeoJSON(ids: TriHexId[], mode?: 'triangle' | 'hexDual'): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties>;

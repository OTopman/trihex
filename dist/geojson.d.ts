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
    degree?: number;
    isPentagon?: boolean;
}
/**
 * Converts a triangular TriHex cell into a standard RFC 7946 GeoJSON Feature<Polygon>.
 * Coordinates are formatted as [longitude, latitude] in closed rings.
 */
export declare function cellToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
/**
 * Converts the spherical Voronoi dual cell (hexagon or pentagon) into an RFC 7946 GeoJSON Feature<Polygon>.
 * The polygon boundary consists of the true spherical circumcenters (6 for hexagons, 5 for pentagons).
 */
export declare function hexDualToGeoJSON(id: TriHexId): GeoJSONFeature<GeoJSONPolygonGeometry, CellFeatureProperties>;
/**
 * Bundles multiple TriHex cells into a unified GeoJSON FeatureCollection
 * suitable for rendering in Mapbox GL, Leaflet, or Kepler.gl.
 */
export declare function cellsToGeoJSON(ids: TriHexId[], mode?: 'triangle' | 'hexDual'): GeoJSONFeatureCollection<GeoJSONPolygonGeometry, CellFeatureProperties>;

import { GeoCoord, TriHexDirectedEdge, TriHexEdgeId, TriHexId } from './types';
/**
 * Returns true if the given value is a valid 63-bit directed edge ID.
 */
export declare function isDirectedEdge(id: unknown): id is TriHexEdgeId;
/**
 * Validates whether an ID is a structurally sound TriHex directed edge.
 */
export declare function validateDirectedEdge(edgeId: unknown): asserts edgeId is TriHexEdgeId;
/**
 * Constructs a canonical 63-bit Directed Edge ID representing oriented flow from origin to adjacent destination.
 */
export declare function getDirectedEdge(origin: TriHexId, destination: TriHexId): TriHexEdgeId;
/**
 * Recovers the origin cell ID of a directed edge.
 */
export declare function getDirectedEdgeOrigin(edgeId: TriHexEdgeId): TriHexId;
/**
 * Computes the destination cell ID of a directed edge.
 */
export declare function getDirectedEdgeDestination(edgeId: TriHexEdgeId): TriHexId;
/**
 * Returns the two spherical geographic coordinates that form the shared boundary segment of the directed edge.
 */
export declare function getDirectedEdgeBoundary(edgeId: TriHexEdgeId): [GeoCoord, GeoCoord];
/**
 * Returns full metadata and boundary information for a directed edge.
 */
export declare function getDirectedEdgeDetails(edgeId: TriHexEdgeId): TriHexDirectedEdge;

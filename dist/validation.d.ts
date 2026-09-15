import { TriHexId } from './types';
/**
 * Validates whether an input value is a structurally valid 64-bit TriHexId.
 *
 * Strict validation rules:
 *  1. Must be a BigInt.
 *  2. Must be non-negative: id >= 0n (Bit 63 strictly 0).
 *  3. Must not exceed MAX_SIGNED_INT64 (0x7fffffffffffffffn).
 *  4. Face ID must be an integer between 0 and 19.
 *  5. Resolution must be an integer between 0 and 15.
 *  6. Morton code must strictly fit within (2 * resolution) bits.
 *  7. All unused/padding bits must be strictly zero (no phantom bits).
 */
export declare function validateCellId(id: unknown): asserts id is TriHexId;
/**
 * Non-throwing predicate checking whether an input is a valid TriHexId or hex string.
 */
export declare function isValidCell(input: unknown): input is TriHexId;
/**
 * Validates geographic WGS84 latitude and longitude coordinates.
 */
export declare function validateCoordinates(lat: number, lng: number): void;
/**
 * Validates grid resolution.
 */
export declare function validateResolution(resolution: number): void;
/**
 * Validates graph search radius.
 */
export declare function validateRadius(radius: number, maxRadius?: number): void;

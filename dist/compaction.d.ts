import { TriHexId } from './types';
/**
 * Compacts a set of TriHex cells by recursively collapsing complete sets of
 * 4 sibling triangles into their parent cell.
 *
 * Guarantees:
 *  1. Strict input validation (rejects invalid/malformed IDs).
 *  2. Top-down ancestor pruning (removes redundant descendants if an ancestor is present).
 *  3. Bottom-up 4:1 sibling reduction up to resolution 0.
 *  4. Deterministic canonical ordering (sorted ascending by BigInt).
 *  5. Invertibility: compact(uncompact(compact(X), targetRes)) == canonical(compact(X)).
 */
export declare function compactCells(cells: TriHexId[]): TriHexId[];
/**
 * Uncompacts a set of mixed-resolution cells by expanding any coarser cells
 * down to the uniform targetResolution.
 *
 * Guarantees:
 *  1. Strict input validation.
 *  2. Deduplication.
 *  3. Deterministic canonical sorting (ascending).
 */
export declare function uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[];

import { TriHexId } from './types';
/**
 * Compacts a set of TriHex cells by recursively collapsing sets of 4 sibling
 * triangles into their parent cell.
 *
 * Performs initial top-down ancestor pruning to eliminate redundant descendants,
 * then bottom-up 4:1 sibling reduction. Reduces memory and storage by up to 93.75%.
 */
export declare function compactCells(cells: TriHexId[]): TriHexId[];
/**
 * Uncompacts a set of mixed-resolution cells by expanding any coarser cells
 * down to the uniform targetResolution.
 */
export declare function uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[];

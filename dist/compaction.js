"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compactCells = compactCells;
exports.uncompactCells = uncompactCells;
const triangle_quadtree_1 = require("./triangle-quadtree");
const types_1 = require("./types");
const validation_1 = require("./validation");
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
function compactCells(cells) {
    if (!Array.isArray(cells) || cells.length === 0) {
        return [];
    }
    // 1. Validate and deduplicate input cells
    const uniqueCells = new Set();
    for (const c of cells) {
        (0, validation_1.validateCellId)(c);
        uniqueCells.add(c);
    }
    // 2. Top-down ancestor pruning: if an ancestor is already present in the set,
    // the descendant is already covered and must be discarded.
    const allCellStrings = new Set();
    for (const c of uniqueCells) {
        allCellStrings.add(c.toString());
    }
    const prunedCells = [];
    for (const c of uniqueCells) {
        const { resolution } = (0, triangle_quadtree_1.unpackTriHexId)(c);
        let hasAncestor = false;
        for (let r = resolution - 1; r >= 0; r--) {
            const ancestor = (0, triangle_quadtree_1.cellToParent)(c, r);
            if (allCellStrings.has(ancestor.toString())) {
                hasAncestor = true;
                break;
            }
        }
        if (!hasAncestor) {
            prunedCells.push(c);
        }
    }
    // 3. Separate pruned cells by resolution (0 to 15)
    const resBuckets = new Map();
    for (let r = 0; r <= types_1.BIT_LAYOUT.MAX_RESOLUTION; r++) {
        resBuckets.set(r, new Set());
    }
    for (const c of prunedCells) {
        const { resolution } = (0, triangle_quadtree_1.unpackTriHexId)(c);
        resBuckets.get(resolution).add(c.toString());
    }
    // 4. Bottom-up compaction: from max resolution down to 1
    for (let r = types_1.BIT_LAYOUT.MAX_RESOLUTION; r >= 1; r--) {
        const currentBucket = resBuckets.get(r);
        if (currentBucket.size === 0)
            continue;
        // Group cells by parent ID
        const parentGroups = new Map();
        for (const cellStr of currentBucket) {
            const cellId = BigInt(cellStr);
            const parentId = (0, triangle_quadtree_1.cellToParent)(cellId, r - 1);
            const parentKey = parentId.toString();
            if (!parentGroups.has(parentKey)) {
                parentGroups.set(parentKey, []);
            }
            parentGroups.get(parentKey).push(cellStr);
        }
        // Check which parent groups have all 4 siblings
        for (const [parentKey, siblings] of parentGroups.entries()) {
            if (siblings.length === 4) {
                // Remove 4 children
                for (const s of siblings) {
                    currentBucket.delete(s);
                }
                // Promote parent to next coarser resolution bucket
                resBuckets.get(r - 1).add(parentKey);
            }
        }
    }
    // 5. Collect remaining compacted cells across all resolution buckets
    const compacted = [];
    for (let r = 0; r <= types_1.BIT_LAYOUT.MAX_RESOLUTION; r++) {
        for (const cellStr of resBuckets.get(r)) {
            compacted.push(BigInt(cellStr));
        }
    }
    // 6. Deterministic canonical sorting (ascending)
    compacted.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return compacted;
}
/**
 * Uncompacts a set of mixed-resolution cells by expanding any coarser cells
 * down to the uniform targetResolution.
 *
 * Guarantees:
 *  1. Strict input validation.
 *  2. Deduplication.
 *  3. Deterministic canonical sorting (ascending).
 */
function uncompactCells(cells, targetResolution) {
    (0, validation_1.validateResolution)(targetResolution);
    if (!Array.isArray(cells) || cells.length === 0) {
        return [];
    }
    const uncompactedSet = new Set();
    const uncompacted = [];
    for (const cell of cells) {
        (0, validation_1.validateCellId)(cell);
        const { resolution } = (0, triangle_quadtree_1.unpackTriHexId)(cell);
        if (resolution === targetResolution) {
            const key = cell.toString();
            if (!uncompactedSet.has(key)) {
                uncompactedSet.add(key);
                uncompacted.push(cell);
            }
        }
        else if (resolution < targetResolution) {
            // Expand to dense child range [start, end]
            const range = (0, triangle_quadtree_1.cellToChildrenRange)(cell, targetResolution);
            for (let childId = range.start; childId <= range.end; childId++) {
                const key = childId.toString();
                if (!uncompactedSet.has(key)) {
                    uncompactedSet.add(key);
                    uncompacted.push(childId);
                }
            }
        }
        else {
            throw new RangeError(`Cannot uncompact cell at resolution ${resolution} to coarser target resolution ${targetResolution}`);
        }
    }
    // Deterministic canonical sorting (ascending)
    uncompacted.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return uncompacted;
}

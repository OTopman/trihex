import { cellToChildrenRange, cellToParent, unpackTriHexId } from './triangle-quadtree';
import { BIT_LAYOUT, TriHexId } from './types';

/**
 * Compacts a set of TriHex cells by recursively collapsing sets of 4 sibling
 * triangles into their parent cell.
 *
 * Performs initial top-down ancestor pruning to eliminate redundant descendants,
 * then bottom-up 4:1 sibling reduction. Reduces memory and storage by up to 93.75%.
 */
export function compactCells(cells: TriHexId[]): TriHexId[] {
  if (!Array.isArray(cells) || cells.length === 0) {
    return [];
  }

  // 1. Deduplicate input cells
  const uniqueCells = new Set<TriHexId>();
  for (const c of cells) {
    uniqueCells.add(c);
  }

  // 2. Top-down ancestor pruning: if an ancestor is already present in the set,
  // the descendant is already covered and must be discarded.
  const allCellStrings = new Set<string>();
  for (const c of uniqueCells) {
    allCellStrings.add(c.toString());
  }

  const prunedCells: TriHexId[] = [];
  for (const c of uniqueCells) {
    const { resolution } = unpackTriHexId(c);
    let hasAncestor = false;

    for (let r = resolution - 1; r >= 0; r--) {
      const ancestor = cellToParent(c, r);
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
  const resBuckets: Map<number, Set<string>> = new Map();
  for (let r = 0; r <= BIT_LAYOUT.MAX_RESOLUTION; r++) {
    resBuckets.set(r, new Set());
  }

  for (const c of prunedCells) {
    const { resolution } = unpackTriHexId(c);
    resBuckets.get(resolution)!.add(c.toString());
  }

  // 4. Bottom-up compaction: from max resolution down to 1
  for (let r = BIT_LAYOUT.MAX_RESOLUTION; r >= 1; r--) {
    const currentBucket = resBuckets.get(r)!;
    if (currentBucket.size === 0) continue;

    // Group cells by parent ID
    const parentGroups: Map<string, string[]> = new Map();

    for (const cellStr of currentBucket) {
      const cellId = BigInt(cellStr);
      const parentId = cellToParent(cellId, r - 1);
      const parentKey = parentId.toString();

      if (!parentGroups.has(parentKey)) {
        parentGroups.set(parentKey, []);
      }
      parentGroups.get(parentKey)!.push(cellStr);
    }

    // Check which parent groups have all 4 siblings
    for (const [parentKey, siblings] of parentGroups.entries()) {
      if (siblings.length === 4) {
        // Remove 4 children
        for (const s of siblings) {
          currentBucket.delete(s);
        }
        // Promote parent to next coarser resolution bucket
        resBuckets.get(r - 1)!.add(parentKey);
      }
    }
  }

  // 5. Collect remaining compacted cells across all resolution buckets
  const compacted: TriHexId[] = [];
  for (let r = 0; r <= BIT_LAYOUT.MAX_RESOLUTION; r++) {
    for (const cellStr of resBuckets.get(r)!) {
      compacted.push(BigInt(cellStr));
    }
  }

  return compacted;
}

/**
 * Uncompacts a set of mixed-resolution cells by expanding any coarser cells
 * down to the uniform targetResolution.
 */
export function uncompactCells(cells: TriHexId[], targetResolution: number): TriHexId[] {
  if (targetResolution < 0 || targetResolution > BIT_LAYOUT.MAX_RESOLUTION) {
    throw new Error(
      `Target resolution ${targetResolution} must be between 0 and ${BIT_LAYOUT.MAX_RESOLUTION}`
    );
  }

  const uncompactedSet = new Set<string>();
  const uncompacted: TriHexId[] = [];

  for (const cell of cells) {
    const { resolution } = unpackTriHexId(cell);

    if (resolution === targetResolution) {
      const key = cell.toString();
      if (!uncompactedSet.has(key)) {
        uncompactedSet.add(key);
        uncompacted.push(cell);
      }
    } else if (resolution < targetResolution) {
      // Expand to dense child range [start, end]
      const range = cellToChildrenRange(cell, targetResolution);

      for (let childId = range.start; childId <= range.end; childId++) {
        const key = childId.toString();
        if (!uncompactedSet.has(key)) {
          uncompactedSet.add(key);
          uncompacted.push(childId);
        }
      }
    } else {
      throw new Error(
        `Cannot uncompact cell at resolution ${resolution} to coarser target resolution ${targetResolution}`
      );
    }
  }

  return uncompacted;
}

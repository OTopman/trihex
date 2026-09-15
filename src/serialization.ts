import { TriHexId } from './types';
import { isValidCell, validateCellId } from './validation';

const HEX_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;

export { isValidCell };

/**
 * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string.
 * Example: "0000000000bd4533"
 */
export function cellToString(id: TriHexId): string {
  validateCellId(id);
  return id.toString(16).toLowerCase().padStart(16, '0');
}

/**
 * Parses a hexadecimal string into a 64-bit TriHexId with strict format and boundary validation.
 */
export function stringToCell(str: string): TriHexId {
  if (typeof str !== 'string' || !str.trim()) {
    throw new TypeError(`Expected non-empty string, received ${typeof str}`);
  }

  const cleanStr = str.trim();
  if (!HEX_REGEX.test(cleanStr)) {
    throw new Error(`Invalid TriHexId hexadecimal format: "${str}"`);
  }

  const id = BigInt(cleanStr.startsWith('0x') ? cleanStr : `0x${cleanStr}`);
  validateCellId(id);

  return id;
}

/**
 * Utility replacer for JSON.stringify to safely serialize BigInt TriHexId values as hex strings.
 */
export function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return cellToString(value);
  }
  return value;
}

import { TriHexId } from './types';
import { isValidCell } from './validation';
export { isValidCell };
/**
 * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string.
 * Example: "0000000000bd4533"
 */
export declare function cellToString(id: TriHexId): string;
/**
 * Parses a hexadecimal string into a 64-bit TriHexId with strict format and boundary validation.
 */
export declare function stringToCell(str: string): TriHexId;
/**
 * Utility replacer for JSON.stringify to safely serialize BigInt TriHexId values as hex strings.
 */
export declare function bigIntReplacer(_key: string, value: unknown): unknown;

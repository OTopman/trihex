"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidCell = isValidCell;
exports.cellToString = cellToString;
exports.stringToCell = stringToCell;
exports.bigIntReplacer = bigIntReplacer;
const triangle_quadtree_1 = require("./triangle-quadtree");
const types_1 = require("./types");
const HEX_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;
/**
 * Validates whether an input is a structurally sound 64-bit TriHexId.
 */
function isValidCell(input) {
    try {
        let id;
        if (typeof input === 'string') {
            if (!HEX_REGEX.test(input))
                return false;
            id = BigInt(input.startsWith('0x') ? input : `0x${input}`);
        }
        else if (typeof input === 'bigint') {
            id = input;
        }
        else {
            return false;
        }
        if (id < 0n || id > types_1.BIT_LAYOUT.MAX_SIGNED_INT64)
            return false;
        const { face, resolution, morton } = (0, triangle_quadtree_1.unpackTriHexId)(id);
        if (face < 0 || face >= types_1.BIT_LAYOUT.TOTAL_FACES)
            return false;
        if (resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION)
            return false;
        // Morton code must fit within 2 * resolution bits
        const maxMortonForRes = (1n << BigInt(resolution * 2)) - 1n;
        if (morton > maxMortonForRes)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string.
 * Example: "0000000000bd4533"
 */
function cellToString(id) {
    if (typeof id !== 'bigint') {
        throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
    }
    if (id < 0n || id > types_1.BIT_LAYOUT.MAX_SIGNED_INT64) {
        throw new RangeError(`TriHexId 0x${id.toString(16)} exceeds 63-bit signed non-negative integer bounds`);
    }
    return id.toString(16).toLowerCase().padStart(16, '0');
}
/**
 * Parses a hexadecimal string into a 64-bit TriHexId with strict format and boundary validation.
 */
function stringToCell(str) {
    if (typeof str !== 'string' || !str.trim()) {
        throw new TypeError(`Expected non-empty string, received ${typeof str}`);
    }
    const cleanStr = str.trim();
    if (!HEX_REGEX.test(cleanStr)) {
        throw new Error(`Invalid TriHexId hexadecimal format: "${str}"`);
    }
    const id = BigInt(cleanStr.startsWith('0x') ? cleanStr : `0x${cleanStr}`);
    if (!isValidCell(id)) {
        throw new RangeError(`Parsed TriHexId 0x${id.toString(16)} is out of valid geometric bounds`);
    }
    return id;
}
/**
 * Utility replacer for JSON.stringify to safely serialize BigInt TriHexId values as hex strings.
 */
function bigIntReplacer(_key, value) {
    if (typeof value === 'bigint') {
        return cellToString(value);
    }
    return value;
}

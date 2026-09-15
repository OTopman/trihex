"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidCell = void 0;
exports.cellToString = cellToString;
exports.stringToCell = stringToCell;
exports.bigIntReplacer = bigIntReplacer;
const validation_1 = require("./validation");
Object.defineProperty(exports, "isValidCell", { enumerable: true, get: function () { return validation_1.isValidCell; } });
const HEX_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;
/**
 * Converts a 64-bit TriHexId to a canonical 16-character lowercase hexadecimal string.
 * Example: "0000000000bd4533"
 */
function cellToString(id) {
    (0, validation_1.validateCellId)(id);
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
    (0, validation_1.validateCellId)(id);
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

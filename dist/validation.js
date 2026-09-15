"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCellId = validateCellId;
exports.isValidCell = isValidCell;
exports.validateCoordinates = validateCoordinates;
exports.validateResolution = validateResolution;
exports.validateRadius = validateRadius;
const types_1 = require("./types");
const HEX_STRING_REGEX = /^(0x)?[0-9a-fA-F]{1,16}$/;
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
function validateCellId(id) {
    if (typeof id !== 'bigint') {
        throw new TypeError(`Expected BigInt for TriHexId, received ${typeof id}`);
    }
    if (id < 0n || id > types_1.BIT_LAYOUT.MAX_SIGNED_INT64) {
        throw new RangeError(`TriHexId 0x${id.toString(16)} is out of signed 63-bit range [0, 0x7fffffffffffffff]`);
    }
    const face = Number((id >> types_1.BIT_LAYOUT.FACE_SHIFT) & 0x1fn);
    if (face < 0 || face >= types_1.BIT_LAYOUT.TOTAL_FACES) {
        throw new RangeError(`TriHexId 0x${id.toString(16)} has invalid face ${face} (must be 0..${types_1.BIT_LAYOUT.TOTAL_FACES - 1})`);
    }
    const resolution = Number((id >> types_1.BIT_LAYOUT.RES_SHIFT) & 0x0fn);
    if (resolution < 0 || resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new RangeError(`TriHexId 0x${id.toString(16)} has invalid resolution ${resolution} (must be 0..${types_1.BIT_LAYOUT.MAX_RESOLUTION})`);
    }
    const isDual = ((id >> 53n) & 1n) === 1n;
    if (isDual) {
        // Check reserved padding bits 42..52 (11 bits, must be strictly zero)
        const reservedHigh = (id >> 42n) & 0x7ffn;
        if (reservedHigh !== 0n) {
            throw new RangeError(`Dual TriHexId 0x${id.toString(16)} has non-zero reserved padding bits 42..52 (0x${reservedHigh.toString(16)})`);
        }
        // Check reserved padding bits 0..9 (10 bits, must be strictly zero)
        const reservedLow = id & 0x3ffn;
        if (reservedLow !== 0n) {
            throw new RangeError(`Dual TriHexId 0x${id.toString(16)} has non-zero reserved padding bits 0..9 (0x${reservedLow.toString(16)})`);
        }
        const N = 1 << resolution;
        const I = Number((id >> 26n) & 0xffffn);
        const J = Number((id >> 10n) & 0xffffn);
        if (I < 0 || J < 0 || I + J > N) {
            throw new RangeError(`Dual TriHexId 0x${id.toString(16)} has invalid coordinates (${I}, ${J}) for resolution ${resolution} (N=${N})`);
        }
    }
    else {
        // For primal cells, bit 53 is 0, and all bits from 2*resolution up to 53 must be strictly zero!
        const maxMortonForRes = resolution === 0 ? 0n : (1n << BigInt(resolution * 2)) - 1n;
        const lowerBits = id & ((1n << 54n) - 1n); // all 54 bits below resolution field
        if (lowerBits > maxMortonForRes) {
            throw new RangeError(`TriHexId 0x${id.toString(16)} has non-zero reserved bits or Morton code 0x${lowerBits.toString(16)} exceeding resolution ${resolution} capacity (max 0x${maxMortonForRes.toString(16)})`);
        }
    }
    // Verify sign guard bit 63 is zero
    if ((id & (1n << types_1.BIT_LAYOUT.SIGN_GUARD_BIT)) !== 0n) {
        throw new RangeError(`TriHexId 0x${id.toString(16)} has sign bit set`);
    }
}
/**
 * Non-throwing predicate checking whether an input is a valid TriHexId or hex string.
 */
function isValidCell(input) {
    try {
        let id;
        if (typeof input === 'string') {
            const clean = input.trim();
            if (!HEX_STRING_REGEX.test(clean))
                return false;
            id = BigInt(clean.startsWith('0x') ? clean : `0x${clean}`);
        }
        else if (typeof input === 'bigint') {
            id = input;
        }
        else {
            return false;
        }
        validateCellId(id);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Validates geographic WGS84 latitude and longitude coordinates.
 */
function validateCoordinates(lat, lng) {
    if (typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)) {
        throw new TypeError(`Coordinates must be finite numbers. Received lat=${lat}, lng=${lng}`);
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new RangeError(`Coordinates out of bounds: lat=${lat} (must be [-90, 90]), lng=${lng} (must be [-180, 180])`);
    }
}
/**
 * Validates grid resolution.
 */
function validateResolution(resolution) {
    if (typeof resolution !== 'number' ||
        !Number.isInteger(resolution) ||
        resolution < 0 ||
        resolution > types_1.BIT_LAYOUT.MAX_RESOLUTION) {
        throw new RangeError(`Resolution ${resolution} is invalid. Must be an integer between 0 and ${types_1.BIT_LAYOUT.MAX_RESOLUTION}`);
    }
}
/**
 * Validates graph search radius.
 */
function validateRadius(radius, maxRadius = 15) {
    if (typeof radius !== 'number' || !Number.isInteger(radius)) {
        throw new TypeError(`Radius must be an integer. Received ${radius}`);
    }
    if (radius < 0) {
        throw new RangeError(`Radius must be non-negative. Received ${radius}`);
    }
    if (radius > maxRadius) {
        throw new RangeError(`Radius ${radius} exceeds maximum permitted limit (${maxRadius}) to prevent event-loop starvation`);
    }
}

export declare const roundWithPrecision: (value: number, precision?: number) => number;
/**
 * Half the data's quantization step, used to offset colour/contour thresholds so
 * band edges fall inside grid cells instead of snapping to cell corners when a
 * breakpoint coincides with a quantization level.
 *
 * The .om storage scale factor gives the step exactly: stored ints are
 * `round(value * scaleFactor)`, so the step is 1 / scaleFactor. Every field
 * carries a scale factor (simple variables from the file, derived variables from
 * their derivation rule); when it is missing or invalid the offset is 0.
 */
export declare const halfQuantum: (scaleFactor?: number) => number;
export declare const degreesToRadians: (degree: number) => number;
export declare const radiansToDegrees: (rad: number) => number;
/** Normalize longitude to [-180, 180] */
export declare const normalizeLon: (lon: number) => number;
export declare const tile2lon: (x: number, z: number) => number;
export declare const tile2lat: (y: number, z: number) => number;
export declare const lon2tile: (lon: number, z: number) => number;
export declare const lat2tile: (lat: number, z: number) => number;
export declare const derivative: (fm1: number, fp1: number) => number;
export declare const secondDerivative: (fm1: number, f0: number, fp1: number) => number;
export declare const modPositive: (n: number, m: number) => number;
export declare const rotatePoint: (cx: number, cy: number, theta: number, x: number, y: number) => number[];
export declare const fastAtan2: (y: number, x: number) => number;
export declare const hermite: (t: number, p0: number, p1: number, m0: number, m1: number) => number;

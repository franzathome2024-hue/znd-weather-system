export declare const interpolateNearest: (values: Float32Array, x: number, y: number, xFraction: number, yFraction: number, nx: number, ny: number, longitudeWrap?: boolean) => number;
export declare const bilinearNaNAware: (p0: number, p1: number, p2: number, p3: number, xfLower: number, xfUpper: number, yFraction: number) => number;
/**
 * The NaN-aware bilinear for an angular field in degrees. Angles cannot be
 * blended as scalars — halfway between 359° and 1° is 0°, not 180° — so each
 * corner becomes a unit vector, the two components are blended by the same
 * NaN-aware bilinear as any scalar field, and the resultant is turned back into
 * an angle. That is the circular mean, i.e. exactly what interpolating the u/v
 * components of a unit-speed wind would give.
 *
 * `Math.sin`/`Math.cos` map NaN to NaN, so both component blends see the same
 * missing corners and take the same triangle branch. The blend only has to be
 * proportional to the resultant vector — `atan2` is scale invariant — so the
 * triangle branch's weight renormalization is harmless here.
 *
 * The resultant is degenerate (zero length) only when the contributing corners
 * cancel exactly, e.g. two equally weighted corners 180° apart; there is no
 * meaningful mean direction in that case and `atan2(0, 0)` returns 0°.
 */
export declare const bilinearAngleNaNAware: (p0: number, p1: number, p2: number, p3: number, xfLower: number, xfUpper: number, yFraction: number) => number;
export declare const interpolateLinear: (values: Float32Array, x: number, y: number, xFraction: number, yFraction: number, nx: number, longitudeWrap?: boolean) => number;
/** `interpolateLinear` for an angular field in degrees (see `bilinearAngleNaNAware`). */
export declare const interpolateLinearAngle: (values: Float32Array, x: number, y: number, xFraction: number, yFraction: number, nx: number, longitudeWrap?: boolean) => number;
export declare const interpolateCubic: (values: Float32Array, x: number, y: number, xFraction: number, yFraction: number, nx: number, ny: number, longitudeWrap?: boolean) => number;
export declare const catmullRom1D: (t: number, p0: number, p1: number, p2: number, p3: number) => number;
export declare const monotoneHermite: (t: number, p0: number, p1: number, p2: number, p3: number) => number;
export declare const interpolateMonotone: (values: Float32Array, x: number, y: number, xFraction: number, yFraction: number, nx: number, ny: number, longitudeWrap?: boolean) => number;

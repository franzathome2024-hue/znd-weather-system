import { Bounds, ClippingOptions } from '../types';
/**
 * Flat representation of clipping polygons.
 * When `useSAB` is true the backing buffer is a SharedArrayBuffer (zero-copy
 * across workers); otherwise a regular ArrayBuffer is used.
 *
 * Polygon grouping is preserved so that holes are correctly excluded:
 * `polygonOffsets[p]` .. `polygonOffsets[p+1]` gives the range of ring indices
 * belonging to polygon *p* (first ring = outer boundary, rest = holes).
 */
export type SharedPolygons = {
    /** Flat [lon, lat, …] pairs for all rings. */
    coordinates: Float64Array;
    /** Ring start indices (element offsets into `coordinates`). Length = numRings + 1. */
    offsets: Uint32Array;
    /** Polygon start indices (indices into `offsets`). Length = numPolygons + 1. */
    polygonOffsets: Uint32Array;
};
export type ResolvedClippingOptions = {
    polygons?: SharedPolygons;
    bounds?: Bounds;
    fillRule: 'nonzero' | 'evenodd';
};
/** Number of rings stored in a SharedPolygons structure. */
export declare const sharedPolygonsRingCount: (sp: SharedPolygons) => number;
/** Number of polygons stored in a SharedPolygons structure. */
export declare const sharedPolygonsPolygonCount: (sp: SharedPolygons) => number;
/** Extract ring *i* as a plain `number[][]` (each element `[lon, lat]`). */
export declare const sharedPolygonsRing: (sp: SharedPolygons, i: number) => number[][];
/**
 * Creates a reusable point-in-clipping tester from resolved clipping options.
 * Pre-computes the wrapped polygon arrays and bounds so the hot loop only
 * does an O(1) bounds check followed by the point-in-polygon raycast when
 * actually needed.
 *
 * Returns `undefined` when there are no polygon constraints — callers can
 * skip the test entirely.
 */
export declare const createClippingTester: (clippingOptions: ResolvedClippingOptions | undefined) => ((lon: number, lat: number) => boolean) | undefined;
export declare const resolveClippingOptions: (options: ClippingOptions, useSAB?: boolean) => ResolvedClippingOptions | undefined;
export declare const clipRasterToPolygons: (canvas: OffscreenCanvas, tileSize: number, z: number, x: number, y: number, clippingOptions: ResolvedClippingOptions) => ImageBitmap;

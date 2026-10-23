import { Bounds } from '../types';
/**
 * Snap bounds to tile boundaries for stable, padded data fetching.
 */
export declare const snapBounds: (viewportBounds: Bounds) => Bounds;
export declare const setClippingBounds: (newClippingBounds?: Bounds) => void;
export declare let currentBounds: Bounds | undefined;
export declare const updateCurrentBounds: (viewportBounds: Bounds) => void;
export declare const boundsIncluded: (innerBounds: Bounds, outerBounds: Bounds) => boolean;
/**
 * True when two lon/lat bounding boxes overlap (share any area). Latitude is a
 * plain interval test; longitude tolerates dateline-crossing boxes on either
 * side. Used to decide whether a domain is at least partially inside the map
 * viewport before loading it.
 */
export declare const boundsIntersect: (a: Bounds, b: Bounds) => boolean;
export declare const constrainBounds: (bounds: Bounds, constraint: Bounds) => Bounds | undefined;
export declare const checkAgainstBounds: (point: number, min: number, max: number) => boolean;

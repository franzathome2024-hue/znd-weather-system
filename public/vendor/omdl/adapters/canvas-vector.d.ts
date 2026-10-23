import { VectorTile } from '@mapbox/vector-tile';
import { ExtractedFeatures } from './leaflet-worker/leaflet-pbf-worker-pool';
/**
 * Style callback for vector tile features drawn on a canvas.
 *
 * Return `null` / `undefined` to skip the feature.
 */
export interface CanvasVectorStyle {
    strokeStyle?: string | ((value: number) => string);
    lineWidth?: number | ((value: number) => number);
    lineCap?: CanvasLineCap;
    globalAlpha?: number | ((value: number) => number);
}
export type CanvasVectorStyleFn = (properties: Record<string, unknown>, layerName: string) => CanvasVectorStyle | null | undefined;
/** Default arrow style: semi-transparent dark lines, width based on wind speed. */
export declare const defaultVectorStyle: CanvasVectorStyleFn;
/**
 * Extract pre-processed features from a decoded MVT.
 *
 * Resolves styles via the user's `styleFn` and converts geometry to pixel
 * coordinates. The result can be passed to the worker or the main-thread
 * fallback for canvas rendering.
 *
 * Geometry is drawn exactly where the tile puts it. The protocol lays
 * arrows and barbs out on a lattice whose far edge is shared with the
 * neighbouring tile, so each tile draws its half of an edge shape and the
 * seam only lines up when nothing is rescaled or thinned here.
 */
export declare const extractRenderFeatures: (vectorTile: VectorTile, tileSize: number, styleFn: CanvasVectorStyleFn) => ExtractedFeatures;

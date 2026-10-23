/**
 * Web Worker pool for offloading vector tile canvas rendering.
 *
 * The main thread decodes the PBF and resolves styles (keeping library
 * dependencies and user-provided style functions on the main thread), then
 * sends pre-processed feature data (coordinates in pixel space, resolved
 * styles) to a pool of workers.
 *
 * Each worker creates an `OffscreenCanvas`, draws the features, and returns
 * the result as a transferable `ImageBitmap` — zero-copy transfer back to the
 * main thread which draws it onto the DOM canvas with a single `drawImage`.
 */
/** Pre-processed feature ready for canvas rendering. */
export interface RenderFeature {
    type: 1 | 2 | 3;
    /** Each ring is a flat array of pixel coordinates: [x1, y1, x2, y2, …]. */
    rings: number[][];
    strokeStyle: string;
    lineWidth: number;
    lineCap: string;
    globalAlpha: number;
    fill: boolean;
    pointRadius: number;
}
/** Result from extracting render features from a decoded vector tile. */
export interface ExtractedFeatures {
    features: RenderFeature[];
}
/**
 * Render pre-processed features in a web worker.
 * Returns a transferable `ImageBitmap` that can be drawn onto a DOM canvas.
 */
export declare const renderInWorker: (tileSize: number, extracted: ExtractedFeatures) => Promise<ImageBitmap | null>;

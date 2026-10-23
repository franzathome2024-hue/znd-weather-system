import { CanvasVectorStyleFn } from './canvas-vector';
import { ProtocolAdapter } from './types';
/** `Cesium.Request`, limited to what the adapter sets before scheduling it. */
export interface CesiumRequestLike {
    url?: string;
    requestFunction?: () => Promise<unknown>;
    cancelFunction?: () => void;
}
/** The subset of the Cesium namespace this adapter consumes. */
export interface CesiumLib {
    WebMercatorTilingScheme: new () => {
        rectangle: unknown;
    };
    Rectangle: {
        fromDegrees(west: number, south: number, east: number, north: number): unknown;
        intersection(rectangle: unknown, otherRectangle: unknown): unknown | undefined;
    };
    Event: new () => unknown;
    Credit: new (html: string, showOnScreen?: boolean) => unknown;
    RequestScheduler: {
        request(request: CesiumRequestLike): Promise<unknown> | undefined;
    };
}
/** What `requestImage` resolves to: a tile bitmap, or a transparent pixel for an empty tile. */
export type CesiumImageryTypes = ImageBitmap | ImageData;
/**
 * The `ImageryProvider` implementation built by the adapter. Plain object
 * with the properties Cesium's `ImageryLayer` reads; no `ready` or
 * `readyPromise`, which Cesium dropped with the async provider API.
 */
export interface CesiumImageryProvider {
    tilingScheme: {
        rectangle: unknown;
    };
    rectangle: unknown;
    tileWidth: number;
    tileHeight: number;
    minimumLevel: number;
    maximumLevel: number;
    tileDiscardPolicy: undefined;
    proxy: undefined;
    errorEvent: unknown;
    credit: unknown;
    hasAlphaChannel: true;
    getTileCredits: (x: number, y: number, level: number) => undefined;
    /**
     * Called by Cesium for every tile it wants. Returns `undefined` when the
     * request scheduler has no free slot, in which case Cesium asks again on a
     * later frame.
     */
    requestImage: (x: number, y: number, level: number, request?: CesiumRequestLike) => Promise<CesiumImageryTypes> | undefined;
}
/** Options for `createImageryProvider`. */
export interface CesiumImageryProviderOptions {
    /** Shallowest level tiles are requested at. Defaults to the TileJSON's `minzoom`. */
    minimumLevel?: number;
    /** Deepest level tiles are requested at; Cesium upsamples past it. Defaults to the TileJSON's `maxzoom`. */
    maximumLevel?: number;
    /** Attribution shown by Cesium's credit display (HTML). Defaults to the TileJSON's `attribution`. */
    credit?: string;
}
/** Options for `createVectorImageryProvider`. */
export interface CesiumVectorImageryProviderOptions extends CesiumImageryProviderOptions {
    /** Style function called for each feature; see `CanvasVectorStyleFn`. */
    style?: CanvasVectorStyleFn;
}
/**
 * The object returned by `addCesiumProtocolSupport`.
 */
export interface CesiumProtocolAdapter extends ProtocolAdapter {
    /**
     * Create a raster imagery provider backed by the registered protocol handler.
     *
     * Resolves once the TileJSON is known. Wrap the promise with
     * `Cesium.ImageryLayer.fromProviderAsync` to add it to a viewer.
     *
     * @param tileJsonUrl - The `om://` TileJSON URL.
     * @param options     - Level range and attribution.
     */
    createImageryProvider: (tileJsonUrl: string, options?: CesiumImageryProviderOptions) => Promise<CesiumImageryProvider>;
    /**
     * Create an imagery provider that draws the protocol's vector tiles
     * (arrows, barbs, contours, grid points) onto raster tiles.
     *
     * @param tileJsonUrl - The `om://` TileJSON URL, including the vector params (`arrows=true`, `contours=true`, …).
     * @param options     - Style function, level range and attribution.
     */
    createVectorImageryProvider: (tileJsonUrl: string, options?: CesiumVectorImageryProviderOptions) => Promise<CesiumImageryProvider>;
}
/**
 * Adds custom protocol support to CesiumJS.
 *
 * @param Cesium - The Cesium namespace (`import * as Cesium from 'cesium'` or
 *                 `window.Cesium`).
 * @returns A `CesiumProtocolAdapter` with `addProtocol`, `removeProtocol`,
 *          `createImageryProvider` and `createVectorImageryProvider`.
 */
export declare const addCesiumProtocolSupport: (Cesium: CesiumLib) => CesiumProtocolAdapter;

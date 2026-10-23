import { CanvasVectorStyle, CanvasVectorStyleFn } from './canvas-vector';
import { ProtocolAdapter } from './types';
/**
 * Tile coordinates passed to `createTile` and stored in `GridLayer._tiles`.
 * A Leaflet `Point` (`{x, y}`) with `z` (zoom) added at runtime.
 */
interface LeafletCoords {
    x: number;
    y: number;
    z: number;
}
/**
 * Entry in the `_tiles` cache maintained by `GridLayer`.
 * See: https://github.com/Leaflet/Leaflet/blob/main/src/layer/tile/GridLayer.js
 */
interface LeafletInternalTile {
    /** The element returned by `createTile` (e.g. `<canvas>` or `<img>`). */
    el: HTMLElement;
    /** Tile coordinates including zoom level. */
    coords: LeafletCoords;
    /** Whether the tile is inside the current viewport. */
    current: boolean;
    /** Unix timestamp (ms) set when the tile finishes loading. */
    loaded?: number;
    /** Set to `true` once the fade-in animation completes. */
    active?: boolean;
    /** Whether to keep the tile during a prune pass. */
    retain?: boolean;
}
/** Leaflet GridLayer instance (only the properties this adapter uses). */
interface LeafletGridLayerInstance {
    options: {
        zoomOffset?: number;
    };
    getTileSize(): {
        x: number;
        y: number;
    };
    /** Internal tile cache keyed by `"x:y:z"`. */
    _tiles: Record<string, LeafletInternalTile>;
    /** The zoom level currently being rendered, or `undefined` when out of range. */
    _tileZoom: number | undefined;
    /** Fire a Leaflet event on this layer (from `Layer`). */
    fire(event: string, data?: Record<string, unknown>): this;
}
/** The subset of the Leaflet namespace this adapter consumes. */
export interface LeafletLib {
    GridLayer: {
        extend(proto: Record<string, unknown>): new (options: Record<string, unknown>) => LeafletGridLayerInstance;
        prototype: {
            _removeTile(this: unknown, key: string): void;
            _abortLoading(this: unknown): void;
        };
    };
}
export type LeafletVectorStyle = CanvasVectorStyle;
export type LeafletVectorStyleFn = CanvasVectorStyleFn;
/**
 * Options accepted by `createVectorTileLayer`, extending Leaflet GridLayer options.
 */
export interface VectorTileLayerOptions {
    /** Style function called for each feature. */
    style?: LeafletVectorStyleFn;
    /** Extra options forwarded to L.GridLayer. */
    [key: string]: unknown;
}
/**
 * The object returned by `addLeafletProtocolSupport`.
 */
export interface LeafletProtocolAdapter extends ProtocolAdapter {
    /**
     * Create a raster tile layer backed by the registered protocol handler.
     *
     * Returns an `L.GridLayer` whose `createTile` fetches each tile through
     * omProtocol and draws the `ImageBitmap` directly onto a canvas element —
     * no redundant PNG encode/decode step.
     *
     * @param tileJsonUrl   - The `om://` TileJSON URL.
     * @param leafletOptions - Extra options forwarded to `L.GridLayer`.
     */
    createTileLayer: (tileJsonUrl: string, leafletOptions?: Record<string, unknown>) => LeafletGridLayerInstance;
    /**
     * Create a vector tile layer backed by the registered protocol handler.
     *
     * Returns an `L.GridLayer` that fetches PBF bytes through omProtocol,
     * decodes MVT features, and renders them on a canvas tile.
     * Suitable for wind arrows, contour lines, grid points, etc.
     *
     * @param tileJsonUrl   - The `om://` TileJSON URL.
     * @param options        - Style function and extra `L.GridLayer` options.
     */
    createVectorTileLayer: (tileJsonUrl: string, options?: VectorTileLayerOptions) => LeafletGridLayerInstance;
}
/**
 * Adds custom protocol support to Leaflet.
 *
 * @param L - The Leaflet global object (`import L from 'leaflet'` or `window.L`).
 * @returns A `LeafletProtocolAdapter` with `addProtocol`, `removeProtocol`,
 *          `createTileLayer`, and `createVectorTileLayer`.
 */
export declare const addLeafletProtocolSupport: (L: LeafletLib) => LeafletProtocolAdapter;
export {};

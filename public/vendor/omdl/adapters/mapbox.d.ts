import { LngLatBounds } from './helpers';
import { ProtocolAdapter } from './types';
/** A tile name in the XYZ scheme, as Mapbox hands it to a custom source. */
interface TileId {
    z: number;
    x: number;
    y: number;
}
/**
 * The `CustomSourceInterface` implementation built by `createRasterSource`,
 * ready for `map.addSource(id, source)`.
 */
export interface MapboxCustomRasterSource {
    type: 'custom';
    dataType: 'raster';
    tileSize: number;
    minzoom: number;
    maxzoom: number;
    attribution?: string;
    bounds?: LngLatBounds;
    loadTile: (tile: TileId, options: {
        signal: AbortSignal;
    }) => Promise<ImageBitmap | null>;
}
/** Options for `createRasterSource`; all are forwarded onto the custom source. */
export interface MapboxRasterSourceOptions {
    /** Size in pixels the tiles are rendered at; the protocol's default is 512. */
    tileSize?: number;
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    /** Tiles outside these bounds are never requested. */
    bounds?: LngLatBounds;
}
/** Options for `addVectorSource`. */
export interface MapboxVectorSourceOptions {
    /** Deepest zoom to fetch tiles at; the view is overzoomed past it. Defaults to the TileJSON's `maxzoom`. */
    maxzoom?: number;
    /** Shallowest zoom to fetch tiles at. Defaults to the TileJSON's `minzoom`. */
    minzoom?: number;
    /** Extra options for the underlying GeoJSON source (e.g. `buffer`, `tolerance`). */
    geojson?: Record<string, unknown>;
}
/** What `addVectorSource` returns: control over the viewport-synced source. */
export interface MapboxVectorSourceHandle {
    /** Re-fetch the tiles covering the current viewport and replace the source data. */
    refresh: () => Promise<void>;
    /** Stop syncing and remove the source. Remove the layers that use it first. */
    remove: () => void;
}
/** The subset of a Mapbox `Map` this adapter consumes. */
export interface MapboxMapLike {
    getZoom(): number;
    getBounds(): {
        getWest(): number;
        getSouth(): number;
        getEast(): number;
        getNorth(): number;
    } | null;
    addSource(id: string, source: Record<string, unknown>): unknown;
    removeSource(id: string): unknown;
    getSource(id: string): {
        setData(data: unknown): unknown;
    } | undefined;
    on(type: string, listener: () => void): unknown;
    off(type: string, listener: () => void): unknown;
}
/**
 * The object returned by `addMapboxProtocolSupport`.
 */
export interface MapboxProtocolAdapter extends ProtocolAdapter {
    /**
     * Build a custom raster source backed by the registered protocol handler.
     *
     * The result is a `CustomSourceInterface` implementation: pass it to
     * `map.addSource(id, source)` and reference `id` from `raster` layers.
     *
     * @param tileJsonUrl - The `om://` TileJSON URL.
     * @param options     - Zoom range, tile size, attribution and bounds.
     */
    createRasterSource: (tileJsonUrl: string, options?: MapboxRasterSourceOptions) => MapboxCustomRasterSource;
    /**
     * Add a GeoJSON source that mirrors the protocol's vector tiles for the
     * current viewport and keeps following it on `moveend`.
     *
     * Call it once the style is loaded (e.g. in `map.on('load')`), then add
     * `line` / `fill` / `symbol` layers on `sourceId`, filtering on the `layer`
     * property (`wind-arrows`, `wind-barb-pennants`, `contours`, …).
     *
     * @param map         - The Mapbox map.
     * @param sourceId    - Id of the GeoJSON source to create.
     * @param tileJsonUrl - The `om://` TileJSON URL, including the vector params (`arrows=true`, `contours=true`, …).
     * @param options     - Zoom range and GeoJSON source options.
     */
    addVectorSource: (map: MapboxMapLike, sourceId: string, tileJsonUrl: string, options?: MapboxVectorSourceOptions) => MapboxVectorSourceHandle;
}
/**
 * Adds custom protocol support to Mapbox GL JS.
 *
 * @returns A `MapboxProtocolAdapter` with `addProtocol`, `removeProtocol`,
 *          `createRasterSource` and `addVectorSource`.
 */
export declare const addMapboxProtocolSupport: () => MapboxProtocolAdapter;
export {};

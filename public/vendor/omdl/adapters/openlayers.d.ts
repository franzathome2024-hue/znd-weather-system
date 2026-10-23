import { ProtocolAdapter } from './types';
/** Tile grid with extent lookup (ol.tilegrid.TileGrid). */
interface OlTileGrid {
    getTileCoordExtent(tileCoord: number[]): number[];
}
/** MVT format instance (ol.format.MVT). */
interface OlMVTFormat {
    readFeatures(source: unknown, options: {
        extent: number[];
        featureProjection: unknown;
    }): unknown[];
    readProjection(source: unknown): unknown;
}
/** Common surface shared by DataTile and VectorTile sources. */
interface OlSourceBase {
    setAttributions(attributions: string): void;
}
/** ol.source.VectorTile instance (only the properties this adapter uses). */
interface OlVectorTileSource extends OlSourceBase {
    getTileGrid(): OlTileGrid;
    getProjection(): unknown;
    on(event: 'tileloaderror', listener: (evt: {
        tile: OlVectorTileTile;
    }) => void): void;
    on(event: 'clear', listener: () => void): void;
}
/** A single OL vector tile object passed to tileLoadFunction. */
interface OlVectorTileTile {
    getTileCoord(): number[];
    setFeatures(features: unknown[]): void;
    onLoad(features: unknown[], projection: unknown): void;
    setState(state: number): void;
    /** Returns the tile's current state (0=IDLE, 1=LOADING, 2=LOADED, 3=ERROR, 4=EMPTY, 5=ABORT). */
    getState(): number;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}
/** The subset of the OpenLayers namespace this adapter consumes. */
export interface OlLib {
    source: {
        DataTile: new (options: Record<string, unknown>) => OlSourceBase;
        VectorTile: new (options: Record<string, unknown>) => OlVectorTileSource;
    };
    format?: {
        MVT: new () => OlMVTFormat;
    };
}
/**
 * The object returned by `addOpenLayersProtocolSupport`.
 */
export interface OpenLayersProtocolAdapter extends ProtocolAdapter {
    /**
     * Create a raster tile source backed by the registered protocol handler.
     *
     * Returns an `ol.source.DataTile` whose async `loader` fetches each tile
     * through omProtocol and returns the `ImageBitmap` directly to OL — no PNG
     * encode/decode roundtrip.  Use with `new ol.layer.WebGLTile({ source })`.
     *
     * @param tileJsonUrl - The `om://` TileJSON URL.
     * @param olOptions   - Extra options forwarded to `ol.source.DataTile` constructor.
     */
    createRasterSource: (tileJsonUrl: string, olOptions?: Record<string, unknown>) => OlSourceBase;
    /**
     * Create a vector tile source backed by the registered protocol handler.
     *
     * Returns an `ol.source.VectorTile` (MVT format) with a custom
     * `tileLoadFunction` that fetches PBF bytes through omProtocol and
     * feeds them to OL's native MVT parser via a blob URL.
     * Use with `new ol.layer.VectorTile({ source, style })`.
     *
     * @param tileJsonUrl - The `om://` TileJSON URL.
     * @param olOptions   - Extra options forwarded to `ol.source.VectorTile`.
     */
    createVectorTileSource: (tileJsonUrl: string, olOptions?: Record<string, unknown>) => OlVectorTileSource;
}
/**
 * Adds custom protocol support to OpenLayers.
 *
 * @param ol - The OpenLayers global object (or a subset with
 *             `{ source: { DataTile, VectorTile }, format: { MVT } }`).
 * @returns An `OpenLayersProtocolAdapter` with `addProtocol`, `removeProtocol`,
 *          `createRasterSource`, and `createVectorTileSource`.
 */
export declare const addOpenLayersProtocolSupport: (ol: OlLib) => OpenLayersProtocolAdapter;
export {};

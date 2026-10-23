import { OmProtocolSettings } from '../types';
import { ProtocolHandler, RegisteredProtocol } from './types';
/** Extract the protocol prefix from a URL, e.g. "om" from "om://…". Returns null if not found. */
export declare const extractProtocol: (url: string) => string | null;
/** `[west, south, east, north]` in degrees. */
export type LngLatBounds = [number, number, number, number];
export declare const clamp: (value: number, min: number, max: number) => number;
/**
 * The tiles at zoom `z` covering `bounds`. Columns are left unwrapped so a
 * view across the antimeridian keeps its longitudes continuous; `wrappedX`
 * is the column to request.
 */
export declare const coveringTiles: (bounds: LngLatBounds, z: number) => {
    x: number;
    y: number;
    wrappedX: number;
}[];
/** Substitute {z}/{x}/{y} placeholders in a tile URL template. */
export declare const buildTileUrl: (template: string, z: number, x: number, y: number) => string;
/** Resolved TileJSON data returned by the lazy resolver. */
export interface TileJsonResolved {
    tileTemplate: string;
    tileJson: Record<string, unknown>;
}
/** A protocol registry that manages handlers and provides TileJSON resolution. */
export interface ProtocolRegistry {
    add(protocol: string, handler: ProtocolHandler, settings?: OmProtocolSettings): void;
    remove(protocol: string): void;
    has(protocol: string): boolean;
    get(protocol: string): RegisteredProtocol;
    makeTileJsonResolver(tileJsonUrl: string): () => Promise<TileJsonResolved>;
}
/**
 * Create a protocol registry that manages handler registration and TileJSON resolution.
 *
 * @param adapterName - Label used in error messages, e.g. `"leaflet-adapter"`.
 */
export declare const createProtocolRegistry: (adapterName: string) => ProtocolRegistry;

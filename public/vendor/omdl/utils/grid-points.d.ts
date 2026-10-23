import { GridInterface } from '../grids';
import { PbfWriter } from 'pbf';
import { ResolvedClippingOptions } from './clipping';
/** One concrete domain's native grid + data for the grid-point layer. */
export interface GridPointSource {
    grid: GridInterface;
    values: Float32Array;
    directions?: Float32Array;
}
/**
 * Generate the PBF grid-point layer for a single tile.
 *
 * `sources` are ordered finest-first.  A point from a coarser source is dropped
 * when a finer source already covers that location, so seamless composite domains
 * render the best-available grid everywhere without overlapping markers.  A
 * regular domain simply passes a single-element `sources` array.
 *
 * Computes tile geographic bounds that intersect with `clippingBounds` if defined.
 */
export declare const generateGridPoints: (pbf: PbfWriter, sources: GridPointSource[], x: number, y: number, z: number, clippingOptions?: ResolvedClippingOptions, extent?: number, margin?: number) => void;

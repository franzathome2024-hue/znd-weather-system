import { ResolvedClippingOptions } from './clipping';
/**
 * Visit every point of an n×n lattice laid over tile x/y/z, in tile units of
 * `extent`, skipping points outside the clipping region. Shared by the arrow
 * and barb generators so both place their shapes on the same grid.
 *
 * Stepped by index rather than by accumulating the spacing, which drifts. The
 * far edge is included: a shape there is clipped to its own tile, and the
 * neighbouring tile draws the other half of it.
 */
export declare const forEachLatticePoint: (lattice: number, x: number, y: number, z: number, extent: number, clippingOptions: ResolvedClippingOptions | undefined, visit: (tileX: number, tileY: number, lat: number, lon: number) => void) => void;

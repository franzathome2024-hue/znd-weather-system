import { Domain } from './types';
/**
 * Returns the domain's outline as a closed `[lon, lat]` ring: the precomputed
 * data-shape footprint when one exists (NULL-padded reprojected grids whose real
 * data region is smaller than the grid box), otherwise the grid's boundary
 * polygon (`getBoundaryPolygon`).
 */
export declare const getDomainBoundary: (domain: Domain) => Array<[number, number]>;

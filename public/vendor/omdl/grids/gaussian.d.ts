import { GridInterface, GridPoint } from './interface';
import { Bounds, DimensionRange, GaussianGridData, InterpolationMethod } from '../types';
/**
 * Implementation of a Gaussian grid projection for mapping, specifically the O1280 version used by ECMWF IFS
 */
export declare class GaussianGrid implements GridInterface {
    private readonly ny;
    private readonly nx;
    private readonly nxStart;
    private readonly latitudeLines;
    constructor(data: GaussianGridData, ranges?: DimensionRange[] | null);
    getBounds(): Bounds;
    getBoundaryPolygon(): Array<[number, number]>;
    getCenter(): {
        lng: number;
        lat: number;
    };
    getCoveringRanges(south: number, _west: number, north: number, _east: number): DimensionRange[];
    /**
     * Number of points in the grid
     */
    private get count();
    /**
     * Get the number of points in a specific latitude line
     * @param y - The latitude line index
     */
    nxOf(y: number): number;
    private integral;
    getInterpolatedValue(values: Float32Array, lat: number, lon: number, method: InterpolationMethod): number;
    private getCubicValue;
    private interpRowLon;
    /**
     * The four samples bracketing a coordinate plus the trapezoidal-cell
     * fractions, shared by the scalar and the angular linear interpolation.
     */
    private linearStencil;
    getLinearInterpolatedValue(values: Float32Array, lat: number, lon: number): number;
    getLinearInterpolatedDirection(values: Float32Array, lat: number, lon: number): number;
    getNearestNeighborValue(values: Float32Array, lat: number, lon: number): number;
    private yLower;
    forEachPoint(callback: (point: GridPoint) => void | false, bounds?: Bounds): void;
}

import { GridInterface, GridPoint } from './interface';
import { Bounds, DimensionRange, InterpolationMethod, RegularGridData } from '../types';
export declare class RegularGrid implements GridInterface {
    private nx;
    private ny;
    private dx;
    private dy;
    private originLon;
    private originLat;
    private bounds;
    private longitudeWrap;
    private wrapLastCellDouble;
    private center?;
    constructor(data: RegularGridData, ranges?: DimensionRange[] | null);
    /** Grid cell and in-cell fractions for a coordinate, or null outside the grid. */
    private locate;
    getLinearInterpolatedValue(values: Float32Array, lat: number, lon: number): number;
    getLinearInterpolatedDirection(values: Float32Array, lat: number, lon: number): number;
    getInterpolatedValue(values: Float32Array, lat: number, lon: number, method: InterpolationMethod): number;
    getBounds(): Bounds;
    getBoundaryPolygon(): Array<[number, number]>;
    getCenter(): {
        lng: number;
        lat: number;
    };
    getCoveringRanges(south: number, west: number, north: number, east: number): DimensionRange[];
    forEachPoint(callback: (point: GridPoint) => void | false, bounds?: Bounds): void;
}

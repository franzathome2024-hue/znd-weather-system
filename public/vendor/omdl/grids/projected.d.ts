import { GridInterface, GridPoint } from './interface';
import { Bounds, DimensionRange, InterpolationMethod, ProjectionGridFromBounds, ProjectionGridFromGeographicOrigin, ProjectionGridFromProjectedOrigin } from '../types';
export declare class ProjectionGrid implements GridInterface {
    private projection;
    private origin;
    private dx;
    private dy;
    private minX;
    private minY;
    private nx;
    private ny;
    private bounds?;
    private center?;
    constructor(data: ProjectionGridFromBounds | ProjectionGridFromProjectedOrigin | ProjectionGridFromGeographicOrigin, ranges?: DimensionRange[] | null);
    getLinearInterpolatedValue(values: Float32Array, lat: number, lon: number): number;
    getLinearInterpolatedDirection(values: Float32Array, lat: number, lon: number): number;
    getInterpolatedValue(values: Float32Array, lat: number, lon: number, method: InterpolationMethod): number;
    getBounds(): Bounds;
    getCenter(): {
        lng: number;
        lat: number;
    };
    getCoveringRanges(south: number, west: number, north: number, east: number): DimensionRange[];
    findPointInterpolated(lat: number, lon: number): {
        x: number;
        y: number;
        xFraction: number;
        yFraction: number;
    };
    /**
     * Traces the grid's outer edge through the projection, returning a closed
     * `[lon, lat]` ring that follows the true (curved) domain boundary rather than
     * the axis-aligned bounding box. Each edge is sampled at up to
     * `maxPointsPerEdge` points so the curvature is captured without emitting one
     * vertex per grid column/row.
     *
     * The ring spans `nx * dx` — one step past the last grid node, like
     * getBounds() and the regular grid — matching the sampled coverage
     * (`findPointInterpolated` accepts `0 <= x < nx`, which nearest sampling
     * fills entirely). A node-rectangle ring sat one full cell inside the
     * rendered data on the max-x/max-y sides.
     */
    getBoundaryPolygon(maxPointsPerEdge?: number): Array<[number, number]>;
    private getProjectedBorderPoints;
    private calculateGeographicBounds;
    private getCenterFromBounds;
    forEachPoint(callback: (point: GridPoint) => void | false, bounds?: Bounds): void;
}

import { LAEAProjectionData, LCCProjectionData, ProjectionData, RotatedLatLonProjectionData, StereographicProjectionData } from '../types';
export declare function createProjection(opts: ProjectionData): Projection;
export interface Projection {
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}
export declare class MercatorProjection implements Projection {
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}
export declare class RotatedLatLonProjection implements Projection {
    θ: number;
    ϕ: number;
    cosθ: number;
    sinθ: number;
    cosϕ: number;
    sinϕ: number;
    constructor(projectionData: RotatedLatLonProjectionData);
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}
export declare class LambertConformalConicProjection implements Projection {
    ρ0: number;
    F: number;
    n: number;
    λ0: number;
    R: number;
    constructor(projectionData: LCCProjectionData);
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}
export declare class LambertAzimuthalEqualAreaProjection implements Projection {
    λ0: number;
    ϕ1: number;
    sinϕ1: number;
    cosϕ1: number;
    R: number;
    constructor(projectionData: LAEAProjectionData);
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}
export declare class StereographicProjection implements Projection {
    λ0: number;
    sinϕ1: number;
    cosϕ1: number;
    R: number;
    constructor(projectionData: StereographicProjectionData);
    forward(latitude: number, longitude: number): [x: number, y: number];
    reverse(x: number, y: number): [latitude: number, longitude: number];
}

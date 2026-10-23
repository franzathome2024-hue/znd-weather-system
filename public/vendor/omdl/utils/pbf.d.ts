import { PbfWriter } from 'pbf';
export interface Feature {
    id: number;
    type: number;
    properties: Record<string, unknown>;
    geom: number[];
}
interface Context {
    feature?: Feature;
    keys: string[];
    values: Array<string | number | boolean>;
    keycache: Record<string, number>;
    valuecache: Record<string, number>;
}
interface VectorTileLayer {
    version?: number;
    name: string;
    extent: number;
    features: Feature[];
}
interface GeometryPoint {
    x: number;
    y: number;
}
interface GeometryFeature {
    loadGeometry(): GeometryPoint[][];
    type: number;
}
export declare const writeLayer: (layer: VectorTileLayer, pbf: PbfWriter) => void;
export declare const writeFeature: (context: Context, pbf: PbfWriter) => void;
export declare const command: (cmd: number, length: number) => number;
export declare const zigzag: (n: number) => number;
export declare const writeGeometry: (feature: GeometryFeature, pbf: PbfWriter) => void;
export declare const writeProperties: (context: Context, pbf: PbfWriter) => void;
export declare const writeValue: (value: string | number | boolean, pbf: PbfWriter) => void;
export {};

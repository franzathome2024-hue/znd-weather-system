import { PbfWriter } from 'pbf';
import { ResolvedClippingOptions } from './clipping';
import { ValueSampler } from './samplers';
export declare const CASES: [number, number][][][];
export declare class Fragment {
    start: number;
    end: number;
    points: number[];
    constructor(start: number, end: number);
    append(x: number, y: number): void;
    prepend(x: number, y: number): void;
    lineString(): number[];
    isEmpty(): boolean;
    appendFragment(other: Fragment): void;
    toArray(): number[];
}
export declare const index: (width: number, x: number, y: number, point: [number, number]) => number;
export declare function interpolate(x: number, y: number, point: [number, number], threshold: number, multiplier: number, bld: number, tld: number, brd: number, trd: number, accept: (x: number, y: number) => void): void;
export declare const ratio: (a: number, b: number, c: number) => number;
export declare const generateContours: (pbf: PbfWriter, sampleValue: ValueSampler, x: number, y: number, z: number, tileSize: number, intervals: number[], clippingOptions: ResolvedClippingOptions | undefined, valueOffset?: number, extent?: number) => void;

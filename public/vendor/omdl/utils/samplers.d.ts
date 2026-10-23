import { GridPointSource } from './grid-points';
import { InterpolationMethod, LayerRenderData } from '../types';
export type ValueSampler = (lat: number, lon: number) => number;
export interface VectorSample {
    /** Magnitude (e.g. wind speed). */
    value: number;
    /** Direction in degrees, same convention as the source `directions` array. */
    direction: number;
}
export type VectorSampler = (lat: number, lon: number) => VectorSample;
export interface Samplers {
    sampleValue: ValueSampler;
    /**
     * `sampleValue` plus half the quantization step of the layer that supplied
     * the value. Colour bands and contours test their thresholds against this,
     * so band edges fall inside grid cells (smooth) instead of snapping to the
     * cell corners when a breakpoint coincides with a quantization level. Each
     * layer's file has its own scale factor, so the offset follows the layer.
     */
    sampleThresholdValue: ValueSampler;
    sampleVector: VectorSampler;
    /** The layers' grids and arrays for the grid-point layer, finest-first. */
    gridSources: GridPointSource[];
}
export declare const createSamplers: (layers: LayerRenderData[], method: InterpolationMethod) => Samplers;

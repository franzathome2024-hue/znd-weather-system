import { PbfWriter } from 'pbf';
import { ResolvedClippingOptions } from './clipping';
import { VectorSampler } from './samplers';
export declare const generateArrows: (pbf: PbfWriter, sampleVector: VectorSampler, x: number, y: number, z: number, clippingOptions: ResolvedClippingOptions | undefined, extent?: number, arrows?: number) => void;

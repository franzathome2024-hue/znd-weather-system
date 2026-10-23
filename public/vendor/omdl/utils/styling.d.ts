import { ColorScale, ColorScales, RenderableColorScale } from '../types';
export declare const getColor: (colorScale: RenderableColorScale, px: number, blend?: boolean, out?: [number, number, number, number]) => [number, number, number, number];
export type ColorSampler = (px: number, out: [number, number, number, number]) => [number, number, number, number];
export declare const makeColorSampler: (colorScale: RenderableColorScale, blend?: boolean) => ColorSampler;
export declare const COLOR_SCALES_WITH_ALIASES: ColorScales;
export declare const getColorScale: (variable: string, dark: boolean, colorScalesSource?: ColorScales) => RenderableColorScale;
export declare const resolveColorScale: (colorScale: ColorScale, dark: boolean) => RenderableColorScale;

import { GridInterface } from './interface';
import { DimensionRange, GridData } from '../types';
export declare class GridFactory {
    static create(data: GridData, ranges?: DimensionRange[] | null): GridInterface;
    private static createUncached;
}

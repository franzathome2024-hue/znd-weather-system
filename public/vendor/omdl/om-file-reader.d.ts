import { BlockCache } from '@openmeteo/file-reader';
import { VariableDerivationRule } from './derivation-rules';
import { Data, DimensionRange } from './types';
/**
 * Configuration options for the WeatherMapLayerFileReader.
 */
export interface FileReaderConfig {
    /**
     * Whether to read data into SharedArrayBuffers. SAB-backed values are shared
     * zero-copy with the tile workers instead of being structured-cloned per
     * tile request. @default true when SharedArrayBuffer is available (cross-origin
     * isolated page or Node), false otherwise
     */
    useSAB?: boolean;
    /** Number of retry attempts for failed requests. @default 2 */
    retries?: number;
    /** Whether to validate ETags for cache coherency. @default false */
    eTagValidation?: boolean;
    /**
     * Block cache implementation to use.
     * In the browser, pass a `BrowserBlockCache`.
     * In Node, pass an `LruBlockCache` or any other `BlockCache<string>`.
     * If omitted, falls back to an in-memory LruBlockCache.
     */
    cache?: BlockCache<string | bigint>;
    /**
     * Rules deriving a requested variable from the variables actually stored in
     * the file (wind speed from u/v components, snowfall from its water
     * equivalent). A rule matches the requested name and then decides against
     * the file's variables whether it applies; the first matching rule that
     * claims the name wins. The list replaces the defaults rather than
     * extending them: spread `defaultDerivationRules` to keep them.
     *
     * Copied once, when the reader is built (the protocol builds its shared
     * reader on the first request): like the other `fileReaderConfig` fields,
     * later changes are ignored.
     *
     * @default defaultDerivationRules
     */
    derivationRules?: VariableDerivationRule[];
}
/** What the caller knows about a file beyond its URL, for the derivation rules. */
export interface ReadContext {
    /**
     * Length of the file's time step in hours: the reader divides the
     * precipitation family's per-step sums by it, and rules that ask for it
     * (`usesTimeStep`) get it. The om protocol passes on the
     * `delta_time_hours` parameter of the om URL, which the host application
     * sets from the run's valid times; a direct call has to pass it for such
     * a variable (`variableUsesTimeStep`), or the read is rejected.
     */
    timeStepHours?: number;
}
export declare const defaultFileReaderConfig: Required<Omit<FileReaderConfig, 'cache' | 'derivationRules'>>;
/**
 * Convenience class for reading from OM-files implementing some utility conversions during reading.
 */
export declare class WeatherMapLayerFileReader {
    readonly cache: BlockCache;
    readonly config: Required<Omit<FileReaderConfig, 'cache'>>;
    /** Memoizes one backend per URL, so repeat reads skip the HEAD request. */
    private readonly backendPool;
    constructor(config?: FileReaderConfig);
    /**
     * Run `fn` with a reader scoped to `omUrl`. The reader is opened for this
     * call and disposed afterwards, so the class holds no file state: reads for
     * different files can never interleave on a shared reader. The backend pool
     * only memoizes per-URL HTTP metadata (no wasm resources), keeping repeat
     * opens cheap without reintroducing shared reader state.
     */
    private withReader;
    private getRanges;
    /**
     * The first rule claiming `variable` for this file, or undefined when the
     * variable is read as stored. Only rules whose pattern matches the name are
     * asked, so a file is not listed for names no rule is interested in. A
     * read through a rule needing the time step is rejected when the caller
     * passed none; a prefetch only needs the source names and goes ahead.
     */
    private resolveDerivation;
    /** Read variable data using a derivation rule. */
    private readWithDerivationRule;
    /**
     * Read a single variable directly (no derivation).
     */
    private readSimpleVariable;
    /**
     * Read a specific variable from the given .om file. Implements on the fly
     * conversion for some variables, e.g. uv components are converted to speed
     * and direction. Selecting the file and reading from it is a single atomic
     * step, so concurrent reads of different files cannot interleave.
     *
     * @param omUrl The .om file URL to read from.
     * @param variable The variable to read.
     * @param ranges The ranges to read. If null, all dimensions are read.
     * @param signal Optional AbortSignal
     * @param read What is known about the file beyond its URL (the time step)
     * @returns Promise resolving to data object containing values and optional directions
     */
    readVariable(omUrl: string, variable: string, ranges?: DimensionRange[] | null, signal?: AbortSignal, read?: ReadContext): Promise<Data>;
    /**
     * Prefetch data for a specific variable and range of the given .om file into
     * the local cache. This is useful for warming up the cache for anticipated
     * map movements or timestep changes.
     */
    prefetchVariable(omUrl: string, variable: string, ranges?: DimensionRange[] | null, signal?: AbortSignal): Promise<void>;
    /**
     * Warm the cache for the given .om file: opening the scoped reader fetches
     * the file header/trailer and root metadata into the block cache, so a later
     * read only pays for its data blocks. No variable data is requested.
     */
    warmFile(omUrl: string): Promise<void>;
    /** Drop all memoized backends, forcing fresh HEAD metadata requests. */
    clearBackends(): void;
}

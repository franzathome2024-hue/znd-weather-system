import { SeamlessLayerFilter } from './domain-helpers';
import { WeatherMapLayerFileReader } from './om-file-reader';
import { Bounds, Data, DataIdentityOptions, DimensionRange, Domain, GridData, OmProtocolInstance, OmProtocolSettings, OmUrlState, PostReadCallback } from './types';
/** Default max states that keep data loaded (see `OmProtocolSettings.maxStatesWithData`).
 *
 * This should be as low as possible, but needs to be at least the number of
 * variables that you want to display simultaneously. */
export declare const DEFAULT_MAX_STATES_WITH_DATA = 2;
export declare const getProtocolInstance: (settings: OmProtocolSettings) => OmProtocolInstance;
export declare const clearBlockCache: () => Promise<void>;
/** Drop all memoized HTTP backends, so the next read re-fetches file metadata. */
export declare const clearBackends: () => void;
export declare const getRanges: (gridData: GridData, bounds: Bounds | undefined) => DimensionRange[];
/** One concrete domain a request reads: the file URL it lives at and the state it is cached under. */
export interface RequestLayer {
    domain: Domain;
    omFileUrl: string;
    stateKey: string;
}
/**
 * The concrete domains a request is served from, finest-first, each under the
 * server path its file actually lives at. A plain domain is its own single
 * layer. A seamless composite only exists client-side: it resolves to the
 * sub-domains active for `filter`, with the composite's path segment swapped
 * for each one's, so a sub-domain's state is shared with plain requests for it.
 */
export declare const resolveLayers: (domain: Domain, omFileUrl: string, stateKey: string, domainOptions: Domain[], filter?: SeamlessLayerFilter) => RequestLayer[];
export declare const getOrCreateState: (stateByKey: Map<string, OmUrlState>, stateKey: string, dataOptions: DataIdentityOptions, omFileUrl: string, maxStatesWithData?: number) => OmUrlState;
/**
 * Ensures that data for a given state is loaded.
 * Handles multiple concurrent requests for the same data by sharing a promise.
 * Correctly handles AbortSignals by tracking all active subscribers and
 * only cancelling the underlying fetch if all subscribers have aborted.
 *
 * A read whose subscribers have all aborted is no longer joinable even while
 * its rejection is still in flight — the next caller starts a fresh one
 * instead of inheriting a cancellation it did not ask for.
 */
export declare const ensureData: (state: OmUrlState, omFileReader: WeatherMapLayerFileReader, postReadCallback: PostReadCallback, signal?: AbortSignal) => Promise<Data>;
/**
 * The value (and direction, for vector variables) at a point, sampled from the
 * loaded state of `omUrl` the way its tiles are rendered.
 *
 * `zoom` is the map zoom the point is looked at. A seamless composite only
 * renders the layers active at the tile's zoom, but a layer zoomed away from
 * can still have its state loaded; passing the zoom keeps the lookup to the
 * layers the pixels come from. Without it every layer with loaded data takes
 * part.
 */
export declare const getValueFromLatLong: (lat: number, lon: number, omUrl: string, zoom?: number) => Promise<{
    value: number;
    direction?: number;
}>;

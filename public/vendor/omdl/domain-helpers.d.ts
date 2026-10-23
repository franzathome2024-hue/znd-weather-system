import { Bounds, Domain, SeamlessDomain, SeamlessLayer } from './types';
export declare const isSeamlessDomain: (domain: Domain) => domain is SeamlessDomain;
/**
 * The concrete `Domain` whose `value` is `domainValue`; undefined when it is
 * missing from `domainOptions` or names a composite.
 */
export declare const resolveConcreteDomain: (domainValue: string, domainOptions: Domain[]) => Domain | undefined;
/**
 * The base layer of a composite: the last one, coarsest, with `minZoom: 0`. It
 * covers the composite's whole extent (global or regional), so it always takes
 * part in a request.
 */
export declare const getBaseLayer: (domain: SeamlessDomain) => SeamlessLayer;
/**
 * The `value` of the concrete domain that stands in for `domain` wherever a
 * single server path is needed (metadata, initial map position): a composite's
 * base layer, or the domain itself.
 */
export declare const getConcreteDomainValue: (domain: Domain) => string;
export interface SeamlessLayerFilter {
    /** Map zoom: layers whose `minZoom` lies above it are left out. */
    zoom?: number;
    /** Viewport: finer layers that do not overlap it are left out (the base layer always stays). */
    viewportBounds?: Bounds;
    /** Lead time of the requested timestep: layers past their `maxForecastHours` are left out. */
    leadTimeHours?: number;
}
export interface ActiveSeamlessLayer {
    layer: SeamlessLayer;
    domain: Domain;
}
/**
 * The layers of a composite that take part in a request, finest-first, each
 * with its concrete domain. This is the one place that decides which
 * sub-domains are active: the protocol loads exactly these, and consumers
 * (prefetching, border overlays) call it to stay in step. Layers whose domain
 * is not in `domainOptions` are skipped with a warning.
 */
export declare const selectSeamlessLayers: (seamless: SeamlessDomain, domainOptions: Domain[], { zoom, viewportBounds, leadTimeHours }?: SeamlessLayerFilter) => ActiveSeamlessLayer[];

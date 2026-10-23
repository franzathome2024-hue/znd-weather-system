import { Domain, ParsedUrlComponents } from '../types';
/**
 * Parses URL structure - this is always done internally.
 * Handles om:// prefix, query params, and tile coordinates.
 *
 * The URL structure is:
 * om://<baseUrl>?<params>/<z>/<x>/<y>  (tile request)
 * om://<baseUrl>?<params>              (tilejson request)
 * om://<baseUrl>/<z>/<x>/<y>           (tile request, no params)
 * om://<baseUrl>                       (tilejson request, no params)
 */
export declare const parseUrlComponents: (url: string) => ParsedUrlComponents;
/**
 * Swaps the domain segment of an om file or metadata URL, wherever the path
 * puts it. Seamless composites only exist client-side: the server serves the
 * concrete sub-domains, so every request for a composite is issued under a
 * concrete domain's path.
 */
export declare const replaceUrlDomain: (url: string, fromDomainValue: string, toDomainValue: string) => string;
/**
 * Lead time in hours (model run to valid time) of a data-spatial file URL, or
 * undefined for URLs without the run/valid-time path structure.
 */
export declare const parseLeadTimeHours: (url: string) => number | undefined;
/**
 * Length in hours of the time step ending at `validTime` in a run with these
 * valid times: the gap to the previous valid time, the first one taking the
 * gap to the next. This is the `delta_time_hours` a host puts on the om URL
 * for rules turning accumulations into rates. Undefined when `validTime` is
 * not a valid time of the run or the run has only one. The listed valid
 * times are not guaranteed to be in order.
 */
export declare const timeStepHoursAt: (validTime: Date, validTimes: (Date | string)[] | undefined) => number | undefined;
export declare const parseMetaJson: (omUrl: string, domainOptions?: Domain[]) => Promise<string>;
export declare const normalizeUrl: (url: string, domainOptions?: Domain[]) => Promise<string>;

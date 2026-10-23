export declare const DEFAULT_INTERVAL = 2;
export declare const VALID_TILE_SIZES: number[];
export declare const DEFAULT_TILE_SIZE = 512;
export declare const VALID_INTERPOLATIONS: readonly ["nearest", "linear", "cubic", "monotone"];
export declare const DEFAULT_INTERPOLATION = "linear";
export declare const VALID_ARROW_STYLES: readonly ["arrow", "barb"];
export declare const DEFAULT_ARROW_STYLE = "arrow";
export declare const DEFAULT_COLOR_BLEND = false;
export declare const VECTOR_TILE_EXTENT = 4096;
/**
 * Nominal on-screen width of a vector tile, and how many arrows or barbs the
 * geometry generators put across one. Together they give the on-screen size of
 * a lattice cell, which is the size the shape is drawn to fill: a legend
 * drawing the same shapes at the map's line weight matches by using it.
 */
export declare const TILE_PX = 512;
export declare const ARROW_LATTICE = 25;
export declare const BARB_LATTICE = 18;
export declare const DATA_RELEVANT_PARAMS: Set<string>;
export declare const OM_PREFIX_REGEX: RegExp;
export declare const TILE_SUFFIX_REGEX: RegExp;
export declare const TIME_SELECTED_REGEX: RegExp;
export declare const RESOLVE_DOMAIN_REGEX: RegExp;
export declare const DOMAIN_META_REGEX: RegExp;
export declare const RUN_AND_VALID_TIME_REGEX: RegExp;
export declare const TIME_STEP_REGEX: RegExp;
export declare const VARIABLE_PREFIX: RegExp;
export declare const LEVEL_REGEX: RegExp;
export declare const LEVEL_PREFIX: RegExp;
export declare const LEVEL_UNIT_REGEX: RegExp;

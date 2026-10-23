import { Data } from './types';
/**
 * What a derivation rule gets to see of the file it reads from.
 */
export interface DerivationContext {
    /** The requested variable name. */
    variable: string;
    /**
     * Names of the variables stored in the file. What a model stores differs
     * per domain and per time step: snowfall is stored by some models and
     * derivable from its water equivalent on others, wind comes as `u`/`v`
     * components or as speed and direction, and the first file of a run has no
     * accumulations yet.
     */
    stored: ReadonlySet<string>;
    /**
     * Length of the file's time step in hours, the period its accumulated
     * variables (precipitation sums) cover. Passed in by the reader's caller:
     * the om protocol passes on the `delta_time_hours` parameter of the om
     * URL, which the host application sets from the run's valid times for a
     * variable that needs it (`variableUsesTimeStep`). Undefined when the
     * caller passed none, which the reader rejects for such a variable.
     */
    timeStepHours?: number;
}
/**
 * Rule for deriving values and directions from the variables stored in a file.
 */
export interface VariableDerivationRule {
    /**
     * Matches the requested variable name: a string anywhere in the name, a
     * RegExp by search. Anchor it when the name is also the start of a stored
     * variable (`/^snowfall$/` next to `snowfall_water_equivalent`). Several
     * rules may match one name, each claiming it for different files; they
     * have to agree on `provides`, which is answered from the first match
     * before any file is open.
     */
    pattern: string | RegExp;
    /**
     * What reading a matched variable yields, known before any data is read:
     * `directions` makes it eligible for arrows, `barbs` additionally marks the
     * values as a wind speed (barbs encode knots), so other direction-carrying
     * quantities (waves, currents) always draw plain arrows.
     */
    provides: {
        directions: boolean;
        barbs: boolean;
    };
    /**
     * Whether the rule needs the file's time step (`context.timeStepHours`);
     * the reader's caller has to provide it for such a variable. Not needed
     * for the precipitation family, which the reader turns into hourly rates
     * itself after any rule (`variableIsAccumulated`).
     */
    usesTimeStep?: boolean;
    /**
     * Names of the variables in the file that the requested variable is read
     * from, in the order `process` expects them, or `null` when the rule does
     * not apply to this file: the next matching rule is asked, and when none
     * claims the name the variable is read as stored. The sources must share
     * their dimensions. A rule for a name that some models store checks
     * `stored` for the name itself, so the stored field wins.
     */
    getSourceVars: (context: DerivationContext) => string[] | null;
    /**
     * Quantization scale factor of the derived `values`, so a half-quantum
     * threshold offset can be applied. `'primary'` uses the first source
     * variable's stored scale factor; a number sets a fixed factor.
     */
    scaleFactor: number | 'primary';
    /**
     * Process the raw data from the source variables into values and directions.
     * Plain arrays are fine: where the reader uses SharedArrayBuffers, it moves
     * the output into one.
     * @param sources - Data per source variable, in `getSourceVars` order
     * @param context - The file the sources came from, as `getSourceVars` saw it
     * @returns Data object with values and optional directions
     */
    process: (sources: Float32Array[], context: DerivationContext) => Data;
}
/**
 * Whether a rule's pattern matches the name. `search` rather than `test` for
 * a RegExp: with the `g` or `y` flag `test` keeps its `lastIndex` between
 * calls, so the same rule would match only every other lookup.
 */
export declare const patternMatches: (pattern: string | RegExp, variable: string) => boolean;
/**
 * Whether reading `variable` yields a direction field, i.e. whether arrows
 * can be drawn for it. Answered from the first matching rule; a rule only
 * matching some files has to agree with the others on `provides`.
 */
export declare const variableHasDirections: (variable: string, rules?: VariableDerivationRule[]) => boolean;
/**
 * Whether `variable` is a wind speed with directions, i.e. whether wind barbs
 * (which encode speed in knots) are meaningful for it.
 */
export declare const variableSupportsBarbs: (variable: string, rules?: VariableDerivationRule[]) => boolean;
/** Whether the reader turns `variable` from a per-step sum into an hourly rate. */
export declare const variableIsAccumulated: (variable: string) => boolean;
/**
 * Whether reading `variable` needs the file's time step: an accumulated
 * variable, or a rule matching it that asks for the step (which rule claims
 * the name depends on the file, so a host sets the step whenever any
 * candidate asks for it).
 */
export declare const variableUsesTimeStep: (variable: string, rules?: VariableDerivationRule[]) => boolean;
/**
 * Whether `variable` can be read from a file storing the variables in
 * `stored`: as stored, or through a rule claiming it for that set. Lets a UI
 * offer the derived variables a domain's metadata does not list, by the same
 * decision the reader makes for the file.
 */
export declare const variableAvailable: (variable: string, stored: ReadonlySet<string>, rules?: VariableDerivationRule[]) => boolean;
/**
 * Default derivation rules for common meteorological variables. Spread into a
 * custom `fileReaderConfig.derivationRules` list to keep them alongside own
 * rules.
 */
export declare const defaultDerivationRules: VariableDerivationRule[];

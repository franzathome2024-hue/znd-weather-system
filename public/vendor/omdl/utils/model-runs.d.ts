import { ModelDt, ModelUpdateInterval } from '../types';
/**
 * Computes the next/previous/nearest time step for a model domain using UTC.
 * `timeInterval` must be one of:
 * - '15_minute', 'hourly', '3_hourly', '6_hourly', 'weekly_on_monday', 'monthly'
 *
 * @param time - source Date (not mutated)
 * @param timeInterval - the time step type (see above)
 * @param direction - 'forward' | 'backward' | 'nearest' (default 'nearest')
 * @returns a new Date adjusted to the requested domain step (UTC-based)
 * @throws Error on invalid timeInterval
 */
export declare const domainStep: (time: Date, timeInterval: ModelDt, direction?: "forward" | "backward" | "floor") => Date;
/**
 * Get the closest model run time rounded down to the model interval, in UTC.
 * Supported model intervals:
 * - 'hourly', '3_hourly', '6_hourly', '12_hourly', 'daily', 'monthly'
 */
export declare const closestModelRun: (time: Date, modelInterval: ModelUpdateInterval) => Date;

/**
 * Per-cell formulas behind the humidity-derived default derivation rules:
 * Magnus for the dew point, Stull (2011) for the wet-bulb temperature and
 * Steadman for the apparent temperature, following the Open-Meteo backend
 * (`Meteorology.swift`). Temperatures in °C, humidity in %, wind in m/s,
 * radiation in W/m².
 */
/** Dew point from air temperature and relative humidity, Magnus formula. */
export declare const dewPoint: (temperature: number, relativeHumidity: number) => number;
/**
 * Relative humidity from air temperature and dew point, the Magnus formula
 * inverted, clamped to 0–100 %.
 */
export declare const relativeHumidity: (temperature: number, dewPoint: number) => number;
/**
 * Vapour pressure deficit in kPa: saturation vapour pressure at the air
 * temperature minus the actual vapour pressure at the dew point (Tetens).
 * Clamped at zero, since a dew point above the air temperature is possible in
 * rounded model output.
 */
export declare const vapourPressureDeficit: (temperature: number, dewPoint: number) => number;
/**
 * Wet-bulb temperature from air temperature and relative humidity (Stull
 * 2011), capped at the air temperature where the fit overshoots near
 * saturation.
 */
export declare const wetBulbTemperature: (temperature: number, relativeHumidity: number) => number;
/**
 * Apparent temperature (Steadman): humidity warms, wind cools, and radiation
 * above 550 W/m² warms. The 10 m wind speed is scaled to the 2 m level a body
 * experiences.
 */
export declare const apparentTemperature: (temperature: number, relativeHumidity: number, windSpeed10m: number, shortwaveRadiation: number) => number;

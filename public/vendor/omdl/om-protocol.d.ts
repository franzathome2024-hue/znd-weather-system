import { GetResourceResponse, RequestParameters } from 'maplibre-gl';
import { OmProtocolSettings, TileJSON, TileResponse } from './types';
export declare const defaultOmProtocolSettings: OmProtocolSettings;
export declare const omProtocol: (params: RequestParameters, abortController: AbortController, settings?: OmProtocolSettings) => Promise<GetResourceResponse<TileJSON | TileResponse>>;

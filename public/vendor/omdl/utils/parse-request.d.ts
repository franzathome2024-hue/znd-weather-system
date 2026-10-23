import { ResolvedClippingOptions } from './clipping';
import { ClippingOptions, DataIdentityOptions, OmProtocolSettings, ParsedRequest, ParsedUrlComponents, RenderOptions } from '../types';
export declare const getCachedResolvedClipping: (options: ClippingOptions) => ResolvedClippingOptions | undefined;
export declare const parseRequest: (url: string, settings: OmProtocolSettings) => ParsedRequest;
export declare const defaultResolveRequest: (urlComponents: ParsedUrlComponents, settings: OmProtocolSettings) => {
    dataOptions: DataIdentityOptions;
    renderOptions: RenderOptions;
};

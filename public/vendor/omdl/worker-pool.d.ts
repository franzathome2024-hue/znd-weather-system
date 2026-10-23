import { TilePromise, TileRequest } from './types';
export declare class WorkerPool {
    private workers;
    private nextWorker;
    /** Stores pending tile requests by key to avoid duplicate requests for the same tile */
    private pendingRequests;
    constructor();
    private handleMessage;
    private handleError;
    getNextWorker(): Worker | undefined;
    requestTile(request: TileRequest): TilePromise;
}

import { DispatchEngine } from './trihex-bridge';
import { DispatchRequest, DispatchResponse } from './types';
export interface DispatchServiceConfig {
    resolution?: number;
    defaultRadiusCells?: number;
    defaultMaxCandidates?: number;
}
export declare class DispatchApiService {
    private engine;
    private config;
    constructor(engine: DispatchEngine, config?: DispatchServiceConfig);
    /**
     * Dispatches the top matching candidate drivers for a ride request
     */
    dispatch(request: DispatchRequest): Promise<DispatchResponse>;
}

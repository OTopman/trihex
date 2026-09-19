import { TelemetryPing } from './types';
export interface SimulatorConfig {
    cityId: string;
    driverCount: number;
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    outOfOrderRate?: number;
}
export declare class FleetSimulator {
    private drivers;
    private config;
    constructor(config: SimulatorConfig);
    private initFleet;
    /**
     * Advances the simulation by deltaSeconds and produces a batch of telemetry pings
     */
    tick(deltaSeconds?: number): TelemetryPing[];
    getDriverCount(): number;
}

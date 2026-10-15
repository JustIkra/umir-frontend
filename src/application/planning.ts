import type { Instant } from './api';

export interface PlanningWindow {
  readonly from: Instant;
  readonly to: Instant;
  readonly days: 7;
}

export interface HistoryCoverage {
  readonly epoch: string;
  readonly coverageFrom: Instant;
  readonly complete: boolean;
  readonly requestedFrom: Instant;
  readonly availableFrom: Instant;
}

export interface PlanningCapture {
  readonly evaluatedAt: Instant;
  readonly stateVersion: string;
  readonly window: PlanningWindow;
  readonly coverage: HistoryCoverage;
}

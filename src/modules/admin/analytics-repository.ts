import type { AdminAnalyticsOverview } from './analytics-types.js';

export interface AnalyticsRepository {
  getOverview(input: {
    readonly actorId: string;
    readonly requestId: string;
    readonly now: Date;
  }): Promise<AdminAnalyticsOverview>;
}

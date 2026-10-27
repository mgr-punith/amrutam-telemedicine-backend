import { ForbiddenError } from '../../common/errors/app-error.js';
import type { AuthenticatedPrincipal } from '../auth/auth-types.js';
import type { AnalyticsRepository } from './analytics-repository.js';

export class AnalyticsService {
  public constructor(private readonly repository: AnalyticsRepository) {}

  public async getOverview(principal: AuthenticatedPrincipal, requestId: string, now = new Date()) {
    if (principal.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can access aggregate analytics.');
    }
    return await this.repository.getOverview({ actorId: principal.userId, requestId, now });
  }
}

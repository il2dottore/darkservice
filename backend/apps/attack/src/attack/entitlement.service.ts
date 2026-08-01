import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js/driver';
import { methodsFeaturesTable } from '../entities/method.entity';
import { POSTGRES } from '@app/database/postgresql/postgresql.module';
import { maxBy, uniq } from 'lodash';

@Injectable()
export class EntitlementService {
  constructor(
    // Sorry, a bit dirty here, I will fix it later.
    @Inject(POSTGRES) private readonly attackDb: PostgresJsDatabase,
  ) {}

  // This function check whether user's plan has features required to use this method.
  async getMissingMethodFeatures(methodId: number, authorization: string) {
    // Grabs all required features to use `methodId`
    const required = await this.attackDb
      .select({ featureId: methodsFeaturesTable.featureId })
      .from(methodsFeaturesTable)
      .where(eq(methodsFeaturesTable.methodId, methodId));

    // Get all user features
    const response = await fetch(
      `${process.env.COMMON_SERVICE_URL ?? 'http://127.0.0.1:3000'}/api/v1/auth/me`,
      { headers: { authorization } },
    );
    if (!response.ok) throw new Error('Unable to verify user plan features');
    const profile = (await response.json()) as {
      plans?: { planFeatures?: { id: string }[] }[];
    };

    const ownedIds = new Set(
      profile.plans?.flatMap(
        (plan) => plan.planFeatures?.map(({ id }) => id) ?? [],
      ) ?? [],
    );

    // Filter required features that user doesn't have
    return required
      .map(({ featureId }) => featureId)
      .filter((id) => !ownedIds.has(id));
  }

  async getPlanLimits(authorization: string) {
    const response = await fetch(
      `${process.env.COMMON_SERVICE_URL ?? 'http://127.0.0.1:3000'}/api/v1/auth/me`,
      { headers: { authorization } },
    );
    if (!response.ok) throw new Error('Unable to verify user plan limits');

    const body = (await response.json()) as {
      data?: { plans?: { maxConcurrents: number; maxDuration: number }[] };
    };
    const plans = body.data?.plans ?? [];

    return {
      maxConcurrents: Math.max(
        0,
        maxBy(plans, ({ maxConcurrents }) => maxConcurrents)?.maxConcurrents ??
          0,
      ),
      maxDuration: Math.max(
        0,
        maxBy(plans, ({ maxDuration }) => maxDuration)?.maxDuration ?? 0,
      ),
    };
  }

  async getUserFeatureIds(authorization: string): Promise<string[]> {
    const response = await fetch(
      `${process.env.COMMON_SERVICE_URL ?? 'http://127.0.0.1:3000'}/api/v1/auth/me`,
      { headers: { authorization } },
    );
    if (!response.ok) throw new Error('Unable to verify user plan features');
    const profile = (await response.json()) as {
      plans?: { planFeatures?: { id: string }[] }[];
    };
    return uniq(
      profile.plans?.flatMap(
        (plan) => plan.planFeatures?.map(({ id }) => id) ?? [],
      ) ?? [],
    );
  }
}

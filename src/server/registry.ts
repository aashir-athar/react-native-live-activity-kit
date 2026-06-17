/**
 * In-memory reference implementation of {@link LiveActivityTokenRegistry}.
 *
 * Suitable for tests, single-process servers, and as a template for a real
 * database-backed store. It performs no I/O and resolves immediately.
 *
 * @packageDocumentation
 */

import type {
  LiveActivityTokenRegistry,
  PushToStartTokenRecord,
  ActivityTokenRecord,
} from './types';

/**
 * A process-local, non-persistent {@link LiveActivityTokenRegistry}.
 *
 * @remarks
 * Data is lost on restart and is **not** shared across instances. For
 * production, implement {@link LiveActivityTokenRegistry} against your database
 * (the method shapes are intentionally trivial to map to upsert/delete queries).
 */
export class InMemoryTokenRegistry implements LiveActivityTokenRegistry {
  /** attributesType → push-to-start record. */
  private readonly pushToStart = new Map<string, PushToStartTokenRecord>();
  /** activityId → per-activity update token record. */
  private readonly activity = new Map<string, ActivityTokenRecord>();

  async storePushToStartToken(record: PushToStartTokenRecord): Promise<void> {
    this.pushToStart.set(record.attributesType, {
      ...record,
      updatedAt: record.updatedAt || Date.now(),
    });
  }

  async getPushToStartToken(
    attributesType: string
  ): Promise<PushToStartTokenRecord | undefined> {
    return this.pushToStart.get(attributesType);
  }

  async invalidatePushToStartToken(attributesType: string): Promise<void> {
    this.pushToStart.delete(attributesType);
  }

  async storeActivityToken(record: ActivityTokenRecord): Promise<void> {
    this.activity.set(record.activityId, {
      ...record,
      updatedAt: record.updatedAt || Date.now(),
    });
  }

  async getActivityToken(
    activityId: string
  ): Promise<ActivityTokenRecord | undefined> {
    return this.activity.get(activityId);
  }

  async rotateActivityToken(activityId: string, token: string): Promise<void> {
    const existing = this.activity.get(activityId);
    this.activity.set(activityId, {
      activityId,
      token,
      attributesType: existing?.attributesType,
      updatedAt: Date.now(),
    });
  }

  async invalidateActivityToken(activityId: string): Promise<void> {
    this.activity.delete(activityId);
  }

  async listActivityTokens(): Promise<ActivityTokenRecord[]> {
    return Array.from(this.activity.values());
  }
}

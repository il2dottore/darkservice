import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { notInArray } from 'drizzle-orm';
import { attackEntity } from '../entities/attack.entity';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { RABBITMQ_ATTACK_QUEUE } from '@app/rabbitmq';
import { Attack } from '../entities/attack.entity';
import { AttackRepository } from './attack.repository';
import { CreateAttackDto } from './dtos/create-attack.dto';
import { UpdateAttackDto } from './dtos/update-attack.dto';
import { MethodRepository } from '../method/method.repository';
import { ServerRepository } from '../server/server.repository';
import { ServerService } from '../server/server.service';
import { RedisService } from '@app/redis/redis.service';
import { AttackGateway } from './attack.gateway';
import { EntitlementService } from './entitlement.service';

const DASHBOARD_STATISTICS_CACHE_KEY = 'dashboard:statistics';
const DASHBOARD_STATISTICS_CACHE_TTL_SECONDS = 15;

type DashboardStatistics = {
  totalBenchmarks: number;
  totalBenchmarksRunning: number;
  totalServers: number;
  totalServersOnline: number;
  overview: Array<{ date: string; attacks: number }>;
};

@Injectable()
export class AttackService {
  constructor(
    private readonly attackRepository: AttackRepository,
    private readonly methodRepository: MethodRepository,
    private readonly serverRepository: ServerRepository,
    private readonly serverService: ServerService,
    private readonly redis: RedisService,
    private readonly attackGateway: AttackGateway,
    private readonly entitlementService: EntitlementService,
    @Inject(RABBITMQ_ATTACK_QUEUE) private readonly attackClient: ClientProxy,
  ) {}

  async getAll(userId: string): Promise<Attack[]> {
    return await this.attackRepository.find({ userId });
  }

  // For dashboard homepage.
  async getStatistics(): Promise<DashboardStatistics> {
    const cached = await this.redis.getJson<DashboardStatistics>(
      DASHBOARD_STATISTICS_CACHE_KEY,
    );
    if (cached) return cached;

    const [attacks, servers, statuses] = await Promise.all([
      this.attackRepository.find(),
      this.serverService.getAll(),
      this.serverService.getStatuses(),
    ]);
    const timeZone = process.env.APP_TIMEZONE ?? 'Asia/Bangkok';
    const toDateKey = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(
        parts.map(({ type, value }) => [type, value]),
      );
      return `${values.year}-${values.month}-${values.day}`;
    };
    const daily = new Map<string, number>();
    const today = new Date();
    const todayKey = toDateKey(today);
    const calendarDate = new Date(`${todayKey}T00:00:00Z`);
    for (let offset = 29; offset >= 0; offset -= 1) {
      const date = new Date(calendarDate);
      date.setDate(date.getDate() - offset);
      daily.set(date.toISOString().slice(0, 10), 0);
    }
    for (const attack of attacks) {
      const key = toDateKey(new Date(attack.createdAt));
      if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
    }
    const statistics = {
      totalBenchmarks: attacks.length,
      totalBenchmarksRunning: attacks.filter(
        ({ status }) => status === 'RUNNING',
      ).length,
      totalServers: servers.length,
      totalServersOnline: statuses.filter(({ online }) => online).length,
      overview: Array.from(daily, ([date, attacks]) => ({ date, attacks })),
    };

    await this.redis.setJson(
      DASHBOARD_STATISTICS_CACHE_KEY,
      statistics,
      DASHBOARD_STATISTICS_CACHE_TTL_SECONDS,
    );
    return statistics;
  }

  async getById(id: number): Promise<Attack | null> {
    return await this.attackRepository.findOne({ id });
  }

  async clearHistory() {
    return this.attackRepository.deleteWhere(
      notInArray(attackEntity.status, ['QUEUED', 'SCHEDULED', 'RUNNING']),
    );
  }

  /**
   * VERY
   *
   * IMPORTANT
   *
   * FUNCTION
   *
   * QUEUE ATTACK → ROUTER → WORKER → EXECUTE
   */
  async create(
    createAttackDto: CreateAttackDto,
    authorization: string,
  ): Promise<Attack> {
    const limits = await this.entitlementService.getPlanLimits(authorization);
    if (
      limits.maxDuration > 0 &&
      createAttackDto.duration > limits.maxDuration
    ) {
      throw new ForbiddenException(
        `Attack duration exceeds your plan limit of your plan: ${limits.maxDuration} seconds`,
      );
    }

    const activeCount = await this.attackRepository.count({
      userId: createAttackDto.userId,
      status: 'RUNNING',
    });
    const queuedCount = await this.attackRepository.count({
      userId: createAttackDto.userId,
      status: 'QUEUED',
    });
    const scheduledCount = await this.attackRepository.count({
      userId: createAttackDto.userId,
      status: 'SCHEDULED',
    });

    if (
      limits.maxConcurrents > 0 &&
      activeCount + queuedCount + scheduledCount >= limits.maxConcurrents
    ) {
      throw new ForbiddenException(
        `You have reached your concurrent attack limit of your plan: ${limits.maxConcurrents} concurrents`,
      );
    }

    // Ensures that the user has a specific feature to use this method.
    if (createAttackDto.methodId) {
      const missing = await this.entitlementService.getMissingMethodFeatures(
        createAttackDto.methodId,
        authorization,
      );
      if (missing.length) {
        throw new ForbiddenException({
          message: 'Missing required plan features',
          missingFeatures: missing,
        });
      }
    }

    // Get all user feature(s)
    const featureIds =
      await this.entitlementService.getUserFeatureIds(authorization);
    // Ensures that the user has a server(s) for running attacks.
    const allowedServers =
      await this.serverService.getAllowedServers(featureIds);
    if (!allowedServers.length) {
      throw new ForbiddenException('No servers available for your plan');
    }

    // All attack credentials are inserted, except serverId because the flow hasn't reached `node-router` yet.
    // The default status is `QUEUED`, so the job can be re-queued if node-router fails to pick it up.
    const attack = await this.attackRepository.insertOne(createAttackDto);

    // Reserve slot on Redis to prevent double processing
    const reservation = await this.reserveSlot(
      attack.serverId,
      attack.duration,
      attack.id,
    );
    if (!reservation) {
      await this.attackRepository.updateOne(
        { id: attack.id },
        {
          status: 'REJECTED',
          failureReason: 'No available server slot',
        },
      );
      throw new ConflictException('No available server slot');
    }

    // Get method details
    const method = attack.methodId
      ? await this.methodRepository.findOne({ id: attack.methodId })
      : null;

    // Emit event to node-router.
    await firstValueFrom(
      this.attackClient.emit('attack.fired', {
        ...attack,
        allowedServers,
        method: method?.name,
        layer: method?.osiLayer,
        slotKey: reservation,
      }),
    );
    return attack;
  }

  // Lock slot on Redis to prevent double processing.
  private async reserveSlot(
    serverId: number | null,
    duration: number,
    attackId: number,
  ) {
    if (!serverId) return 'unassigned';
    const server = await this.serverRepository.findOne({ id: serverId });
    if (!server) return null;
    const ttl = Math.max(1, duration) + 60;
    for (let slot = 0; slot < server.slots; slot++) {
      const key = `attack:server:${server.id}:slot:${slot}`;
      const acquired = await this.redis.raw.set(
        key,
        String(attackId),
        'EX',
        ttl,
        'NX',
      );
      if (acquired === 'OK') return key;
    }
    return null;
  }

  // Update status and if user manually cancels attack, emit event to node-router to cancel the attack.
  async update(
    id: number,
    updateAttackDto: UpdateAttackDto,
  ): Promise<Attack | null> {
    // This is just a ORM operation, so please don't overthinking. :)
    const attack = await this.attackRepository.updateOne(
      { id },
      updateAttackDto,
    );

    // After doing that `normal ORM operation`, we wrote a specific logic for attack cancellation.
    // The `node-router` should stop the attack if it receives the cancel event.
    if (attack && updateAttackDto.status === 'CANCELLED') {
      await firstValueFrom(this.attackClient.emit('attack.cancel', { id }));
    }
    if (attack) this.attackGateway.emitStatus(attack);
    return attack;
  }

  // Update status and if slot key is provided, release the slot.
  async updateStatus(
    id: number,
    status: UpdateAttackDto['status'],
    failureReason?: string,
    slotKey?: string,
    serverId?: number,
  ) {
    const result = await this.attackRepository.updateOne(
      { id },
      {
        status,
        serverId: serverId || undefined,
        failureReason,
        startedAt: status === 'RUNNING' ? new Date() : undefined,
        finishedAt: [
          'COMPLETED',
          'FAILED',
          'REJECTED',
          'TIMEOUT',
          'CANCELLED',
        ].includes(status!)
          ? new Date()
          : undefined,
      },
    );
    if (
      slotKey &&
      ['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'TIMEOUT'].includes(
        status!,
      )
    ) {
      const owner = await this.redis.raw.get(slotKey);
      if (owner === String(id)) await this.redis.raw.del(slotKey);
    }
    if (result) this.attackGateway.emitStatus(result);
    return result;
  }

  async delete(id: number): Promise<Attack | null> {
    return await this.attackRepository.deleteOne({ id });
  }
}

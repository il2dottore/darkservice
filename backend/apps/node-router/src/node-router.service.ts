import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { RABBITMQ_ATTACK_STATUS_QUEUE } from '@app/rabbitmq';
import type { AttackEvent } from './node-router.controller';

interface AttackNode {
  url: string;
  maxSlots: number;
  active: number;
  cpu: number;
  memory: number;
}

type HealthyNode = Omit<AttackNode, 'maxSlots'>;

interface NodeHealthResponse {
  active?: number;
  cpu?: number;
  memory?: number;
}

@Injectable()
export class NodeRouterService {
  private readonly logger = new Logger(NodeRouterService.name);
  private readonly assigned = new Map<number, string>();
  private readonly httpTimeoutMs = 2_000;

  constructor(
    @Inject(RABBITMQ_ATTACK_STATUS_QUEUE)
    private readonly statusClient: ClientProxy,
  ) {}

  async dispatch(event: AttackEvent): Promise<void> {
    const allowedNodes = event.allowedServers
      .filter(({ address }) => Boolean(address))
      .map((server) => ({
        url: this.createNodeUrl(server.address),
        maxSlots: server.slots,
        serverId: server.id,
      }));

    this.logger.log(
      `Attack ${event.id} checking ${allowedNodes.length} attack node(s)`,
    );

    const checks = await Promise.all(
      allowedNodes.map(async (node) => {
        const health = await this.checkHealth(event.id, node.url);
        if (!health) return { node: null, full: false };
        if (health.active >= node.maxSlots) return { node: null, full: true };

        return {
          node: {
            ...health,
            maxSlots: node.maxSlots,
            serverId: node.serverId,
          },
          full: false,
        };
      }),
    );
    const healthyNodes = checks
      .map(({ node }) => node)
      .filter(
        (node): node is AttackNode & { serverId: number } => node !== null,
      );

    if (healthyNodes.length === 0) {
      if (allowedNodes.length > 0 && checks.every(({ full }) => full)) {
        throw new OverloadedError();
      }
      throw new NoNodesError();
    }

    healthyNodes.sort((left, right) => left.active - right.active);
    const selected = healthyNodes[0];
    this.logger.log(
      `Attack ${event.id} selected node ${selected.url} (active=${selected.active})`,
    );

    this.assigned.set(event.id, selected.url);
    try {
      const response = await fetch(`${selected.url}/attacks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...event, serverId: selected.serverId }),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      await response.text();
      if (!response.ok) {
        throw new NodeResponseError(response.status);
      }
      this.logger.log(
        `Attack ${event.id} accepted by node (${response.status})`,
      );
    } catch (error) {
      this.assigned.delete(event.id);
      throw error;
    }
  }

  async cancel(attackId: number): Promise<void> {
    const url = this.assigned.get(attackId);
    this.assigned.delete(attackId);
    if (!url) return;

    try {
      const response = await fetch(`${url}/attacks/${attackId}/stop`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      await response.text();
      if (!response.ok) {
        this.logger.warn(
          `Attack ${attackId} stop failed: HTTP ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Attack ${attackId} stop failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async publishFailure(event: AttackEvent, reason: string): Promise<void> {
    this.logger.error(`Attack ${event.id}: ${reason}`);
    try {
      await firstValueFrom(
        this.statusClient.emit('attack.updateStatus', {
          id: event.id,
          status: 'FAILED',
          failureReason: `Failed to dispatch attack: ${reason}`,
          slotKey: event.slotKey,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not publish failure for attack ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createNodeUrl(address: string): string {
    const protocol = process.env.ATTACK_NODE_PROTOCOL ?? 'http';
    const port = process.env.ATTACK_NODE_PORT ?? '2005';
    return `${protocol}://${address}:${port}`;
  }

  private async checkHealth(
    attackId: number,
    url: string,
  ): Promise<HealthyNode | null> {
    this.logger.debug(`Attack ${attackId} health check: ${url}`);
    try {
      const response = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      if (!response.ok) {
        await response.text();
        this.logger.warn(`Attack ${attackId} unhealthy node: ${url}`);
        return null;
      }

      const health = (await response.json()) as NodeHealthResponse;
      if (typeof health.active !== 'number') {
        this.logger.warn(`Attack ${attackId} invalid health response: ${url}`);
        return null;
      }

      const node = {
        url,
        active: health.active,
        cpu: health.cpu ?? 0,
        memory: health.memory ?? 0,
      };
      this.logger.debug(
        `Attack ${attackId} healthy node: ${url} active=${node.active} cpu=${node.cpu}% memory=${node.memory}%`,
      );
      return node;
    } catch (error) {
      this.logger.warn(
        `Attack ${attackId} node unavailable: ${url} (${error instanceof Error ? error.message : String(error)})`,
      );
      return null;
    }
  }
}

export class NoNodesError extends Error {
  constructor() {
    super('No healthy attack nodes');
    this.name = NoNodesError.name;
  }
}

export class OverloadedError extends Error {
  constructor() {
    super('System is overloaded, all servers are currently full');
    this.name = OverloadedError.name;
  }
}

class NodeResponseError extends Error {
  constructor(status: number) {
    super(`Node rejected request: HTTP ${status}`);
    this.name = NodeResponseError.name;
  }
}

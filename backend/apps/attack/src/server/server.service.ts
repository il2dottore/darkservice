import { Injectable } from '@nestjs/common';
import { CreateServerDto } from './dtos/create-server.dto';
import { UpdateServerDto } from './dtos/update-server.dto';
import { ServerRepository } from './server.repository';
import { Server } from '../entities/server.entity';
import { RedisService } from '@app/redis/redis.service';
import { compact, groupBy, uniqBy } from 'lodash';

@Injectable()
export class ServerService {
  constructor(
    private readonly serverRepository: ServerRepository,
    private readonly redis: RedisService,
  ) {}

  async getStatuses() {
    const servers = await this.getAll();
    return Promise.all(
      servers.map(async (server) => {
        const key = `server:status:${server.id}`;
        const cached = await this.redis.getJson<{
          online: boolean;
          cpu: number;
          memory: number;
          active: number;
        }>(key);
        if (cached) return { id: server.id, ...cached };

        let online = false;
        let cpu = 0;
        let memory = 0;
        let active = 0;
        try {
          const response = await fetch(
            `${process.env.ATTACK_NODE_PROTOCOL ?? 'http'}://${server.address}:${process.env.ATTACK_NODE_PORT ?? '2005'}/health`,
            { signal: AbortSignal.timeout(3000) },
          );
          online = response.ok;
          if (online) {
            const health = (await response.json()) as {
              cpu?: number;
              memory?: number;
              active?: number;
            };
            cpu = health.cpu ?? 0;
            memory = health.memory ?? 0;
            active = health.active ?? 0;
          }
        } catch {
          /* node is offline */
        }
        await this.redis.setJson(key, { online, cpu, memory, active }, 15);
        return {
          id: server.id,
          online,
          cpu,
          memory,
          active,
          maxSlots: server.slots,
        };
      }),
    );
  }

  // This function query all usable servers inside networks based on feature IDs.
  async getAllowedServers(featureIds: string[]) {
    return this.serverRepository.queryAllowedServers(featureIds);
  }

  private mapServerWithNetworks(
    rows: Awaited<ReturnType<ServerRepository['queryServerInfo']>>,
  ) {
    const firstRow = rows[0];
    if (!firstRow) {
      return null;
    }

    const networks = uniqBy(compact(rows.map((row) => row.networks)), 'id');

    return {
      ...firstRow.servers,
      networks,
    };
  }

  async getAll(): Promise<Server[]> {
    return await this.serverRepository.find();
  }

  async getAllDetails() {
    const rows = await this.serverRepository.queryServersInfo();
    const grouped = groupBy(rows, (row) => row.servers.id);
    const firstRows = uniqBy(rows, (row) => row.servers.id);

    return compact(
      firstRows.map(({ servers }) =>
        this.mapServerWithNetworks(grouped[servers.id]),
      ),
    );
  }

  async getById(id: number) {
    return await this.serverRepository.queryServerInfo(id);
  }

  async getDetailsById(id: number) {
    const rows = await this.serverRepository.queryServerInfo(id);
    return this.mapServerWithNetworks(rows);
  }

  async create(createServerDto: CreateServerDto): Promise<Server> {
    return await this.serverRepository.insertOne(createServerDto);
  }

  async update(
    id: number,
    updateServerDto: UpdateServerDto,
  ): Promise<Server | null> {
    return await this.serverRepository.updateOne({ id }, updateServerDto);
  }

  async delete(id: number): Promise<Server | null> {
    return await this.serverRepository.deleteOne({ id });
  }
}

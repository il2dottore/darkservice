import { Injectable } from '@nestjs/common';
import { AssignNetworkServerDto } from './dtos/assign-network-server.dto';
import { CreateNetworkDto } from './dtos/create-network.dto';
import { UpdateNetworkDto } from './dtos/update-network.dto';
import { Network } from '../entities/network.entity';
import { NetworkRepository } from './network.repository';
import { compact, uniqBy } from 'lodash';

@Injectable()
export class NetworkService {
  constructor(private readonly networkRepository: NetworkRepository) {}

  async getAll(): Promise<Network[]> {
    return await this.networkRepository.find();
  }

  async getById(id: number) {
    const rows = await this.networkRepository.queryNetworkInfo(id);
    const network = rows[0]?.networks ?? null;
    const servers = uniqBy(compact(rows.map(({ servers }) => servers)), 'id');

    return { network, servers };
  }

  async create(createNetworkDto: CreateNetworkDto): Promise<Network> {
    return await this.networkRepository.insertOne(createNetworkDto);
  }

  async update(
    id: number,
    updateNetworkDto: UpdateNetworkDto,
  ): Promise<Network | null> {
    return await this.networkRepository.updateOne({ id }, updateNetworkDto);
  }

  async delete(id: number): Promise<Network | null> {
    return await this.networkRepository.deleteOne({ id });
  }

  async assignServer(
    id: number,
    assignNetworkServerDto: AssignNetworkServerDto,
  ) {
    return await this.networkRepository.assignServer(
      id,
      assignNetworkServerDto.serverId,
    );
  }

  async removeServer(id: number, serverId: number) {
    return await this.networkRepository.removeServer(id, serverId);
  }

  async getFeatures(id: number) {
    return this.networkRepository.queryNetworkFeatures(id);
  }
  async getAllowedServers(featureIds: string[]) {
    return this.networkRepository.queryAllowedServers(featureIds);
  }
  async assignFeature(id: number, featureId: string) {
    return this.networkRepository.assignFeature(id, featureId);
  }
  async removeFeature(id: number, featureId: string) {
    return this.networkRepository.removeFeature(id, featureId);
  }
}

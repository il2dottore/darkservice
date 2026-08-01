import { Injectable } from '@nestjs/common';
import { AssignPlanFeatureDto } from './dtos/assign-plan-feature.dto';
import { CreatePlanDto } from './dtos/create-plan.dto';
import { UpdatePlanDto } from './dtos/update-plan.dto';
import { PlanRepository } from './plan.repository';
import { Plan } from '../entities/plan.entity';
import { compact, groupBy } from 'lodash';

@Injectable()
export class PlanService {
  constructor(private readonly planRepository: PlanRepository) {}

  async getAll(): Promise<Plan[]> {
    return await this.planRepository.find();
  }

  async getById(id: number) {
    return await this.planRepository.queryPlanInfo(id);
  }

  async batch(ids: number[]) {
    const rows = await this.planRepository.queryPlansInfo(ids);
    const grouped = groupBy(rows, ({ plans }) => plans.id);
    return compact(
      ids.map((id) => {
        const planRows = grouped[id];
        if (!planRows?.length) return null;

        return {
          plan: planRows[0].plans,
          features: compact(planRows.map(({ features }) => features)),
        };
      }),
    );
  }

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    return await this.planRepository.insertOne(createPlanDto);
  }

  async update(id: number, updatePlanDto: UpdatePlanDto): Promise<Plan | null> {
    return await this.planRepository.updateOne({ id }, updatePlanDto);
  }

  async delete(id: number): Promise<Plan | null> {
    return await this.planRepository.deleteOne({ id });
  }

  async assignFeature(id: number, assignPlanFeatureDto: AssignPlanFeatureDto) {
    return await this.planRepository.assignFeature(
      id,
      assignPlanFeatureDto.featureId,
    );
  }

  async removeFeature(id: number, featureId: string) {
    return await this.planRepository.removeFeature(id, featureId);
  }
}

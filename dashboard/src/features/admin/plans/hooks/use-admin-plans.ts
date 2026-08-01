import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  assignFeatureToPlan,
  createFeature,
  createPlan,
  deleteFeature,
  deletePlan,
  fetchFeatures,
  fetchPlanById,
  fetchPlans,
  removeFeatureFromPlan,
  updateFeature,
  updatePlan,
} from '@/services/admin/plans/plan.service'
import { compact, uniqBy } from 'lodash-es'

/* ───── Plans ───── */

const plansKey = ['admin', 'plans'] as const

export function usePlans() {
  return useQuery({
    queryKey: [...plansKey, 'list'],
    queryFn: fetchPlans,
  })
}

export function usePlanById(id: number | null) {
  return useQuery({
    queryKey: [...plansKey, 'detail', id],
    queryFn: () => fetchPlanById(id!),
    enabled: id !== null,
    select: (data) => {
      const features = compact(data.map((row) => row.features))
      return { plan: data[0]?.plans ?? null, features: uniqBy(features, 'id') }
    },
  })
}

export function useCreatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; price: number; maxDuration: number; maxConcurrents: number; isCustom: boolean }) => createPlan(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey }),
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; price?: number; maxDuration?: number; maxConcurrents?: number; isCustom?: boolean } }) =>
      updatePlan(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey }),
  })
}

export function useDeletePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deletePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: plansKey }),
  })
}

/* ───── Plan-Feature assignments ───── */

export function useAssignFeatureToPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, featureId }: { planId: number; featureId: string }) =>
      assignFeatureToPlan(planId, featureId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: [...plansKey, 'detail', vars.planId] }),
  })
}

export function useRemoveFeatureFromPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, featureId }: { planId: number; featureId: string }) =>
      removeFeatureFromPlan(planId, featureId),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: [...plansKey, 'detail', vars.planId] }),
  })
}

/* ───── Features ───── */

const featuresKey = ['admin', 'features'] as const

export function useFeatures() {
  return useQuery({
    queryKey: featuresKey,
    queryFn: fetchFeatures,
  })
}

export function useCreateFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => createFeature(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: featuresKey }),
  })
}

export function useUpdateFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { id?: string; name?: string } }) =>
      updateFeature(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: featuresKey }),
  })
}

export function useDeleteFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteFeature(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: featuresKey }),
  })
}

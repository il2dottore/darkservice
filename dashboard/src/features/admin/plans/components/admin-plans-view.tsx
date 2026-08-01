import { useState } from 'react'
import type { Plan } from '@/services/admin/plans/types'
import { differenceBy } from 'lodash-es'
import { Loader2, Package, Pencil, Plus, Trash2, X } from 'lucide-react'
import { handleServerError } from '@/lib/handle-server-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  useAssignFeatureToPlan,
  useCreateFeature,
  useCreatePlan,
  useDeleteFeature,
  useDeletePlan,
  useFeatures,
  usePlanById,
  usePlans,
  useRemoveFeatureFromPlan,
  useUpdateFeature,
  useUpdatePlan,
} from '../hooks/use-admin-plans'
import { UserPlansManager } from './user-plans-manager'

export function AdminPlans() {
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)

  /* ── queries ── */
  const { data: plans, isLoading: plansLoading } = usePlans()
  const { data: planDetail, isLoading: detailLoading } =
    usePlanById(selectedPlanId)
  const { data: allFeatures, isLoading: featuresLoading } = useFeatures()

  /* ── plan mutations ── */
  const createPlan = useCreatePlan()
  const updatePlan = useUpdatePlan()
  const deletePlan = useDeletePlan()
  const assignFeature = useAssignFeatureToPlan()
  const removeFeature = useRemoveFeatureFromPlan()

  /* ── feature mutations ── */
  const createFeature = useCreateFeature()
  const updateFeature = useUpdateFeature()
  const deleteFeature = useDeleteFeature()

  /* ── dialogs ── */
  const [addPlanOpen, setAddPlanOpen] = useState(false)
  const [addPlanForm, setAddPlanForm] = useState({
    name: '',
    price: '',
    maxDuration: '',
    maxConcurrents: '',
    isCustom: false,
  })

  const [editPlanOpen, setEditPlanOpen] = useState(false)
  const [editPlanTarget, setEditPlanTarget] = useState<Plan | null>(null)
  const [editPlanForm, setEditPlanForm] = useState({
    name: '',
    price: '',
    maxDuration: '',
    maxConcurrents: '',
    isCustom: false,
  })

  const [deletePlanOpen, setDeletePlanOpen] = useState(false)
  const [deletePlanTarget, setDeletePlanTarget] = useState<Plan | null>(null)

  const [addFeatureToPlan, setAddFeatureToPlan] = useState('')

  const [featureDialogOpen, setFeatureDialogOpen] = useState(false)
  const [featureDialogMode, setFeatureDialogMode] = useState<'add' | 'edit'>(
    'add'
  )
  const [featureForm, setFeatureForm] = useState({ id: '', name: '' })
  const [featureEditOldId, setFeatureEditOldId] = useState('')

  const [deleteFeatureOpen, setDeleteFeatureOpen] = useState(false)
  const [deleteFeatureTarget, setDeleteFeatureTarget] = useState('')

  /* ── helpers ── */
  const assignedFeatures = planDetail?.features ?? []
  const availableFeatures = differenceBy(
    allFeatures ?? [],
    assignedFeatures,
    'id'
  )

  /* ── handlers ── */
  function resetAddPlanForm() {
    setAddPlanForm({
      name: '',
      price: '',
      maxDuration: '',
      maxConcurrents: '',
      isCustom: false,
    })
  }

  function handleAddPlan() {
    const { name, price, maxDuration, maxConcurrents, isCustom } = addPlanForm
    if (!name.trim() || !price || !maxDuration || !maxConcurrents) return
    createPlan.mutate(
      {
        name: name.trim(),
        price: Number(price),
        maxDuration: Number(maxDuration),
        maxConcurrents: Number(maxConcurrents),
        isCustom,
      },
      {
        onSuccess: () => {
          setAddPlanOpen(false)
          resetAddPlanForm()
        },
        onError: handleServerError,
      }
    )
  }

  function openEditPlan(plan: Plan) {
    setEditPlanTarget(plan)
    setEditPlanForm({
      name: plan.name,
      price: String(plan.price),
      maxDuration: String(plan.maxDuration),
      maxConcurrents: String(plan.maxConcurrents),
      isCustom: plan.isCustom,
    })
    setEditPlanOpen(true)
  }

  function handleEditPlan() {
    if (!editPlanTarget) return
    const { name, price, maxDuration, maxConcurrents, isCustom } = editPlanForm
    if (!name.trim() || !price || !maxDuration || !maxConcurrents) return
    updatePlan.mutate(
      {
        id: editPlanTarget.id,
        data: {
          name: name.trim(),
          price: Number(price),
          maxDuration: Number(maxDuration),
          maxConcurrents: Number(maxConcurrents),
          isCustom,
        },
      },
      {
        onSuccess: () => setEditPlanOpen(false),
        onError: handleServerError,
      }
    )
  }

  function openDeletePlan(plan: Plan) {
    setDeletePlanTarget(plan)
    setDeletePlanOpen(true)
  }

  function handleDeletePlan() {
    if (!deletePlanTarget) return
    deletePlan.mutate(deletePlanTarget.id, {
      onSuccess: () => {
        if (selectedPlanId === deletePlanTarget.id) setSelectedPlanId(null)
        setDeletePlanOpen(false)
      },
      onError: handleServerError,
    })
  }

  function handleAssignFeature() {
    if (!selectedPlanId || !addFeatureToPlan) return
    assignFeature.mutate(
      { planId: selectedPlanId, featureId: addFeatureToPlan },
      {
        onSuccess: () => setAddFeatureToPlan(''),
        onError: handleServerError,
      }
    )
  }

  function handleRemoveFeature(featureId: string) {
    if (!selectedPlanId) return
    removeFeature.mutate(
      { planId: selectedPlanId, featureId },
      { onError: handleServerError }
    )
  }

  function openAddFeature() {
    setFeatureDialogMode('add')
    setFeatureForm({ id: '', name: '' })
    setFeatureEditOldId('')
    setFeatureDialogOpen(true)
  }

  function openEditFeature(id: string, name: string) {
    setFeatureDialogMode('edit')
    setFeatureForm({ id, name })
    setFeatureEditOldId(id)
    setFeatureDialogOpen(true)
  }

  function handleSaveFeature() {
    if (!featureForm.id.trim() || !featureForm.name.trim()) return
    if (featureDialogMode === 'add') {
      createFeature.mutate(
        { id: featureForm.id.trim(), name: featureForm.name.trim() },
        {
          onSuccess: () => {
            setFeatureDialogOpen(false)
          },
          onError: handleServerError,
        }
      )
    } else {
      updateFeature.mutate(
        {
          id: featureEditOldId,
          data: { id: featureForm.id.trim(), name: featureForm.name.trim() },
        },
        {
          onSuccess: () => {
            setFeatureDialogOpen(false)
          },
          onError: handleServerError,
        }
      )
    }
  }

  function openDeleteFeature(id: string) {
    setDeleteFeatureTarget(id)
    setDeleteFeatureOpen(true)
  }

  function handleDeleteFeature() {
    if (!deleteFeatureTarget) return
    deleteFeature.mutate(deleteFeatureTarget, {
      onSuccess: () => setDeleteFeatureOpen(false),
      onError: handleServerError,
    })
  }

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <UserPlansManager />
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Admin Plans</h2>
            <p className='text-muted-foreground'>
              Manage plans and their feature assignments.
            </p>
          </div>
          <Button
            onClick={() => {
              resetAddPlanForm()
              setAddPlanOpen(true)
            }}
          >
            <Plus className='me-1 size-4' />
            Add plan
          </Button>
        </div>

        <div className='grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]'>
          {/* ── Plans sidebar ── */}
          <Card className='gap-0 overflow-hidden'>
            <CardHeader className='border-b bg-muted/30'>
              <CardTitle>Plans</CardTitle>
              <CardDescription>
                {plans?.length ?? 0} plan{plans?.length !== 1 ? 's' : ''} total
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-2 pt-4'>
              {plansLoading ? (
                <div className='flex justify-center py-8'>
                  <Loader2 className='size-5 animate-spin text-muted-foreground' />
                </div>
              ) : !plans?.length ? (
                <p className='py-4 text-center text-sm text-muted-foreground'>
                  No plans yet
                </p>
              ) : (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      selectedPlanId === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/40'
                    }`}
                    onClick={() => setSelectedPlanId(plan.id)}
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium'>
                        {plan.name}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        ${plan.price} &middot; {plan.maxDuration}d &middot;{' '}
                        {plan.maxConcurrents} concurrent
                      </p>
                    </div>
                    <div
                      className='flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100'
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-7'
                        onClick={() => openEditPlan(plan)}
                      >
                        <Pencil className='size-3.5' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-7 text-destructive'
                        onClick={() => openDeletePlan(plan)}
                      >
                        <Trash2 className='size-3.5' />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* ── Right: plan detail + feature management ── */}
          <div className='grid gap-4'>
            {/* Plan features */}
            <Card className='gap-0 overflow-hidden'>
              <CardHeader className='border-b bg-muted/30'>
                <div className='flex items-start gap-3'>
                  <div className='flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                    <Package className='size-5' />
                  </div>
                  <div className='min-w-0 flex-1 space-y-1'>
                    <CardTitle className='truncate'>
                      {planDetail?.plan?.name ?? 'Select a plan'}
                    </CardTitle>
                    <CardDescription>
                      {selectedPlanId
                        ? `${assignedFeatures.length} feature${assignedFeatures.length !== 1 ? 's' : ''} assigned`
                        : 'Pick a plan from the sidebar to manage its features'}
                    </CardDescription>
                  </div>
                  {planDetail?.plan && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => openEditPlan(planDetail.plan)}
                    >
                      <Pencil className='me-1 size-3.5' />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className='space-y-4 pt-6'>
                {detailLoading ? (
                  <div className='flex justify-center py-8'>
                    <Loader2 className='size-5 animate-spin text-muted-foreground' />
                  </div>
                ) : !selectedPlanId ? (
                  <p className='py-4 text-center text-sm text-muted-foreground'>
                    No plan selected
                  </p>
                ) : (
                  <>
                    {/* Plan info */}
                    {planDetail?.plan && (
                      <div className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-4'>
                        <div className='rounded-lg border p-3'>
                          <p className='text-xs text-muted-foreground'>Price</p>
                          <p className='font-semibold'>
                            ${planDetail.plan.price}
                          </p>
                        </div>
                        <div className='rounded-lg border p-3'>
                          <p className='text-xs text-muted-foreground'>
                            Max Duration
                          </p>
                          <p className='font-semibold'>
                            {planDetail.plan.maxDuration}d
                          </p>
                        </div>
                        <div className='rounded-lg border p-3'>
                          <p className='text-xs text-muted-foreground'>
                            Max Concurrent
                          </p>
                          <p className='font-semibold'>
                            {planDetail.plan.maxConcurrents}
                          </p>
                        </div>
                        <div className='rounded-lg border p-3'>
                          <p className='text-xs text-muted-foreground'>
                            Custom
                          </p>
                          <p className='font-semibold'>
                            {planDetail.plan.isCustom ? 'Yes' : 'No'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Assigned features */}
                    {assignedFeatures.length > 0 ? (
                      <div className='flex flex-wrap gap-2'>
                        {assignedFeatures.map((feat) => (
                          <Badge
                            key={feat.id}
                            variant='outline'
                            className='gap-1.5 py-1.5 ps-3 pe-2'
                          >
                            <span className='font-medium'>{feat.name}</span>
                            <span className='text-xs text-muted-foreground'>
                              ({feat.id})
                            </span>
                            <button
                              type='button'
                              className='ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                              onClick={() => handleRemoveFeature(feat.id)}
                            >
                              <X className='size-3' />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-muted-foreground'>
                        No features assigned to this plan.
                      </p>
                    )}

                    {/* Add feature to plan */}
                    <div className='flex items-end gap-2'>
                      <div className='flex-1 space-y-1.5'>
                        <Label htmlFor='add-feature'>Add feature</Label>
                        <Select
                          value={addFeatureToPlan}
                          onValueChange={setAddFeatureToPlan}
                        >
                          <SelectTrigger
                            id='add-feature'
                            disabled={!availableFeatures.length}
                          >
                            <SelectValue
                              placeholder={
                                availableFeatures.length
                                  ? 'Select feature...'
                                  : 'No available features'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFeatures.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name} ({f.id})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={handleAssignFeature}
                        disabled={!addFeatureToPlan || assignFeature.isPending}
                      >
                        <Plus className='me-1 size-4' />
                        Assign
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── All features management ── */}
            <Card className='gap-0 overflow-hidden'>
              <CardHeader className='border-b bg-muted/30'>
                <div className='flex items-start gap-3'>
                  <div className='flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                    <Package className='size-5' />
                  </div>
                  <div className='flex-1 space-y-1'>
                    <CardTitle>All Features</CardTitle>
                    <CardDescription>
                      {allFeatures?.length ?? 0} feature
                      {allFeatures?.length !== 1 ? 's' : ''} defined
                    </CardDescription>
                  </div>
                  <Button size='sm' onClick={openAddFeature}>
                    <Plus className='me-1 size-3.5' />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='pt-6'>
                {featuresLoading ? (
                  <div className='flex justify-center py-8'>
                    <Loader2 className='size-5 animate-spin text-muted-foreground' />
                  </div>
                ) : !allFeatures?.length ? (
                  <p className='py-4 text-center text-sm text-muted-foreground'>
                    No features defined yet
                  </p>
                ) : (
                  <div className='flex flex-wrap gap-2'>
                    {allFeatures.map((feat) => (
                      <Badge
                        key={feat.id}
                        variant='secondary'
                        className='gap-1.5 py-1.5 ps-3 pe-2'
                      >
                        <span className='font-medium'>{feat.name}</span>
                        <span className='text-xs text-muted-foreground'>
                          ({feat.id})
                        </span>
                        <button
                          type='button'
                          className='rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground'
                          onClick={() => openEditFeature(feat.id, feat.name)}
                        >
                          <Pencil className='size-3' />
                        </button>
                        <button
                          type='button'
                          className='rounded-full p-0.5 text-muted-foreground transition-colors hover:text-destructive'
                          onClick={() => openDeleteFeature(feat.id)}
                        >
                          <Trash2 className='size-3' />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>

      {/* ── Add plan dialog ── */}
      <Dialog
        open={addPlanOpen}
        onOpenChange={(open) => {
          if (!open) setAddPlanOpen(false)
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Add Plan</DialogTitle>
            <DialogDescription>Create a new pricing plan.</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='add-plan-name'>Name</Label>
              <Input
                id='add-plan-name'
                value={addPlanForm.name}
                onChange={(e) =>
                  setAddPlanForm({ ...addPlanForm, name: e.target.value })
                }
                placeholder='e.g. Premium'
              />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='add-plan-price'>Price ($)</Label>
                <Input
                  id='add-plan-price'
                  type='number'
                  min={0}
                  value={addPlanForm.price}
                  onChange={(e) =>
                    setAddPlanForm({ ...addPlanForm, price: e.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='add-plan-duration'>Max Duration (days)</Label>
                <Input
                  id='add-plan-duration'
                  type='number'
                  min={1}
                  value={addPlanForm.maxDuration}
                  onChange={(e) =>
                    setAddPlanForm({
                      ...addPlanForm,
                      maxDuration: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='add-plan-concurrents'>Max Concurrent</Label>
                <Input
                  id='add-plan-concurrents'
                  type='number'
                  min={1}
                  value={addPlanForm.maxConcurrents}
                  onChange={(e) =>
                    setAddPlanForm({
                      ...addPlanForm,
                      maxConcurrents: e.target.value,
                    })
                  }
                />
              </div>
              <div className='flex items-end pb-2'>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='add-plan-custom'
                    checked={addPlanForm.isCustom}
                    onCheckedChange={(v) =>
                      setAddPlanForm({ ...addPlanForm, isCustom: v })
                    }
                  />
                  <Label htmlFor='add-plan-custom'>Custom plan</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setAddPlanOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPlan}
              disabled={
                createPlan.isPending ||
                !addPlanForm.name.trim() ||
                !addPlanForm.price ||
                !addPlanForm.maxDuration ||
                !addPlanForm.maxConcurrents
              }
            >
              {createPlan.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit plan dialog ── */}
      <Dialog
        open={editPlanOpen}
        onOpenChange={(open) => {
          if (!open) setEditPlanOpen(false)
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Edit Plan</DialogTitle>
            <DialogDescription>Update plan details.</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='edit-plan-name'>Name</Label>
              <Input
                id='edit-plan-name'
                value={editPlanForm.name}
                onChange={(e) =>
                  setEditPlanForm({ ...editPlanForm, name: e.target.value })
                }
              />
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='edit-plan-price'>Price ($)</Label>
                <Input
                  id='edit-plan-price'
                  type='number'
                  min={0}
                  value={editPlanForm.price}
                  onChange={(e) =>
                    setEditPlanForm({ ...editPlanForm, price: e.target.value })
                  }
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='edit-plan-duration'>Max Duration (days)</Label>
                <Input
                  id='edit-plan-duration'
                  type='number'
                  min={1}
                  value={editPlanForm.maxDuration}
                  onChange={(e) =>
                    setEditPlanForm({
                      ...editPlanForm,
                      maxDuration: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-2'>
                <Label htmlFor='edit-plan-concurrents'>Max Concurrent</Label>
                <Input
                  id='edit-plan-concurrents'
                  type='number'
                  min={1}
                  value={editPlanForm.maxConcurrents}
                  onChange={(e) =>
                    setEditPlanForm({
                      ...editPlanForm,
                      maxConcurrents: e.target.value,
                    })
                  }
                />
              </div>
              <div className='flex items-end pb-2'>
                <div className='flex items-center gap-2'>
                  <Switch
                    id='edit-plan-custom'
                    checked={editPlanForm.isCustom}
                    onCheckedChange={(v) =>
                      setEditPlanForm({ ...editPlanForm, isCustom: v })
                    }
                  />
                  <Label htmlFor='edit-plan-custom'>Custom plan</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditPlanOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditPlan}
              disabled={
                updatePlan.isPending ||
                !editPlanForm.name.trim() ||
                !editPlanForm.price ||
                !editPlanForm.maxDuration ||
                !editPlanForm.maxConcurrents
              }
            >
              {updatePlan.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete plan dialog ── */}
      <Dialog
        open={deletePlanOpen}
        onOpenChange={(open) => {
          if (!open) setDeletePlanOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deletePlanTarget?.name}</strong>{' '}
              and its feature assignments. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setDeletePlanOpen(false)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeletePlan}
              disabled={deletePlan.isPending}
            >
              {deletePlan.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit feature dialog ── */}
      <Dialog
        open={featureDialogOpen}
        onOpenChange={(open) => {
          if (!open) setFeatureDialogOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {featureDialogMode === 'add' ? 'Add Feature' : 'Edit Feature'}
            </DialogTitle>
            <DialogDescription>
              {featureDialogMode === 'add'
                ? 'Create a new feature with a unique ID and display name.'
                : 'Update the feature identifier and display name.'}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='feature-id'>Feature ID</Label>
              <Input
                id='feature-id'
                value={featureForm.id}
                onChange={(e) =>
                  setFeatureForm({ ...featureForm, id: e.target.value })
                }
                placeholder='e.g. API_ACCESS'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='feature-name'>Display Name</Label>
              <Input
                id='feature-name'
                value={featureForm.name}
                onChange={(e) =>
                  setFeatureForm({ ...featureForm, name: e.target.value })
                }
                placeholder='e.g. API Access'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveFeature()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setFeatureDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveFeature}
              disabled={
                (featureDialogMode === 'add' ? createFeature : updateFeature)
                  .isPending ||
                !featureForm.id.trim() ||
                !featureForm.name.trim()
              }
            >
              {(featureDialogMode === 'add' ? createFeature : updateFeature)
                .isPending
                ? 'Saving...'
                : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete feature dialog ── */}
      <Dialog
        open={deleteFeatureOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteFeatureOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feature</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deleteFeatureTarget}</strong>{' '}
              and unassigns it from all plans. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteFeatureOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDeleteFeature}
              disabled={deleteFeature.isPending}
            >
              {deleteFeature.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

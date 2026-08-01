import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchFeatures } from '@/services/admin/plans/plan.service'
import { assignFeature, createMethod, deleteMethod, fetchMethods, removeFeature, updateMethod } from '@/services/admin/methods/method.service'
import { differenceBy } from 'lodash-es'

const key = ['admin', 'methods']
export function AdminMethods() {
  const qc = useQueryClient()
  const { data: methods = [] } = useQuery({ queryKey: key, queryFn: fetchMethods })
  const { data: features = [] } = useQuery({ queryKey: ['admin', 'features'], queryFn: fetchFeatures })
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', osiLayer: 'LAYER_4' as 'LAYER_4' | 'LAYER_7' })
  const [featureId, setFeatureId] = useState('')
  const invalidate = () => qc.invalidateQueries({ queryKey: key })
  const save = useMutation({ mutationFn: () => selected ? updateMethod(selected, form) : createMethod(form), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: deleteMethod, onSuccess: () => { setSelected(null); invalidate() } })
  const addFeature = useMutation({ mutationFn: () => assignFeature(selected!, featureId), onSuccess: () => { setFeatureId(''); invalidate() } })
  const dropFeature = useMutation({ mutationFn: (id: string) => removeFeature(selected!, id), onSuccess: invalidate })
  const method = methods.find((item) => item.id === selected)
  const featureName = (id: string) => features.find((feature) => feature.id === id)?.name ?? id
  const available = differenceBy(features, method?.features ?? [], 'id')
  return <>
    <Header fixed><Search className='me-auto' /><ThemeSwitch /><ConfigDrawer /><ProfileDropdown /></Header>
    <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
    <div className='flex flex-wrap items-end justify-between gap-2'><div><h2 className='text-2xl font-bold tracking-tight'>Admin Methods</h2><p className='text-muted-foreground'>Manage attack methods and their required plan features.</p></div><Button onClick={() => { setSelected(null); setForm({ name: '', osiLayer: 'LAYER_4' }) }}><Plus className='me-1 size-4' />Add method</Button></div>
    <div className='grid gap-4 lg:grid-cols-[280px_1fr]'>
      <Card><CardHeader><CardTitle className='text-base'>Methods</CardTitle></CardHeader><CardContent className='space-y-2'>
        {methods.map((item) => <Button key={item.id} variant={selected === item.id ? 'secondary' : 'ghost'} className='w-full justify-start' onClick={() => { setSelected(item.id); setForm({ name: item.name, osiLayer: item.osiLayer }) }}>{item.name}</Button>)}
        <Button variant='outline' className='w-full' onClick={() => { setSelected(null); setForm({ name: '', osiLayer: 'LAYER_4' }) }}><Plus className='mr-2 size-4' />New method</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className='text-base'>{selected ? 'Edit method' : 'New method'}</CardTitle></CardHeader><CardContent className='space-y-4'>
        <div className='grid gap-2'><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className='grid gap-2'><Label>OSI layer</Label><Select value={form.osiLayer} onValueChange={(value: 'LAYER_4' | 'LAYER_7') => setForm({ ...form, osiLayer: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='LAYER_4'>Layer 4</SelectItem><SelectItem value='LAYER_7'>Layer 7</SelectItem></SelectContent></Select></div>
        <div className='flex gap-2'><Button disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>{selected ? 'Save' : 'Create'}</Button>{selected && <Button variant='destructive' onClick={() => remove.mutate(selected)}><Trash2 className='mr-2 size-4' />Delete</Button>}</div>
        {selected && <div className='space-y-3 border-t pt-4'><div className='font-medium'>Required features</div><div className='flex gap-2'><Select value={featureId} onValueChange={setFeatureId}><SelectTrigger className='flex-1'><SelectValue placeholder='Select feature' /></SelectTrigger><SelectContent>{available.map((feature) => <SelectItem key={feature.id} value={feature.id}>{feature.name}</SelectItem>)}</SelectContent></Select><Button disabled={!featureId} onClick={() => addFeature.mutate()}>Add</Button></div><div className='flex flex-wrap gap-2'>{method?.features.map((feature) => <span key={feature.id} className='inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs'>{featureName(feature.id)}<button onClick={() => dropFeature.mutate(feature.id)}><X className='size-3' /></button></span>)}</div></div>}
      </CardContent></Card>
    </div>
    </Main>
  </>
}

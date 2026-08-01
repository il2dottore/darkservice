import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAdminUsers } from '@/services/admin/users/user.service'
import {
  clearAttackHistory,
  fetchAttacks,
  stopAttack,
  type Attack,
} from '@/services/attack/attack.service'
import { keyBy, mapValues } from 'lodash-es'
import { ChevronLeft, ChevronRight, Square } from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'

type Server = { id: number; name?: string; address?: string }
const activeStatuses = ['QUEUED', 'SCHEDULED', 'RUNNING']

export function AdminAttacks() {
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const attacks = useQuery({
    queryKey: ['admin', 'attacks'],
    queryFn: fetchAttacks,
    refetchInterval: 5000,
  })
  const servers = useQuery({
    queryKey: ['admin', 'attack-servers'],
    queryFn: async () => (await api.get<Server[]>('/servers')).data,
  })
  const users = useQuery({
    queryKey: ['admin', 'attack-users'],
    queryFn: () => fetchAdminUsers(1000, 1),
  })
  const stop = useMutation({
    mutationFn: stopAttack,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'attacks'] }),
  })
  const clearHistory = useMutation({
    mutationFn: clearAttackHistory,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['admin', 'attacks'] }),
  })
  const userName = keyBy(users.data?.map(({ user }) => user) ?? [], 'id')
  const serverName = mapValues(
    keyBy(servers.data ?? [], 'id'),
    (server) =>
      `${server.name ?? `Server #${server.id}`} · ${server.address ?? 'IP unavailable'}`
  )
  const sorted = useMemo(
    () =>
      [...(attacks.data ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [attacks.data]
  )
  const totalPages = Math.max(1, Math.ceil(sorted.length / 10))
  const currentPage = Math.min(page, totalPages)
  const visible = sorted.slice((currentPage - 1) * 10, currentPage * 10)

  return (
    <>
      <Header fixed />
      <Main className='flex flex-1 flex-col gap-6'>
        <div>
          <div className='flex items-center justify-between gap-4'>
            <h2 className='text-2xl font-bold'>Attacks</h2>
            <Button
              variant='destructive'
              disabled={clearHistory.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Clear all attack history except active attacks?'
                  )
                )
                  clearHistory.mutate()
              }}
            >
              Clear attack history
            </Button>
          </div>
          <p className='text-muted-foreground'>
            Monitor and stop attacks across the system.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All attacks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <div className='min-w-245'>
                <div className='grid grid-cols-[70px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_100px_150px_90px] gap-2 border-b px-3 pb-2 text-xs font-medium text-muted-foreground'>
                  <span>ID</span>
                  <span>Target</span>
                  <span>User</span>
                  <span>Server</span>
                  <span>Duration</span>
                  <span>Status / Created</span>
                  <span>Action</span>
                </div>
                <div className='divide-y'>
                  {visible.map((attack: Attack) => (
                    <div
                      key={attack.id}
                      className='grid grid-cols-[70px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_100px_150px_90px] items-center gap-2 px-3 py-3 text-xs'
                    >
                      <span>#{attack.id}</span>
                      <span className='truncate' title={attack.target}>
                        {attack.target}
                      </span>
                      <span className='truncate'>
                        {userName[attack.userId ?? '']?.username ??
                          attack.userId ??
                          'Unknown'}
                      </span>
                      <span className='truncate'>
                        {serverName[attack.serverId ?? -1] ?? 'Unknown'}
                      </span>
                      <span>{attack.duration}s</span>
                      <span className='space-y-1'>
                        <span className='block w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold'>
                          {attack.status}
                        </span>
                        <span className='block text-muted-foreground'>
                          {new Date(attack.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <Button
                        variant='destructive'
                        size='sm'
                        className='h-7 px-2 text-[10px]'
                        disabled={
                          !activeStatuses.includes(attack.status) ||
                          stop.isPending
                        }
                        onClick={() => stop.mutate(attack.id)}
                      >
                        <Square className='mr-1 size-3 fill-current' />
                        Stop
                      </Button>
                    </div>
                  ))}
                  {!visible.length && (
                    <div className='px-3 py-6 text-xs text-muted-foreground'>
                      No attacks found.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className='flex items-center justify-between border-t pt-3 text-xs text-muted-foreground'>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <div className='flex gap-1'>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-7'
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft className='size-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  className='size-7'
                  disabled={currentPage === totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight className='size-4' />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

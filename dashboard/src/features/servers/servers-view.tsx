import { useQuery } from '@tanstack/react-query'
import {
  fetchNetworkById,
  fetchNetworkFeatures,
  fetchNetworks,
} from '@/services/admin/networks/network.service'
import { fetchServerStatuses } from '@/services/admin/networks/server-status.service'
import { fetchFeatures } from '@/services/admin/plans/plan.service'
import { useAuthStore } from '@/store/auth.store'
import { keyBy } from 'lodash-es'
import { Server as ServerIcon } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { useProfile } from '@/features/auth/hooks/auth-hooks'

export function Servers() {
  const { auth } = useAuthStore()
  const { data: profile } = useProfile(auth.accessToken)
  const networksQuery = useQuery({
    queryKey: ['servers', 'networks'],
    queryFn: fetchNetworks,
  })
  const { data: features = [] } = useQuery({
    queryKey: ['servers', 'features'],
    queryFn: fetchFeatures,
  })
  const statusQuery = useQuery({
    queryKey: ['servers', 'status'],
    queryFn: fetchServerStatuses,
    refetchInterval: 15000,
  })
  const statusDetails = keyBy(statusQuery.data ?? [], 'id')
  const detailsQuery = useQuery({
    queryKey: ['servers', 'details', networksQuery.data?.map(({ id }) => id)],
    enabled: Boolean(networksQuery.data),
    queryFn: async () =>
      Promise.all(
        (networksQuery.data ?? []).map(async (network) => {
          try {
            const [detail, requiredFeatures] = await Promise.all([
              fetchNetworkById(network.id),
              fetchNetworkFeatures(network.id),
            ])
            return {
              network,
              servers: detail.servers,
              requiredFeatures,
              offline: false,
            }
          } catch {
            return { network, servers: [], requiredFeatures: [], offline: true }
          }
        })
      ),
  })
  const available = new Set(
    profile?.plans?.flatMap(
      (plan) => plan.planFeatures?.map(({ id }) => id) ?? []
    ) ?? []
  )
  const featureName = (id: string) =>
    features.find((feature) => feature.id === id)?.name ?? id

  return (
    <>
      <Header fixed>
        <div className='ms-auto flex items-center gap-2'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='flex flex-1 flex-col gap-4 p-4'>
        <div>
          <h1 className='text-2xl font-semibold'>Servers</h1>
          <p className='text-sm text-muted-foreground'>
            Networks and servers available to your account.
          </p>
        </div>
        {networksQuery.isError && (
          <p className='rounded-md border border-destructive/40 p-4 text-sm text-destructive'>
            Unable to load networks. All servers are offline.
          </p>
        )}
        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
          {detailsQuery.data?.map(
            ({ network, servers, requiredFeatures, offline }) => {
              const accessible = !requiredFeatures.some(
                ({ featureId }) => !available.has(featureId)
              )
              return (
                <section
                  key={network.id}
                  className={`rounded-lg border bg-card p-4 shadow-sm ${!accessible ? 'opacity-50' : ''}`}
                >
                  <div className='mb-3 flex items-center justify-between'>
                    <div>
                      <h2 className='font-medium'>{network.name}</h2>
                      <p className='text-xs text-muted-foreground'>
                        {requiredFeatures.length
                          ? `Requires: ${requiredFeatures.map(({ featureId }) => featureName(featureId)).join(', ')}`
                          : 'Public network'}
                      </p>
                    </div>
                    <span className='text-xs'>
                      {accessible ? 'Available' : 'Restricted'}
                    </span>
                  </div>
                  <div className='space-y-2'>
                    {offline ? (
                      <p className='text-sm text-muted-foreground'>Offline</p>
                    ) : (
                      servers.map((server) => (
                        <div
                          key={server.id}
                          className='flex items-center gap-3 rounded-md border p-2 text-sm'
                        >
                          <ServerIcon className='size-4 text-muted-foreground' />
                          <div className='min-w-0'>
                            <p className='truncate'>{server.name}</p>
                            <p className='text-xs text-muted-foreground'>
                              {server.address} · {server.slots} slots
                            </p>
                            <div className='mt-2 w-52 space-y-1.5'>
                              {(['cpu', 'memory'] as const).map((metric) => {
                                const value = Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    statusDetails[server.id]?.[metric] ?? 0
                                  )
                                )
                                return (
                                  <div
                                    key={metric}
                                    className='flex items-center gap-2 text-[10px] text-muted-foreground'
                                  >
                                    <span className='w-10 uppercase'>
                                      {metric === 'memory' ? 'Mem' : 'CPU'}
                                    </span>
                                    <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted'>
                                      <div
                                        className='h-full rounded-full bg-primary'
                                        style={{ width: `${value}%` }}
                                      />
                                    </div>
                                    <span className='w-8 text-right'>
                                      {value}%
                                    </span>
                                  </div>
                                )
                              })}
                              <div className='flex items-center gap-2 text-[10px] text-muted-foreground'>
                                <span className='w-10'>Slots</span>
                                <div className='flex flex-1 gap-px'>
                                  {Array.from(
                                    { length: server.slots },
                                    (_, index) => (
                                      <span
                                        key={index}
                                        className={`h-2 flex-1 rounded-sm ${index < (statusDetails[server.id]?.active ?? 0) ? 'bg-primary' : 'bg-muted'}`}
                                      />
                                    )
                                  )}
                                </div>
                                <span className='w-8 text-right'>
                                  {statusDetails[server.id]?.active ?? 0}/
                                  {server.slots}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span
                            className={`ml-auto text-xs ${statusDetails[server.id]?.online ? 'text-emerald-600' : 'text-muted-foreground'}`}
                          >
                            {statusDetails[server.id]?.online
                              ? 'Online'
                              : 'Offline'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )
            }
          )}
        </div>
      </Main>
    </>
  )
}

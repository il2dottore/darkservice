import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fetchPlans } from '@/services/admin/plans/plan.service'
import { createPayment } from '@/services/payment/payment.service'
import { useAuthStore } from '@/store/auth.store'
import { max } from 'lodash-es'
import { Check, CreditCard, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function Plans() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.auth.user)
  const currentPlans = user?.plans ?? []
  const currentPrice = Math.max(
    0,
    max(currentPlans.map((plan) => plan.price)) ?? 0
  )
  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans', 'list'],
    queryFn: fetchPlans,
  })
  const payment = useMutation({
    mutationFn: ({ planId, amount }: { planId: number; amount: number }) =>
      createPayment(planId, amount),
    onSuccess: (result) => {
      navigate({
        to: '/payment/$paymentId',
        params: { paymentId: result.id },
        search: {
          qr: result.qrCodeUrl,
          amount: result.amount,
          code: result.transactionCode,
        },
      })
    },
    onError: (error: unknown) =>
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? 'Unable to create payment'
      ),
  })

  return (
    <>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ProfileDropdown />
      </Header>
      <Main className='flex flex-1 flex-col gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Plans</h2>
          <p className='text-muted-foreground'>
            Choose a plan that fits your needs.
          </p>
        </div>
        {isLoading ? (
          <div className='flex justify-center py-12'>
            <Loader2 className='size-6 animate-spin text-muted-foreground' />
          </div>
        ) : (
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {plans?.map((plan) => (
              <Card key={plan.id} className='flex flex-col'>
                <CardHeader>
                  <div className='flex items-center justify-between gap-2'>
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.isCustom && <Badge variant='secondary'>Custom</Badge>}
                  </div>
                  <CardDescription>
                    Access plan for your account
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex-1 space-y-4'>
                  <div className='flex items-baseline gap-1'>
                    <span className='text-3xl font-bold'>${plan.price}</span>
                    <span className='text-sm text-muted-foreground'>
                      / plan
                    </span>
                  </div>
                  <div className='space-y-2 text-sm text-muted-foreground'>
                    <p className='flex gap-2'>
                      <Check className='size-4 text-primary' /> Maximum
                      duration: {plan.maxDuration} minutes
                    </p>
                    <p className='flex gap-2'>
                      <Check className='size-4 text-primary' /> Maximum
                      concurrent: {plan.maxConcurrents}
                    </p>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className='w-full'
                    disabled={
                      plan.price <= 0 ||
                      payment.isPending ||
                      plan.price < currentPrice
                    }
                    onClick={() =>
                      payment.mutate({ planId: plan.id, amount: plan.price })
                    }
                  >
                    <CreditCard className='me-2 size-4' /> Purchase plan
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </Main>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchPlans } from '@/services/admin/plans/plan.service'
import { cancelPayment } from '@/services/payment/payment.service'
import { connectSocket } from '@/services/realtime/socket-endpoint'
import { toast } from 'sonner'
import { api } from '@/lib/axios'
import { appConfig } from '@/constants/config'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authenticated/payment/$paymentId')({
  validateSearch: (search: Record<string, unknown>) => ({
    qr: String(search.qr ?? ''),
    amount: Number(search.amount ?? 0),
    code: String(search.code ?? ''),
  }),
  component: PaymentPage,
})

function PaymentPage() {
  const { paymentId } = Route.useParams()
  const search = Route.useSearch()
  const client = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => cancelPayment(paymentId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['payment', paymentId] }),
  })
  const [remaining, setRemaining] = useState(0)
  const query = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => (await api.get(`/payments/${paymentId}`)).data,
  })
  const plans = useQuery({ queryKey: ['plans', 'list'], queryFn: fetchPlans })
  const payment = query.data
  const plan = plans.data?.find((item) => item.id === payment?.planId)
  useEffect(() => {
    const socket = connectSocket(appConfig.paymentSocketUrl, {
      transports: ['polling'],
    })
    socket.on('connect', () => socket.emit('payment.join', paymentId))
    socket.on(
      'payment.status',
      ({
        paymentId: eventPaymentId,
        status,
      }: {
        paymentId: string
        status: string
      }) => {
        if (eventPaymentId === paymentId && status === 'paid')
          client.invalidateQueries({ queryKey: ['payment', paymentId] })
      }
    )
    return () => {
      socket.disconnect()
    }
  }, [client, paymentId])
  const previousStatus = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (previousStatus.current === 'pending' && payment?.status === 'paid') {
      toast.success('Payment successful', {
        description: 'Your plan has been activated successfully.',
      })
    }
    previousStatus.current = payment?.status
  }, [payment?.status])
  useEffect(() => {
    if (!payment?.createdAt || payment.status !== 'pending') {
      setRemaining(0)
      return
    }
    const update = () =>
      setRemaining(
        Math.max(
          0,
          Math.ceil(
            (new Date(payment.createdAt).getTime() +
              15 * 60 * 1000 -
              Date.now()) /
              1000
          )
        )
      )
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [payment?.createdAt])
  return (
    <main className='mx-auto w-full max-w-5xl p-8'>
      <h1 className='text-2xl font-bold'>
        {payment?.status === 'paid'
          ? 'Payment successful'
          : payment?.status === 'cancelled'
            ? 'Payment cancelled'
            : 'Complete payment'}
      </h1>
      <div className='grid gap-6 md:grid-cols-2'>
        <section className='rounded-lg border p-6'>
          <h2 className='mb-4 text-lg font-semibold'>Payment information</h2>
          <div className='divide-y text-sm'>
            <p className='flex justify-between py-3'>
              <span className='text-muted-foreground'>Order code</span>
              <span className='font-mono'>
                {payment?.transactionCode ?? search.code}
              </span>
            </p>
            <p className='flex justify-between py-3'>
              <span className='text-muted-foreground'>Plan</span>
              <span>
                {plan?.name ??
                  (payment?.planId ? `Plan #${payment.planId}` : 'loading')}
              </span>
            </p>
            {plan && (
              <>
                <p className='flex justify-between py-3'>
                  <span className='text-muted-foreground'>Duration</span>
                  <span>{plan.maxDuration} minutes</span>
                </p>
                <p className='flex justify-between py-3'>
                  <span className='text-muted-foreground'>
                    Concurrent limit
                  </span>
                  <span>{plan.maxConcurrents}</span>
                </p>
              </>
            )}
            <p className='flex justify-between py-3'>
              <span className='text-muted-foreground'>Amount</span>
              <span>{payment?.amount ?? search.amount}</span>
            </p>
            <p className='flex justify-between py-3'>
              <span className='text-muted-foreground'>Status</span>
              <span className='capitalize'>{payment?.status ?? 'loading'}</span>
            </p>
            {payment?.createdAt && (
              <p className='flex justify-between py-3'>
                <span className='text-muted-foreground'>Created</span>
                <span>{new Date(payment.createdAt).toLocaleString()}</span>
              </p>
            )}
          </div>
        </section>
        <section className='flex flex-col items-center gap-4 rounded-lg border p-6 text-center'>
          <h2 className='text-lg font-semibold'>Scan to pay</h2>
          {payment?.status === 'pending' && (
            <>
              <img
                src={payment?.qrCodeUrl ?? search.qr}
                alt='Payment QR code'
                className='w-72 rounded border'
              />
              <p className='text-muted-foreground'>
                Time remaining: {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, '0')}
              </p>
              <Button
                className='w-full'
                variant='destructive'
                onClick={() => cancel.mutate()}
              >
                Cancel order
              </Button>
            </>
          )}
          <Button className='w-full' asChild variant='outline'>
            <Link to='/plans'>Back to plans</Link>
          </Button>
        </section>
      </div>
    </main>
  )
}

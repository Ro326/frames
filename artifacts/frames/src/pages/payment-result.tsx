import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useGetPayment, getGetMeQueryKey } from '@workspace/api-client-react';
import { Shell, Btn, ErrorBox } from '@/components/kit';
import { errInfo } from '@/lib/util';

export default function PaymentResult() {
  const id = Number(new URLSearchParams(window.location.search).get('payment'));
  const valid = Number.isSafeInteger(id) && id > 0;
  const [started, setStarted] = useState(Date.now);
  const qc = useQueryClient();
  const query = useGetPayment(id, { query: {
    enabled: valid, retry: false, staleTime: 0,
    refetchInterval: (state) => {
      const data = state.state.data;
      return Date.now() - started < 120_000 && !data?.paid &&
        !['FAILED', 'CANCELLED', 'CREATION_FAILED'].includes(data?.status ?? '') ? 5000 : false;
    },
  } });
  const paid = query.data?.paid === true;
  useEffect(() => { if (paid) qc.invalidateQueries({ queryKey: getGetMeQueryKey() }); }, [paid, qc]);
  const failed = ['FAILED', 'CANCELLED', 'CREATION_FAILED'].includes(query.data?.status ?? '');
  return <Shell>
    <section className="mx-auto max-w-xl space-y-5 rounded-md border border-border bg-card p-6">
      <p className="font-mono text-xs text-primary">Pine Labs · UAT / test mode</p>
      <h1 className="font-display text-4xl font-normal" data-testid="text-payment-result">{paid ? 'Frames Pro is ready.' : failed ? 'Payment not completed.' : 'Confirming your payment…'}</h1>
      <p className="text-sm text-muted-foreground">{paid
        ? 'Pine Labs has confirmed your ₹49 test payment server-side. Pro access is now active on your account.'
        : 'Pro only unlocks after Pine Labs confirms the full payment. Returning from checkout alone does not count.'}</p>
      {!valid && <ErrorBox msg="Invalid payment reference. Return to Studio to start checkout." />}
      {query.isError && <ErrorBox msg={errInfo(query.error).msg} />}
      {query.data && <p className="break-all font-mono text-xs text-muted-foreground" data-testid="text-payment-order">Order: {query.data.orderId ?? 'Not created'} · {query.data.status}</p>}
      {!paid && valid && <Btn variant="line" loading={query.isFetching} onClick={() => { setStarted(Date.now()); query.refetch(); }}>Check payment again</Btn>}
      <Link href="/studio" className="tap inline-flex min-h-12 items-center text-sm text-primary underline" data-testid="link-payment-studio">Back to Studio</Link>
    </section>
  </Shell>;
}

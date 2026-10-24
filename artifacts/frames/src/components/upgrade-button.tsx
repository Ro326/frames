import { useCreatePayment, useGetMe, useGetServiceStatus } from '@workspace/api-client-react';
import { Btn, ErrorBox } from './kit';
import { errInfo } from '@/lib/util';

export function UpgradeButton({ testId = 'button-frames-pro' }: { testId?: string }) {
  const me = useGetMe();
  const status = useGetServiceStatus({ query: { staleTime: 30_000 } });
  const pay = useCreatePayment();
  if (me.data?.user?.pro) return <p className="text-sm text-primary" data-testid="text-pro-active">Frames Pro is active</p>;
  return <div className="space-y-2">
    <Btn variant="line" loading={pay.isPending} disabled={!status.data?.payments}
      onClick={() => pay.mutate(undefined, { onSuccess: (result) => window.location.assign(result.url) })}
      data-testid={testId}>Frames Pro – ₹49</Btn>
    <p className="text-xs text-muted-foreground">{status.data?.payments
      ? 'Pine Labs UAT checkout · test payment, not a live charge.'
      : 'Pine Labs UAT checkout needs merchant credentials before it can open.'}</p>
    {pay.isError && <ErrorBox msg={errInfo(pay.error).msg} />}
  </div>;
}

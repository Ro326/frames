import { useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useGetPayment, useSubmitPaymentReference, useCreatePayment, getGetMeQueryKey, getGetPaymentQueryKey } from '@workspace/api-client-react';
import { Shell, Btn, ErrorBox, Skel, inputCls } from '@/components/kit';
import { errInfo } from '@/lib/util';

export default function PaymentResult() {
  const search = useSearch();
  const id = Number(new URLSearchParams(search).get('payment'));
  const valid = Number.isSafeInteger(id) && id > 0;
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const query = useGetPayment(id, { query: {
    enabled: valid, retry: false, staleTime: 0, queryKey: getGetPaymentQueryKey(id),
    refetchInterval: (s) => s.state.data?.status === 'PENDING_REVIEW' && !s.state.data.paid && document.visibilityState === 'visible' ? 5000 : false,
  } });
  const submit = useSubmitPaymentReference({ mutation: { onSuccess: (p) => qc.setQueryData(getGetPaymentQueryKey(id), p) } });
  const again = useCreatePayment();
  const p = query.data;
  const paid = p?.environment === 'manual_upi' && p?.paid === true;
  useEffect(() => { if (paid) qc.invalidateQueries({ queryKey: getGetMeQueryKey() }); }, [paid, qc]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      let success = false;
      try { success = document.execCommand('copy'); } catch { /* allow manual copying from the visible UPI ID */ }
      t.remove();
      if (!success) { setCopied('Copy unavailable — select the UPI ID above'); return; }
    }
    setCopied('Copied'); setTimeout(() => setCopied(null), 2000);
  };

  const manual = p?.environment === 'manual_upi';
  const status = p?.status ?? '';
  const awaiting = manual && status === 'AWAITING_PAYMENT' && !paid;
  const pending = manual && status === 'PENDING_REVIEW' && !paid;
  const rejected = manual && status === 'REJECTED' && !paid;
  const legacy = !!p && !manual && !paid;
  const title = paid ? 'Frames Pro is ready.' : pending ? 'Payment under review.' : rejected ? 'Payment not approved.'
    : awaiting ? 'Pay ₹49 by UPI.' : legacy ? 'Older checkout record.' : 'Loading payment…';
  const refValid = /^\d{12}$/.test(ref);
  const refresh = <Btn variant="line" loading={query.isFetching} onClick={() => query.refetch()} data-testid="button-payment-refresh">Refresh status</Btn>;

  return <Shell>
    <section className="mx-auto max-w-xl min-w-0 space-y-5 rounded-md border border-border bg-card p-4 sm:p-6">
      <p className="font-mono text-xs text-primary">Manual UPI checkout</p>
      <h1 className="font-display text-3xl font-normal sm:text-4xl" data-testid="text-payment-result">{title}</h1>
      {!valid && <ErrorBox msg="Invalid payment reference. Return to Studio to start checkout." />}
      {valid && query.isLoading && <Skel className="h-48" />}
      {query.isError && <ErrorBox msg={errInfo(query.error).msg} onRetry={() => query.refetch()} />}

      {paid && <>
        <p className="text-sm text-muted-foreground">An admin verified your ₹49 payment. Pro access is now active on your account.</p>
        <Link href="/studio" className="tap inline-flex min-h-12 items-center rounded-md bg-foreground px-4 text-background" data-testid="link-payment-studio">Back to Studio</Link>
      </>}

      {awaiting && p && <>
        <p className="text-sm text-muted-foreground">Paying sends real money to the account below. The QR alone cannot verify a payment, and submitting your reference does not unlock Pro. Pro unlocks only after an admin checks the receipt.</p>
        {p.upiUri ? <>
          <div className="mx-auto w-fit rounded-md bg-white p-3" data-testid="img-upi-qr"><QRCodeSVG value={p.upiUri} size={208} level="M" marginSize={1} className="h-auto max-w-full" /></div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Payee</dt><dd className="min-w-0 break-words">{p.payeeName ?? 'Frames'}</dd>
            <dt className="text-muted-foreground">UPI ID</dt><dd className="min-w-0 break-all font-mono text-xs" data-testid="text-upi-id">{p.upiId ?? 'Unavailable'}</dd>
            <dt className="text-muted-foreground">Amount</dt><dd>₹{(p.amount / 100).toFixed(2)} {p.currency}</dd>
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a href={p.upiUri} className="tap inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-foreground px-4 text-center text-[15px] text-background" data-testid="link-open-upi">Open UPI app</a>
            <Btn variant="line" className="flex-1" onClick={() => copy(p.upiId ?? p.upiUri!)} data-testid="button-copy-upi">{copied ?? 'Copy UPI ID'}</Btn>
          </div>
          <form className="space-y-3 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); if (refValid) submit.mutate({ id, data: { transactionReference: ref } }); }}>
            <label className="block"><span className="font-mono mb-1.5 block text-[11px] tracking-[0.08em] text-muted-foreground">After paying, enter the 12-digit UTR / reference</span>
              <input inputMode="numeric" maxLength={12} className={inputCls} value={ref} onChange={(e) => setRef(e.target.value.replace(/\D/g, ''))} placeholder="123456789012" data-testid="input-utr" /></label>
            {submit.isError && <ErrorBox msg={errInfo(submit.error).msg} />}
            <Btn type="submit" loading={submit.isPending} disabled={!refValid} className="w-full" data-testid="button-submit-utr">Submit for manual review</Btn>
          </form>
        </> : <ErrorBox msg="This checkout has no payment details. Start a new checkout from Studio." />}
      </>}

      {pending && p && <>
        <p className="text-sm text-muted-foreground">Your reference is saved. An admin will match it against the receiving account. Pro stays locked until then. Do not pay again.</p>
        <p className="break-all font-mono text-sm" data-testid="text-saved-utr">Reference: {p.transactionReference ?? 'Saved'}</p>
        {refresh}
      </>}

      {rejected && p && <>
        <p className="text-sm text-muted-foreground">We could not match this payment. Check the reference{p.transactionReference ? ` (${p.transactionReference})` : ''}. If you were already charged, do not pay again; start a new request below and enter the correct reference.</p>
        {again.isError && <ErrorBox msg={errInfo(again.error).msg} />}
        <Btn loading={again.isPending} onClick={() => again.mutate(undefined, { onSuccess: (r) => { if (r.paymentId) { setRef(''); setLocation(`/payment/result?payment=${r.paymentId}`); } } })} data-testid="button-new-checkout">Start a new checkout request</Btn>
      </>}

      {legacy && <p className="text-sm text-muted-foreground">This record is from an earlier test checkout ({status || 'unknown'}). It is not a real payment and no QR is available. Start a new checkout from Studio.</p>}
      {p && manual && !awaiting && !pending && !rejected && !paid && <p className="text-sm text-muted-foreground">Status: {status}. {refresh}</p>}
      {p && !paid && <Link href="/studio" className="tap inline-flex min-h-12 items-center text-sm text-primary underline" data-testid="link-payment-studio">Back to Studio</Link>}
    </section>
  </Shell>;
}

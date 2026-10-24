import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReviewPayment, getGetAdminQueryKey, type Payment } from '@workspace/api-client-react';
import { Btn, ErrorBox } from './kit';
import { errInfo } from '@/lib/util';

export function PaymentCard({ payment, auth }: { payment: Payment; auth: string }) {
  const qc = useQueryClient();
  const [ok, setOk] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const review = useReviewPayment({ request: { headers: { Authorization: auth } }, mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetAdminQueryKey() }) } });
  const reviewable = payment.environment === 'manual_upi' && payment.status === 'PENDING_REVIEW' && !payment.paid;
  const go = (decision: 'approve' | 'reject') => review.mutate({ id: payment.id, data: { decision, confirmed: decision === 'approve' && ok } });
  return <li className="min-w-0 space-y-2 p-4 text-sm" data-testid={'row-payment-' + payment.id}>
    <div className="flex flex-wrap justify-between gap-2"><span>User {payment.userId} · ₹{(payment.amount / 100).toFixed(2)}</span><span className="font-mono text-xs text-primary">{payment.status}</span></div>
    <p className="break-all font-mono text-xs text-muted-foreground">{payment.environment === 'manual_upi' ? 'UTR: ' + (payment.transactionReference ?? 'not submitted') : (payment.orderId ?? payment.merchantReference) + ' (legacy ' + payment.environment + ')'}</p>
    <p className="break-all text-xs text-muted-foreground">{payment.upiId ? 'Payee UPI: ' + payment.upiId + ' · ' : ''}{payment.paid ? 'Verified, Pro unlocked' : 'Not verified'} · {new Date(payment.createdAt).toLocaleString()}</p>
    {reviewable && <div className="space-y-3 border-t border-border pt-3">
      <label className="flex items-start gap-3 text-xs"><input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid={'check-confirm-' + payment.id} />
        <span>My bank or UPI app receipt shows ₹49.00 received at {payment.upiId ?? 'the receiving UPI ID'} with reference {payment.transactionReference ?? 'above'}.</span></label>
      {review.isError && <ErrorBox msg={errInfo(review.error).msg} />}
      {!rejecting ? <div className="flex flex-col gap-2 sm:flex-row">
        <Btn loading={review.isPending} disabled={!ok} onClick={() => go('approve')} data-testid={'button-approve-' + payment.id}>Approve and unlock Pro</Btn>
        <Btn variant="danger" disabled={review.isPending} onClick={() => setRejecting(true)} data-testid={'button-reject-' + payment.id}>Reject</Btn>
      </div> : <div className="space-y-2"><p className="text-xs">Reject this payment? The user can submit a corrected reference.</p>
        <div className="flex flex-col gap-2 sm:flex-row"><Btn variant="danger" loading={review.isPending} onClick={() => go('reject')} data-testid={'button-confirm-reject-' + payment.id}>Confirm reject</Btn>
          <Btn variant="ghost" disabled={review.isPending} onClick={() => setRejecting(false)}>Cancel</Btn></div></div>}
    </div>}
  </li>;
}

import { CheckCircle2, CircleDashed, Clock3, RotateCcw, XCircle } from 'lucide-react';
import { cx } from './ui';

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled', AVAILABLE: 'Available', CLAIMED: 'In progress', COMPLETED_PENDING_REVIEW: 'Waiting to be checked',
  RETURNED_TO_CHILD: 'Try again', APPROVED: 'Approved', REJECTED: 'Not approved', EXPIRED: 'Expired', CANCELLED: 'Cancelled',
};

export function Status({ value }: { value: string }) {
  const Icon = value === 'APPROVED' ? CheckCircle2 : value === 'REJECTED' || value === 'EXPIRED' ? XCircle : value === 'RETURNED_TO_CHILD' ? RotateCcw : value === 'SCHEDULED' || value === 'COMPLETED_PENDING_REVIEW' ? Clock3 : CircleDashed;
  return <span className={cx('status', `status-${value.toLowerCase()}`)}><Icon size={15} />{STATUS_LABELS[value] ?? value}</span>;
}

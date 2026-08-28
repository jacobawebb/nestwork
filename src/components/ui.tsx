import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cx('button', `button-${variant}`, `button-${size}`, className)} {...props} />;
});

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...props }, ref) {
  return <input ref={ref} className={cx('input', className)} {...props} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx('input min-h-24 resize-y', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cx('input', className)} {...props} />;
});

export function Modal({ title, children, onClose, labelledBy = 'modal-title' }: { title: string; children: ReactNode; onClose: () => void; labelledBy?: string }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="modal-heading">
          <h2 id={labelledBy}>{title}</h2>
          <Button variant="quiet" size="sm" aria-label="Close" onClick={onClose}><X size={20} /></Button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function InlineNotice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error' }) {
  return <div className={cx('notice', `notice-${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-block" role="status"><span className="loading-dot" />{label}</div>;
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

import { cx } from './ui';
import { accentKeys, avatarColor, normalizeAccentKey, themeOptions } from '@/lib/theme';

export function Avatar({ avatarKey, accentKey, size = 'md', label }: { avatarKey: string; accentKey: string; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const accent = avatarColor(accentKey);
  const child = avatarKey.startsWith('child');
  const variant = Number(avatarKey.match(/\d+/)?.[0] ?? 1) % 3;
  return (
    <span className={cx('avatar', `avatar-${size}`)} style={{ backgroundColor: `${accent}25` }} role={label ? 'img' : undefined} aria-label={label}>
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="31" r={child ? 18 : 17} fill="#f2c7a5" />
        <path d={variant === 0 ? 'M15 31c0-17 34-23 36 1-8-3-15-9-20-14-4 7-9 11-16 13Z' : variant === 1 ? 'M14 31c0-21 37-25 37 2-5-8-14-14-23-14-3 7-7 10-14 12Z' : 'M15 33c-2-24 38-26 35 1-7-2-13-7-18-13-5 6-10 10-17 12Z'} fill="#153a52" />
        <circle cx="25" cy="33" r="1.7" fill="#153a52" /><circle cx="39" cy="33" r="1.7" fill="#153a52" />
        <path d="M27 40c3 3 7 3 10 0" fill="none" stroke="#9b4f45" strokeWidth="2" strokeLinecap="round" />
        <path d="M14 64c1-14 9-21 18-21s17 7 18 21" fill={accent} />
      </svg>
    </span>
  );
}

export function ColourPicker({
  value,
  onChange,
  label = 'Colour theme',
  compact = false,
  className,
}: {
  value: string;
  onChange: (accentKey: string) => void;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const selected = normalizeAccentKey(value);
  return (
    <fieldset className={cx('colour-picker', compact && 'colour-picker-compact', className)}>
      <legend>{label}</legend>
      <div className="colour-options">
        {themeOptions.map((option) => (
          <label
            className={cx('colour-option', option.key === selected && 'colour-option-selected')}
            data-theme={option.key}
            key={option.key}
          >
            <input
              className="colour-option-input"
              type="radio"
              name={label}
              value={option.key}
              checked={option.key === selected}
              onChange={() => onChange(option.key)}
            />
            <span className="colour-swatch" aria-hidden="true" />
            <span className="colour-label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export const avatarOptions = [
  { key: 'child-1', label: 'Short hair' }, { key: 'child-2', label: 'Side sweep' }, { key: 'child-3', label: 'Wavy hair' },
  { key: 'grownup-1', label: 'Grown-up one' }, { key: 'grownup-2', label: 'Grown-up two' }, { key: 'grownup-3', label: 'Grown-up three' },
];

export const accentOptions = [...accentKeys];

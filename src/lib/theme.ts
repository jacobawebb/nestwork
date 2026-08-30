export const accentKeys = ['teal', 'blue', 'coral', 'ochre', 'green', 'violet', 'indigo', 'rose', 'sky', 'berry'] as const;

export type AccentKey = (typeof accentKeys)[number];

export const themeOptions: ReadonlyArray<{ key: AccentKey; label: string; avatarColor: string }> = [
  { key: 'teal', label: 'Teal', avatarColor: '#20a5a3' },
  { key: 'blue', label: 'Blue', avatarColor: '#5b8def' },
  { key: 'coral', label: 'Coral', avatarColor: '#e87866' },
  { key: 'ochre', label: 'Ochre', avatarColor: '#e9a72f' },
  { key: 'green', label: 'Green', avatarColor: '#5aa777' },
  { key: 'violet', label: 'Violet', avatarColor: '#8c78c6' },
  { key: 'indigo', label: 'Indigo', avatarColor: '#6674c7' },
  { key: 'rose', label: 'Rose', avatarColor: '#cf6f91' },
  { key: 'sky', label: 'Sky', avatarColor: '#429fc4' },
  { key: 'berry', label: 'Berry', avatarColor: '#a35b9b' },
];

const avatarColors = Object.fromEntries(themeOptions.map(({ key, avatarColor }) => [key, avatarColor])) as Record<AccentKey, string>;

export function normalizeAccentKey(value: string | undefined): AccentKey {
  return value && Object.hasOwn(avatarColors, value) ? value as AccentKey : 'teal';
}

export function avatarColor(accentKey: string): string {
  return avatarColors[normalizeAccentKey(accentKey)];
}

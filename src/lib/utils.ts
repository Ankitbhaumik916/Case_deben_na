import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compose class names, with later Tailwind utilities winning conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "Inés Vargas" -> "IV". Falls back to the email's first character. */
export function initials(name: string | null | undefined, fallback = '?'): string {
  const source = (name ?? '').trim();
  if (!source) return fallback.slice(0, 1).toUpperCase();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

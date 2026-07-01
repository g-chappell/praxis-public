import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const monogramVariants = cva(
  'inline-grid place-items-center border-2 font-mono font-bold uppercase leading-none',
  {
    variants: {
      variant: {
        default: 'border-border bg-background text-foreground',
        ink: 'border-foreground bg-foreground text-background',
        stamp: 'border-stamp bg-stamp text-destructive-foreground',
      },
      size: {
        sm: 'size-6 text-[0.55rem]',
        default: 'size-7 text-xs',
        lg: 'size-9 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// Derive 1–2 initials from a name or email (no photos — index-card feel).
export function initialsFor(nameOrEmail: string): string {
  const base = nameOrEmail.split('@')[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export interface MonogramProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof monogramVariants> {
  name: string;
}

export const Monogram = React.forwardRef<HTMLSpanElement, MonogramProps>(
  ({ className, variant, size, name, title, ...props }, ref) => (
    <span
      ref={ref}
      title={title ?? name}
      className={cn(monogramVariants({ variant, size }), className)}
      {...props}
    >
      {initialsFor(name)}
    </span>
  ),
);
Monogram.displayName = 'Monogram';

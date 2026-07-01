import * as React from 'react';

import { cn } from '@/lib/utils';

// Brutalist field: ink 2px border, parchment well, square corners, oxblood hard
// shadow on focus (no glow).
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex h-10 w-full rounded-none border-2 border-input bg-field px-3 py-2 text-[0.95rem] text-foreground transition-shadow placeholder:italic placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-hard-stamp disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

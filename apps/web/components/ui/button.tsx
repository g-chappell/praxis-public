import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-2 font-mono text-xs font-bold uppercase tracking-wide transition-transform focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-foreground bg-primary text-primary-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--shadow))] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
        stamp:
          'border-stamp bg-stamp text-destructive-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--shadow))] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
        destructive:
          'border-stamp bg-destructive text-destructive-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--shadow))] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
        outline:
          'border-foreground bg-background text-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_hsl(var(--shadow))] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none',
        secondary:
          'border-foreground bg-secondary text-secondary-foreground shadow-hard-sm hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        ghost: 'border-transparent text-foreground hover:bg-accent',
        link: 'border-transparent normal-case tracking-normal text-foreground underline underline-offset-4',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-[0.625rem]',
        lg: 'h-12 px-8 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

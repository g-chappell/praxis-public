import * as React from 'react';

import { cn } from '@/lib/utils';

// Library/correction stamp — the oxblood status pill (Live / Ready / In progress /
// Draft / Selected). `solid` fills it. Built on the .stamp utility from globals.css.
export interface StampProps extends React.HTMLAttributes<HTMLSpanElement> {
  solid?: boolean;
}

export const Stamp = React.forwardRef<HTMLSpanElement, StampProps>(
  ({ className, solid, ...props }, ref) => (
    <span ref={ref} className={cn('stamp', solid && 'stamp-solid', className)} {...props} />
  ),
);
Stamp.displayName = 'Stamp';

import * as React from 'react';

import { cn } from '@/lib/utils';

// Folder/index tab — mono uppercase label, 2px border with no bottom edge, the
// active tab sits flush and carries an ink underline-from-inside. Used for the
// workspace workbench (Code / Preview / Git / Usage) and any tabbed surface.
export interface FolderTabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const FolderTab = React.forwardRef<HTMLButtonElement, FolderTabProps>(
  ({ className, active, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active ? '' : undefined}
      className={cn(
        'relative -mb-0.5 border-2 border-b-0 border-border px-3.5 py-1.5 font-mono text-[0.66rem] font-bold uppercase tracking-[0.12em] transition-colors',
        active
          ? 'z-10 bg-background text-foreground shadow-[0_-3px_0_hsl(var(--foreground))_inset]'
          : 'bg-muted text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
FolderTab.displayName = 'FolderTab';

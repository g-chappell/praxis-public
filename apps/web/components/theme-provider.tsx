'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

// Wraps next-themes so the app can flip the `.dark` class on <html> (parchment ↔
// chalkboard). Light is the default; the choice persists in localStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

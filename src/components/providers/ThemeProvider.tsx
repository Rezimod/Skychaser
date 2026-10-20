'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** Field mode: red-on-black night-vision overlay to protect dark adaptation. */
  field: boolean;
  toggleField: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  field: false,
  toggleField: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [field, setField] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('stellar_theme') as Theme | null;
    const resolved = stored === 'light' ? 'light' : 'dark';
    setThemeState(resolved);
    document.documentElement.setAttribute('data-theme', resolved);

    const storedField = localStorage.getItem('stellar_field') === 'on';
    setField(storedField);
    document.documentElement.setAttribute('data-field', storedField ? 'on' : 'off');
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('stellar_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('stellar_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  const toggleField = useCallback(() => {
    setField((prev) => {
      const next = !prev;
      localStorage.setItem('stellar_field', next ? 'on' : 'off');
      document.documentElement.setAttribute('data-field', next ? 'on' : 'off');
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, field, toggleField }),
    [theme, setTheme, toggleTheme, field, toggleField],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

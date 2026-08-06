import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('app-theme');
    if (savedTheme) {
      return savedTheme;
    }
    // Default to system
    return 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (themeToApply) => {
      if (themeToApply === 'dark') {
        root.setAttribute('data-theme', 'dark');
      } else if (themeToApply === 'dark-iphone') {
        root.setAttribute('data-theme', 'dark-iphone');
      } else if (themeToApply === 'light') {
        root.setAttribute('data-theme', 'light');
      } else {
        // System preference
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', systemPrefersDark ? 'dark' : 'light');
      }
    };

    applyTheme(theme);
    localStorage.setItem('app-theme', theme);

    // If system theme is selected, listen for OS changes
    let mediaQuery;
    const handleChange = (e) => {
      if (theme === 'system') {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };

    if (theme === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', handleChange);
    }

    return () => {
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange);
      }
    };
  }, [theme]);

  // Cycle through themes: system -> light -> dark -> dark-iphone -> system
  const toggleTheme = () => {
    setTheme((prevTheme) => {
      if (prevTheme === 'system') return 'light';
      if (prevTheme === 'light') return 'dark';
      if (prevTheme === 'dark') return 'dark-iphone';
      return 'system';
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

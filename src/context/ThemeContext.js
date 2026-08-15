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
      let isDark = false;
      let appliedDataTheme = '';

      if (themeToApply === 'dark') {
        appliedDataTheme = 'dark';
        isDark = true;
      } else if (themeToApply === 'dark-iphone') {
        appliedDataTheme = 'dark-iphone';
        isDark = true;
      } else if (themeToApply === 'light') {
        appliedDataTheme = 'light';
        isDark = false;
      } else {
        // System preference
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        appliedDataTheme = systemPrefersDark ? 'dark' : 'light';
        isDark = !!systemPrefersDark;
      }

      if (appliedDataTheme === 'light') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', appliedDataTheme);
      }

      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#1f1b1a' : '#f0f2f5');
      }
    };

    applyTheme(theme);
    localStorage.setItem('app-theme', theme);

    // If system theme is selected, listen for OS changes
    let mediaQuery;
    const handleChange = (e) => {
      if (theme === 'system') {
        const isDark = e.matches;
        if (isDark) {
          root.setAttribute('data-theme', 'dark');
        } else {
          root.removeAttribute('data-theme');
        }
        
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', isDark ? '#1f1b1a' : '#f0f2f5');
        }
      }
    };

    if (theme === 'system' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      try {
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', handleChange);
        } else if (mediaQuery.addListener) {
          mediaQuery.addListener(handleChange);
        }
      } catch (e) {
        console.warn('Theme listener not supported', e);
      }
    }

    return () => {
      if (mediaQuery) {
        try {
          if (mediaQuery.removeEventListener) {
            mediaQuery.removeEventListener('change', handleChange);
          } else if (mediaQuery.removeListener) {
            mediaQuery.removeListener(handleChange);
          }
        } catch (e) {
          console.warn('Theme listener remove not supported', e);
        }
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

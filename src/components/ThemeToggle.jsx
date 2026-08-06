import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon, Monitor } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={
        theme === 'dark-iphone' ? 'Current Theme: Dark (iPhone). Click to change.' :
        `Current Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}. Click to change.`
      }
      aria-label="Toggle theme"
    >
      <div className="theme-toggle-icons">
        {theme === 'light' && <Sun size={18} className="theme-icon sun-icon" />}
        {theme === 'dark' && <Moon size={18} className="theme-icon moon-icon" />}
        {theme === 'dark-iphone' && <Moon size={18} className="theme-icon moon-icon" />}
        {theme === 'system' && <Monitor size={18} className="theme-icon system-icon" />}
      </div>
    </button>
  );
}

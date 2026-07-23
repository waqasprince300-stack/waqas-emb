import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './layout.css';
import App from './App';

/**
 * Keep everyone on ONE canonical host. The login token is stored in localStorage which is
 * per-origin, so `www.` and the apex domain do not share a session — that mismatch shows up as
 * "HTTP 401: Authentication token required" after a normal login. Redirecting unifies the origin.
 *
 * Default: strip a leading "www." in production. Override the target with REACT_APP_CANONICAL_HOST
 * or disable entirely with REACT_APP_DISABLE_HOST_REDIRECT=1.
 */
(function enforceCanonicalHost() {
  try {
    if (process.env.NODE_ENV !== 'production') return;
    if (process.env.REACT_APP_DISABLE_HOST_REDIRECT === '1') return;
    const loc = window.location;
    if (loc.protocol !== 'https:') return;
    const host = loc.hostname;
    const configured = String(process.env.REACT_APP_CANONICAL_HOST || '')
      .trim()
      .toLowerCase();
    const target = configured || (host.startsWith('www.') ? host.slice(4) : '');
    if (!target || target === host) return;
    loc.replace(`${loc.protocol}//${target}${loc.pathname}${loc.search}${loc.hash}`);
  } catch {
    /* never block app start on redirect logic */
  }
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

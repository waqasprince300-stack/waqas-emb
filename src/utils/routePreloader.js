// Route Preloader Utility for instant, zero-delay page navigation
// Downloads dynamic module chunks in the background during idle time and on hover/touch

const routeLoaders = {
  '/': () => import('../pages/Dashboard'),
  '/ghausia': () => import('../pages/GhausiaCollection'),
  '/party-ledger': () => import('../pages/PartyLedger'),
  '/parties': () => import('../pages/Parties'),
  '/payments': () => import('../pages/Payments'),
  '/rate-calculations': () => import('../pages/RateCalculations'),
  '/review-lots': () => import('../pages/ReviewLots'),
  '/personal-khata': () => import('../pages/PersonalKhata'),
  '/users': () => import('../pages/UserApprovals'),
  '/super-admin/pending-admins': () => import('../pages/SuperAdminApprovals'),
  '/upgrade': () => import('../pages/UpgradeAccount'),
};

const preloadedSet = new Set();

/**
 * Preload a specific route chunk by path.
 * Safe to call multiple times; executes only once per path.
 * @param {string} path - Target route path, e.g. '/ghausia'
 */
export function preloadRoute(path) {
  if (!path || typeof path !== 'string') return;
  
  // Extract path without query parameters or hash
  const cleanPath = path.split('?')[0].split('#')[0];
  const loader = routeLoaders[cleanPath];

  if (loader && !preloadedSet.has(cleanPath)) {
    preloadedSet.add(cleanPath);
    loader().catch(() => {
      // Allow retry if chunk fetch failed due to temporary network blip
      preloadedSet.delete(cleanPath);
    });
  }
}

/**
 * Preload core application routes during browser idle time so transitions feel instantaneous.
 */
export function preloadCoreRoutes() {
  const corePaths = ['/ghausia', '/party-ledger', '/payments', '/parties', '/personal-khata'];

  const schedulePreload = () => {
    let index = 0;
    const loadNext = () => {
      if (index >= corePaths.length) return;
      const path = corePaths[index++];
      preloadRoute(path);
      // Stagger slightly (150ms) to ensure zero interference with any active API calls
      setTimeout(loadNext, 150);
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadNext(), { timeout: 3000 });
    } else {
      setTimeout(loadNext, 1200);
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete') {
      setTimeout(schedulePreload, 1500);
    } else {
      window.addEventListener('load', () => setTimeout(schedulePreload, 1500), { once: true });
    }
  }
}

import { useState, useCallback } from 'react';
import { apiService } from '../services/api';

const BUSINESS_OWNER_KEY = 'waqas_emb_business_owner_id';
const WORKSPACE_VIEW_ALL_KEY = 'waqas_emb_workspace_view_all';

export function useBusinessOwnersData({ invalidateBootstrapCache, workspaceSwitchRef }) {
  const [businessOwners, setBusinessOwners] = useState([]);
  const [activeBusinessOwnerId, setActiveBusinessOwnerId] = useState(() => {
    try {
      return localStorage.getItem(BUSINESS_OWNER_KEY) || '';
    } catch {
      return '';
    }
  });

  const readViewAllWorkspaces = () => {
    try {
      return localStorage.getItem(WORKSPACE_VIEW_ALL_KEY) === '1';
    } catch {
      return false;
    }
  };

  const [viewAllWorkspaces, setViewAllWorkspaces] = useState(readViewAllWorkspaces);

  const selectBusinessOwner = useCallback(
    (id) => {
      const nextId = String(id || '');
      if (nextId === String(activeBusinessOwnerId || '') && !viewAllWorkspaces) {
        return;
      }
      try {
        localStorage.removeItem(WORKSPACE_VIEW_ALL_KEY);
      } catch {
        /* ignore */
      }
      if (workspaceSwitchRef) workspaceSwitchRef.current = true;
      setViewAllWorkspaces(false);
      localStorage.setItem(BUSINESS_OWNER_KEY, nextId);
      setActiveBusinessOwnerId(nextId);
    },
    [activeBusinessOwnerId, viewAllWorkspaces, workspaceSwitchRef]
  );

  const selectAllWorkspacesView = useCallback(() => {
    try {
      localStorage.setItem(WORKSPACE_VIEW_ALL_KEY, '1');
    } catch {
      /* ignore */
    }
    setViewAllWorkspaces(true);
  }, []);

  const createBusinessOwner = useCallback(
    async (data) => {
      const created = await apiService.createBusinessOwner(data);
      if (invalidateBootstrapCache) invalidateBootstrapCache();
      setBusinessOwners((current) => [...current, created]);
      selectBusinessOwner(created.id || created._id);
      return created;
    },
    [invalidateBootstrapCache, selectBusinessOwner]
  );

  return {
    businessOwners,
    setBusinessOwners,
    activeBusinessOwnerId,
    setActiveBusinessOwnerId,
    viewAllWorkspaces,
    setViewAllWorkspaces,
    selectBusinessOwner,
    selectAllWorkspacesView,
    createBusinessOwner,
  };
}

import { useState, useCallback, useMemo } from 'react';
import { apiService } from '../services/api';
import { normalizeParty } from '../utils/lotNormalizer';

export const INITIAL_PARTIES = [];

export function usePartiesData() {
  const [parties, setParties] = useState(INITIAL_PARTIES);

  const addParty = useCallback(async (p) => {
    const created = normalizeParty(await apiService.createParty(p));
    setParties((arr) => [...arr, created]);
    return created;
  }, []);

  const updateParty = useCallback(async (id, p) => {
    const updated = normalizeParty(await apiService.updateParty(id, p));
    const idStr = String(id);
    setParties((arr) => arr.map((x) => (String(x.id) === idStr ? updated : x)));
    return updated;
  }, []);

  const deleteParty = useCallback(async (id) => {
    await apiService.deleteParty(id);
    const idStr = String(id);
    setParties((arr) => arr.filter((x) => String(x.id) !== idStr));
  }, []);

  const partiesById = useMemo(() => {
    const map = new Map();
    for (const p of parties) map.set(String(p.id), p);
    return map;
  }, [parties]);

  const getPartyById = useCallback(
    (id) => {
      if (id == null || id === '') return undefined;
      return partiesById.get(String(id));
    },
    [partiesById]
  );

  const getPartyName = useCallback((id) => getPartyById(id)?.name || 'Unknown', [getPartyById]);

  return {
    parties,
    setParties,
    addParty,
    updateParty,
    deleteParty,
    getPartyById,
    getPartyName,
  };
}

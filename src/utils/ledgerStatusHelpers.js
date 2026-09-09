import { partyFacingLedgerDisplayLabel } from './partyFacingLabels';

export function adminLotNotDispatched(lot) {
  return (
    String(lot?.status || '')
      .toLowerCase()
      .trim() === 'pending'
  );
}

export function partyFacingStatusLabel(displayStatus, isParty) {
  if (!isParty) return displayStatus;
  return partyFacingLedgerDisplayLabel(displayStatus);
}

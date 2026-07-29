import React, { useState, useMemo, useRef, useEffect } from 'react';
import Swal from 'sweetalert2';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import BusinessOwnerSwitcher from '../components/BusinessOwnerSwitcher';
import LotStatusSelect from '../components/LotStatusSelect';
import PartyPickerSelect from '../components/PartyPickerSelect';
import {
  Modal,
  FormGroup,
  StatusBadge as _StatusBadge,
  ActionBtn,
  SearchBar,
  EmptyState,
  ConfirmDialog,
} from '../components/UI';
import Loader from '../components/Loader';
import LoaderDashboard from '../components/LoaderDashboard';
import {
  DateRangeSelect,
  isWithinDateRange,
  latestDateFrom,
  compareRowsByUpdatedNewestFirst,
  formatDisplayDate,
} from '../utils/dateFilters';
import { workspaceDisplayTitleForLot } from '../utils/businessWorkspace';
import { getAdminLedgerOrBusinessBill, getBusinessBillAmount } from '../utils/partyBillPrivacy';
import { generateSerialLotNumbers, previewSerialLotNumbers } from '../utils/lotSerial';
import {
  getRecentPartyIds,
  getRememberedItemTypes,
  getMachineHeadConfig,
  getAllMachineHeads,
  addCustomMachineHead,
  setDefaultMachineHead,
  removeCustomMachineHead,
  BASE_MACHINE_HEADS,
  rememberLotFormSave,
} from '../utils/lotFieldMemory';

const BASE_FABRICS = ['Lawn', 'Velvet', 'Cambric'];
const COLOR_OPTIONS = Array.from({ length: 13 }, (_, i) => i);
const STATUS_OPTIONS = [
  'pending',
  'dispatched',
  'pending approval',
  'rejected',
  'received back',
  'completed',
];

function lotSaveErrorToast(title) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'error',
    title,
    showConfirmButton: false,
    timer: 4500,
    timerProgressBar: true,
  });
}

function normalizeLotNumberKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function messageFromLotSaveError(err) {
  const msg = String(err?.message || err || '');
  const httpMatch = msg.match(/^HTTP (\d+):\s*(.*)$/is);
  if (httpMatch) {
    const status = Number(httpMatch[1]);
    const body = (httpMatch[2] || '').trim();
    if (status === 409 && body) return body;
    if (body && (status === 400 || status === 403)) return body;
  }
  if (/already exists in this collection/i.test(msg)) return msg;
  if (/E11000|duplicate key|dup key/i.test(msg)) {
    if (/lotNumber/i.test(msg)) {
      return 'A lot with this lot number already exists in this business collection. Use a different number, or switch collection if you meant another workspace.';
    }
    return 'Duplicate record: this value is already in use.';
  }
  return 'Could not save the lot. Please try again.';
}

function hasPositiveBillAmount(lot) {
  return Number(lot?.billAmount || 0) > 0;
}

const _newDate = new Date().toISOString().split('T')[0];

function resolveItemTypeFields(raw) {
  const t = String(raw?.itemType || raw?.fabric || '').trim();
  if (!t || BASE_FABRICS.includes(t)) {
    return { itemType: t || 'Lawn', customFabric: '' };
  }
  const remembered = getRememberedItemTypes();
  const hit = remembered.find((x) => x.toLowerCase() === t.toLowerCase());
  if (hit) return { itemType: hit, customFabric: '' };
  return { itemType: '__custom', customFabric: t };
}

function LotForm({
  initial,
  onSave,
  onClose,
  parties,
  saving,
  pickWorkspaceForNewLot,
  workspaceOwnerOptions,
  defaultNewLotOwnerId,
  onJumpToLinkedLot,
}) {
  const blank = {
    lotNumber: '',
    lotNo: '',
    designNo: '',
    description: '',
    itemType: 'Lawn',
    fabric: 'Lawn',
    customFabric: '',
    colors: 0,
    quantity: '',
    pieces: '',
    unit: 'pieces',
    rate: '',
    billAmount: '',
    //  totalAmount: '',
    //  notes: '',
    allotDate: new Date().toISOString().slice(0, 10),
    partyId: '',
    partyName: '',
    status: 'pending',
    dispatchDate: '',
    receivedBackDate: '',
    saveBusinessOwnerId: defaultNewLotOwnerId || '',
    suitType: '2-piece',
    isRework: false,
    ownerBillingChoice: 'separate',
    dupattaDetails: { partyId: '', partyName: '', itemType: '', customFabric: '', fabric: '', quantity: '', billAmount: '' },
  };
  const itemTypeOptions = useMemo(
    () => [...BASE_FABRICS, ...getRememberedItemTypes().filter((t) => !BASE_FABRICS.includes(t))],
    []
  );

  const [headConfig, setHeadConfig] = useState(() => getMachineHeadConfig());
  const [headList, setHeadList] = useState(() => getAllMachineHeads());
  const [selectedHead, setSelectedHead] = useState(() => {
    const cfg = getMachineHeadConfig();
    if (initial?.colors > 0 && initial?.pieces > 0) {
      const inferred = Math.round(Number(initial.pieces) / Number(initial.colors));
      if (inferred > 0) return inferred;
    }
    return cfg.defaultHead;
  });
  const [customHeadInput, setCustomHeadInput] = useState('');
  const [showHeadAdd, setShowHeadAdd] = useState(false);

  const [form, setForm] = useState(() => {
    if (!initial) return blank;
    const typeFields = resolveItemTypeFields(initial);
    return {
      ...blank,
      ...initial,
      lotNumber: initial.lotNumber || initial.lotNo || '',
      lotNo: initial.lotNo || initial.lotNumber || '',
      ...typeFields,
      fabric: typeFields.itemType === '__custom' ? typeFields.customFabric : typeFields.itemType,
      pieces: initial.pieces ?? '',
      partyId:
        initial.partyId ||
        parties.find((p) => p.name === (initial.partyName || initial.party))?.id ||
        '',
      partyName: parties.find((p) => p.id === initial.partyId)?.name || initial.partyName || '',
      saveBusinessOwnerId:
        initial.businessOwnerId != null && initial.businessOwnerId !== ''
          ? String(initial.businessOwnerId)
          : defaultNewLotOwnerId || '',
      suitType: initial.suitType || '2-piece',
      isRework: initial.isRework || false,
      ownerBillingChoice: initial.ownerBillingChoice || 'separate',
      dupattaDetails: initial.dupattaDetails || { partyId: '', partyName: '', rate: '', fabric: '', quantity: '', billAmount: '' },
    };
  });
  const [errors, setErrors] = useState({});
  const isNewLot = !initial;
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCount, setBulkCount] = useState(5);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectHead = (headCount) => {
    const h = Math.round(Number(headCount));
    if (!h || h < 1) return;
    setSelectedHead(h);
    setForm((f) => ({
      ...f,
      pieces: f.colors > 0 ? String(Number(f.colors) * h) : f.pieces,
    }));
  };

  const setColorsAndPieces = (colorsVal) => {
    const c = Number(colorsVal);
    setForm((f) => ({
      ...f,
      colors: c,
      pieces: c > 0 ? String(c * selectedHead) : '',
    }));
  };

  const addCustomHead = () => {
    const n = Math.round(Number(customHeadInput));
    if (!n || n < 1) return;
    const cfg = addCustomMachineHead(n);
    setHeadConfig(cfg);
    setHeadList(getAllMachineHeads());
    selectHead(n);
    setCustomHeadInput('');
  };

  const makeDefaultHead = (headCount) => {
    const cfg = setDefaultMachineHead(headCount);
    setHeadConfig(cfg);
    selectHead(headCount);
  };

  const removeCustomHead = (headCount) => {
    const cfg = removeCustomMachineHead(headCount);
    setHeadConfig(cfg);
    setHeadList(getAllMachineHeads());
    if (selectedHead === headCount) {
      selectHead(cfg.defaultHead);
    }
  };

  const bulkLotNumbers = useMemo(() => {
    if (!isNewLot || !bulkMode) return null;
    return generateSerialLotNumbers(form.lotNumber, bulkCount);
  }, [isNewLot, bulkMode, form.lotNumber, bulkCount]);

  const { recentParties, otherParties } = useMemo(() => {
    const recentIds = getRecentPartyIds();
    const recent = [];
    const others = [];
    for (const p of parties) {
      if (recentIds.includes(String(p.id))) recent.push(p);
      else others.push(p);
    }
    recent.sort((a, b) => recentIds.indexOf(String(a.id)) - recentIds.indexOf(String(b.id)));
    return { recentParties: recent, otherParties: others };
  }, [parties]);

  const validate = () => {
    const newErrors = {};
    if (!form.designNo.trim()) newErrors.designNo = 'Design Number is required';
    if (pickWorkspaceForNewLot && !String(form.saveBusinessOwnerId || '').trim()) {
      newErrors.saveBusinessOwnerId = 'Select a business collection for this lot';
    }
    if (isNewLot && bulkMode) {
      const count = Number(bulkCount);
      if (!Number.isFinite(count) || count < 2 || count > 100) {
        newErrors.bulkCount = 'Enter 2–100 lots';
      } else if (!bulkLotNumbers) {
        newErrors.lotNumber = 'Use a starting lot ending in digits (e.g. L-10)';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveOwnerForPayload = pickWorkspaceForNewLot
    ? String(form.saveBusinessOwnerId || '').trim()
    : initial?.businessOwnerId
      ? String(initial.businessOwnerId)
      : String(defaultNewLotOwnerId || '').trim();

  const handleSave = async () => {
    if (!validate()) return;
    
    const lotNumber = (form.lotNumber || form.lotNo || '').trim();
    if (!lotNumber) {
      const confirm = await Swal.fire({
        title: 'Save without Lot Number?',
        text: 'You have not entered a lot number. Are you sure you want to save this work as unnumbered?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Yes, save without number',
        cancelButtonText: 'Cancel'
      });
      if (!confirm.isConfirmed) return;
    }
    
    const finalType = form.itemType === '__custom' ? form.customFabric : form.itemType;
    let finalDupattaDetails = form.dupattaDetails;
    if (form.suitType === '3-piece') {
      const dFinalType = form.dupattaDetails.itemType === '__custom' ? form.dupattaDetails.customFabric : form.dupattaDetails.itemType;
      finalDupattaDetails = {
        ...form.dupattaDetails,
        fabric: dFinalType,
        itemType: dFinalType,
      };
    }

    const quantityValue = Number(form.quantity || form.pieces || 0);
    const selectedParty = parties.find((p) => p.id === form.partyId);
    const partyName = selectedParty?.name || form.partyName || '';
    const partyId = form.partyId || '';

    let syncMainLotPieces = false;
    if (initial && (initial.suitType === '3-piece' || form.suitType === '3-piece')) {
      const initialPieces = Number(initial.quantity || initial.pieces || 0);
      if (quantityValue !== initialPieces) {
        if (initial.suitComponent === 'main' || !initial.suitComponent) {
          const dQty = Number(finalDupattaDetails.quantity || 0);
          if (dQty !== quantityValue && form.suitType === '3-piece') {
            const res = await Swal.fire({
              title: 'Sync Dupatta Pieces?',
              text: `You changed the Main lot pieces to ${quantityValue}. Do you want to automatically update the Dupatta lot pieces to ${quantityValue} as well?`,
              icon: 'question',
              showCancelButton: true,
              confirmButtonText: 'Yes, update Dupatta too',
              cancelButtonText: 'No, leave it as is'
            });
            if (res.isConfirmed) {
              finalDupattaDetails.quantity = String(quantityValue);
            }
          }
        } else if (initial.suitComponent === 'dupatta') {
          const res = await Swal.fire({
            title: 'Sync Main Lot Pieces?',
            text: `You changed the Dupatta pieces to ${quantityValue}. Do you want to automatically update the Main lot pieces to ${quantityValue} as well?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, update Main lot too',
            cancelButtonText: 'No, leave it as is'
          });
          if (res.isConfirmed) {
            syncMainLotPieces = true;
          }
        }
      }
    }

    const basePayload = {
      ...form,
      saveBusinessOwnerId: saveOwnerForPayload,
      fabric: finalType,
      itemType: finalType,
      quantity: quantityValue,
      pieces: quantityValue,
      rate: 0,
      billAmount: Number(form.billAmount || 0),
      unit: form.unit || 'pieces',
      partyId,
      partyName,
      machineHead: selectedHead,
      suitType: form.suitType,
      isRework: form.isRework,
      ...(form.suitType === '3-piece'
        ? {
            dupattaDetails: finalDupattaDetails,
            ownerBillingChoice: form.ownerBillingChoice,
          }
        : {}),
      ...(syncMainLotPieces ? { syncMainLotPieces } : {})
    };

    if (isNewLot && bulkMode && bulkLotNumbers && bulkLotNumbers.length > 1) {
      await onSave({
        ...basePayload,
        status: 'pending',
        bulkLotNumbers,
      });
      return;
    }

    await onSave({
      ...basePayload,
      lotNumber,
      lotNo: lotNumber,
    });
  };

  const saveButtonLabel = (() => {
    if (saving) return 'Saving…';
    if (isNewLot && bulkMode && bulkLotNumbers && bulkLotNumbers.length > 1) {
      return `Save ${bulkLotNumbers.length} lots`;
    }
    return 'Save Lot';
  })();

  const compactToolbar = (
    <div
      style={{
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 10px',
        alignItems: 'center',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 700, color: '#94a3b8' }}>Head</span>
      {headList.map((h) => {
        const active = selectedHead === h;
        const isDefault = headConfig.defaultHead === h;
        return (
          <button
            key={h}
            type="button"
            title={isDefault ? 'Default head' : `Use ${h} heads per color`}
            onClick={() => selectHead(h)}
            style={{
              padding: '3px 9px',
              borderRadius: 6,
              border: active ? '1px solid #4f46e5' : '1px solid #e2e8f0',
              background: active ? '#eef2ff' : '#fff',
              color: active ? '#3730a3' : '#475569',
              fontWeight: active ? 800 : 600,
              fontSize: 12,
              cursor: 'pointer',
              lineHeight: 1.3,
            }}
          >
            {h}
            {isDefault ? '·' : ''}
          </button>
        );
      })}
      <button
        type="button"
        title="Add custom head"
        onClick={() => setShowHeadAdd((v) => !v)}
        style={{
          padding: '3px 8px',
          borderRadius: 6,
          border: '1px dashed #cbd5e1',
          background: '#fff',
          color: '#64748b',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        +
      </button>
      {showHeadAdd ? (
        <>
          <input
            type="number"
            min={1}
            value={customHeadInput}
            onChange={(e) => setCustomHeadInput(e.target.value)}
            placeholder="#"
            style={{
              width: 48,
              padding: '3px 6px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px', fontSize: 11 }}
            onClick={addCustomHead}
          >
            Add
          </button>
          {selectedHead !== headConfig.defaultHead ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11 }}
              title={`Set ${selectedHead} as default`}
              onClick={() => makeDefaultHead(selectedHead)}
            >
              Default {selectedHead}
            </button>
          ) : null}
          {!BASE_MACHINE_HEADS.includes(selectedHead) ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 8px', fontSize: 11, color: '#dc2626' }}
              title={`Delete custom head ${selectedHead}`}
              onClick={() => removeCustomHead(selectedHead)}
            >
              Delete {selectedHead}
            </button>
          ) : null}
        </>
      ) : null}

      {isNewLot ? (
        <>
          <span style={{ color: '#e2e8f0', userSelect: 'none' }}>|</span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              color: '#475569',
              fontWeight: 600,
            }}
          >
            <input
              type="checkbox"
              checked={bulkMode}
              onChange={(e) => setBulkMode(e.target.checked)}
            />
            Serial lots
          </label>
          {bulkMode ? (
            <>
              <input
                type="number"
                min={2}
                max={100}
                value={bulkCount}
                onChange={(e) => setBulkCount(e.target.value)}
                title="How many lots"
                style={{
                  width: 52,
                  padding: '3px 6px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: errors.bulkCount ? '1px solid #dc2626' : '1px solid #e2e8f0',
                }}
              />
              {bulkLotNumbers && bulkLotNumbers.length > 1 ? (
                <span
                  style={{
                    color: '#94a3b8',
                    fontSize: 11,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {previewSerialLotNumbers(bulkLotNumbers, 3)}
                </span>
              ) : null}
            </>
          ) : null}
          {errors.bulkCount ? (
            <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.bulkCount}</span>
          ) : null}
          {bulkMode && !bulkLotNumbers && form.lotNumber.trim() ? (
            <span style={{ color: '#b45309', fontSize: 11 }}>Lot needs digits</span>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      {compactToolbar}

      {/* Linked Lot Navigation */}
      {!isNewLot && form.linkedLotId && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#4f46e5', fontWeight: 600, background: '#eef2ff' }}
            onClick={() => onJumpToLinkedLot && onJumpToLinkedLot(form.linkedLotId)}
          >
            {form.suitComponent === 'dupatta' ? '🔗 View Main Lot' : '🔗 View Dupatta'}
          </button>
        </div>
      )}
      
      {/* Suit Type & Rework Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {(!initial || initial.suitComponent !== 'dupatta') && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {['2-piece', '3-piece', 'dupatta-only'].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => set('suitType', type)}
                style={{
                  flex: 1,
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: form.suitType === type ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                  backgroundColor: form.suitType === type ? '#eef2ff' : 'transparent',
                  color: form.suitType === type ? '#3730a3' : '#475569',
                  fontWeight: form.suitType === type ? '600' : '400',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s'
                }}
              >
                {type === '2-piece' ? '2-Piece' : type === '3-piece' ? '3-Piece' : 'Dupatta Only'}
              </button>
            ))}
          </div>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.isRework}
            onChange={(e) => set('isRework', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#b45309' }}
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
          Mark as Rework / Claim
        </label>
      </div>

      <div className="grid-2">
        {pickWorkspaceForNewLot && (
          <FormGroup label="Business collection *">
            <select
              className={`form-select${errors.saveBusinessOwnerId ? ' input-error' : ''}`}
              value={form.saveBusinessOwnerId}
              onChange={(e) => set('saveBusinessOwnerId', e.target.value)}
            >
              <option value="">— Select collection —</option>
              {(workspaceOwnerOptions || []).map((o) => (
                <option key={o.id || o._id} value={String(o.id || o._id)}>
                  {o.name}
                </option>
              ))}
            </select>
            {errors.saveBusinessOwnerId && (
              <span style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}>
                {errors.saveBusinessOwnerId}
              </span>
            )}
          </FormGroup>
        )}
        <FormGroup label={isNewLot && bulkMode ? 'Starting lot number' : 'Lot Number'}>
          <input
            className={`form-input${errors.lotNumber ? ' input-error' : ''}`}
            value={form.lotNumber}
            onChange={(e) => {
              const v = e.target.value;
              set('lotNumber', v);
              set('lotNo', v);
            }}
            placeholder={isNewLot && bulkMode ? 'e.g. L-10 (serials from here)' : 'e.g. L-10 (Leave blank if unnumbered)'}
            autoComplete="off"
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
          {!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId && (
            <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
              Edit from the Main Lot to change the suit&apos;s Lot Number.
            </span>
          )}
        </FormGroup>
        <FormGroup label="Design Number *">
          <input
            className={`form-input${errors.designNo ? ' input-error' : ''}`}
            value={form.designNo}
            onChange={(e) => set('designNo', e.target.value)}
            placeholder="e.g. D-101"
            autoComplete="off"
            spellCheck={false}
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
          {errors.designNo && (
            <span style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}>
              {errors.designNo}
            </span>
          )}
        </FormGroup>
        <FormGroup label="Description">
          <input
            className="form-input"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. Floral Print"
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
        </FormGroup>
        <FormGroup label="Fabric">
          <select
            className="form-select"
            value={form.itemType}
            onChange={(e) => set('itemType', e.target.value)}
          >
            {itemTypeOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="__custom">+ New fabric…</option>
          </select>
          {form.itemType === '__custom' && (
            <input
              className="form-input"
              style={{ marginTop: 6 }}
              value={form.customFabric}
              onChange={(e) => set('customFabric', e.target.value)}
              placeholder="Enter new fabric"
            />
          )}
        </FormGroup>
        <FormGroup label="Colors (0–12)">
          <select
            className="form-select"
            value={form.colors}
            onChange={(e) => setColorsAndPieces(e.target.value)}
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          >
            {COLOR_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} color{n !== 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </FormGroup>
        <FormGroup label="Pieces">
          <input
            className="form-input"
            type="number"
            min="0"
            value={form.pieces}
            onChange={(e) => set('pieces', e.target.value)}
            placeholder="0"
          />
        </FormGroup>
        <FormGroup label="Allot Date">
          <input
            className="form-input"
            type="date"
            value={form.allotDate}
            onChange={(e) => set('allotDate', e.target.value)}
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
        </FormGroup>
        <FormGroup label="Party">
          <select
            className="form-select"
            value={form.partyId}
            autoFocus={!initial}
            onChange={(e) => {
              const selectedParty = parties.find((p) => p.id === e.target.value);
              set('partyId', e.target.value);
              set('partyName', selectedParty ? selectedParty.name : '');
            }}
          >
            <option value="">— Select Party —</option>
            {recentParties.length > 0 && (
              <optgroup label="Recent">
                {recentParties.map((p) => (
                  <option key={`recent-${p.id}`} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={recentParties.length > 0 ? 'All parties' : 'Parties'}>
              {(recentParties.length > 0 ? otherParties : parties).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </FormGroup>
        {!(isNewLot && bulkMode) && (
          <FormGroup label="Status">
            <select
              className="form-select"
              style={
                form.status === 'completed'
                  ? { backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0', fontWeight: '600' }
                  : {}
              }
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s
                    .split(' ')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                </option>
              ))}
            </select>
          </FormGroup>
        )}
        <FormGroup label="Bill Amount (₨)">
          <input
            className="form-input"
            type="number"
            min="0"
            value={form.billAmount}
            onChange={(e) => set('billAmount', e.target.value)}
            placeholder="45000"
          />
        </FormGroup>
        {/* <FormGroup label="Notes">
          <input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes" />
        </FormGroup> */}
        {(form.status === 'dispatched' ||
          form.status === 'received back' ||
          form.status === 'completed') && (
            <FormGroup label="Dispatch Date">
              <input
                className="form-input"
                type="date"
                value={form.dispatchDate}
                onChange={(e) => set('dispatchDate', e.target.value)}
              />
            </FormGroup>
          )}
        {(form.status === 'received back' || form.status === 'completed') && (
          <FormGroup label="Received Back Date">
            <input
              className="form-input"
              type="date"
              value={form.receivedBackDate}
              onChange={(e) => set('receivedBackDate', e.target.value)}
            />
          </FormGroup>
        )}
      </div>

      {/* Dupatta Details Section for 3-Piece */}
      {(!initial || initial.suitComponent !== 'dupatta') && (
        <div 
          style={{
            display: 'grid',
            gridTemplateRows: form.suitType === '3-piece' ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1), margin-top 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            marginTop: form.suitType === '3-piece' ? 24 : 0,
            opacity: form.suitType === '3-piece' ? 1 : 0,
            pointerEvents: form.suitType === '3-piece' ? 'auto' : 'none',
          }}
        >
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: 16,
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                transform: form.suitType === '3-piece' ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
          <h4 style={{ margin: '0 0 16px 0', color: '#334155', fontSize: 15, fontWeight: 700 }}>Dupatta Details</h4>
          <div className="grid-2">
            <FormGroup label="Dupatta Party">
                <select
                  className="form-select"
                  value={form.dupattaDetails.partyId}
                  onChange={(e) => {
                    const selectedParty = parties.find(p => p.id === e.target.value);
                    set('dupattaDetails', {
                      ...form.dupattaDetails,
                      partyId: e.target.value,
                      partyName: selectedParty ? selectedParty.name : ''
                    });
                  }}
                >
                  <option value="">— Select Party —</option>
                  {recentParties.length > 0 && (
                    <optgroup label="Recent">
                      {recentParties.map((p) => (
                        <option key={`dupatta-recent-${p.id}`} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={recentParties.length > 0 ? 'All parties' : 'Parties'}>
                    {(recentParties.length > 0 ? otherParties : parties).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </FormGroup>
            
            <FormGroup label="Fabric">
              <select
                className="form-select"
                value={form.dupattaDetails.itemType}
                onChange={(e) => set('dupattaDetails', { ...form.dupattaDetails, itemType: e.target.value })}
              >
                <option value="">— Select Fabric —</option>
                {itemTypeOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
                <option value="__custom">+ New fabric…</option>
              </select>
              {form.dupattaDetails.itemType === '__custom' && (
                <input
                  className="form-input"
                  style={{ marginTop: 6 }}
                  value={form.dupattaDetails.customFabric}
                  onChange={(e) => set('dupattaDetails', { ...form.dupattaDetails, customFabric: e.target.value })}
                  placeholder="Enter new fabric"
                />
              )}
            </FormGroup>

            <FormGroup label="Quantity / Pieces">
              <input
                className="form-input"
                type="number"
                min="0"
                value={form.dupattaDetails.quantity !== '' ? form.dupattaDetails.quantity : form.pieces}
                onChange={(e) => set('dupattaDetails', { ...form.dupattaDetails, quantity: e.target.value })}
                placeholder="0"
              />
            </FormGroup>

            {form.ownerBillingChoice === 'separate' && (
              <FormGroup label="Dupatta Owner Bill (₨)">
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  value={form.dupattaDetails.billAmount || ''}
                  onChange={(e) => set('dupattaDetails', { ...form.dupattaDetails, billAmount: e.target.value })}
                  placeholder="e.g. 5000"
                />
              </FormGroup>
            )}
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed #cbd5e1' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: 13, color: '#475569' }}>Owner Billing Preference</h5>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => set('ownerBillingChoice', 'separate')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: form.ownerBillingChoice === 'separate' ? '1px solid #10b981' : '1px solid #e2e8f0',
                  background: form.ownerBillingChoice === 'separate' ? '#ecfdf5' : '#fff',
                  color: form.ownerBillingChoice === 'separate' ? '#065f46' : '#64748b',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ marginBottom: 4 }}>Separate Bills</div>
                <div style={{ fontSize: '10px', fontWeight: 400 }}>Main & Dupatta lots will each bill the owner their respective amounts.</div>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (form.ownerBillingChoice === 'combined') return;
                  const dupattaBill = Number(form.dupattaDetails.billAmount) || 0;
                  if (dupattaBill > 0) {
                    const result = await Swal.fire({
                      title: 'Combine Bills?',
                      text: `Do you want to add the Dupatta bill (Rs ${dupattaBill}) to the Main lot bill? The Dupatta bill will be set to 0.`,
                      icon: 'question',
                      showCancelButton: true,
                      confirmButtonText: 'Yes, Combine',
                      cancelButtonText: 'Cancel'
                    });
                    if (result.isConfirmed) {
                      setForm(f => ({
                        ...f,
                        ownerBillingChoice: 'combined',
                        billAmount: (Number(f.billAmount) || 0) + dupattaBill,
                        dupattaDetails: { ...f.dupattaDetails, billAmount: 0 }
                      }));
                    }
                  } else {
                    set('ownerBillingChoice', 'combined');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: form.ownerBillingChoice === 'combined' ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                  background: form.ownerBillingChoice === 'combined' ? '#fffbeb' : '#fff',
                  color: form.ownerBillingChoice === 'combined' ? '#92400e' : '#64748b',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ marginBottom: 4 }}>Combined Bill</div>
                <div style={{ fontSize: '10px', fontWeight: 400 }}>Main lot will combine both bills. Dupatta lot will show ₨0 for owner.</div>
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
      )}

      <div
        className="modal-footer"
        style={{ padding: '16px 0 0', borderTop: '1px solid var(--border)', marginTop: 24 }}
      >
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {saving ? (
            <>
              <Loader /> Saving…
            </>
          ) : (
            saveButtonLabel
          )}
        </button>
      </div>
    </form>
  );
}

export default function GhausiaCollection() {
  const location = useLocation();
  const {
    ghausiaLots,
    reportingLots,
    reportingPayments,
    reportingPartyEdits,
    addLot,
    updateLot,
    deleteLot,
    parties,
    getPartyName,
    partyEdits: partyEditsSingleWorkspace,
    payments: paymentsSingleWorkspace,
    addPayment,
    deletePayment,
    updatePartyEdit,
    initialDataLoading,
    scopedDataLoading,
    activeBusinessOwnerId,
    businessOwners,
    viewAllWorkspaces,
  } = useApp();

  const collectionLots = useMemo(
    () => (viewAllWorkspaces ? reportingLots : ghausiaLots),
    [viewAllWorkspaces, reportingLots, ghausiaLots]
  );
  const payments = useMemo(
    () => (viewAllWorkspaces ? reportingPayments : paymentsSingleWorkspace),
    [viewAllWorkspaces, reportingPayments, paymentsSingleWorkspace]
  );
  const partyEdits = useMemo(
    () => (viewAllWorkspaces ? reportingPartyEdits : partyEditsSingleWorkspace),
    [viewAllWorkspaces, reportingPartyEdits, partyEditsSingleWorkspace]
  );

  /** API business owner id for a row (critical when viewing all workspaces) */
  const lotBizId = (lot) => String(lot?.businessOwnerId ?? activeBusinessOwnerId ?? '').trim();
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lotSaving, setLotSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [stuckLotIdsFilter, setStuckLotIdsFilter] = useState([]);
  const [partyFilter, setPartyFilter] = useState('All');
  const [dateRange, setDateRange] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showSummaryCards, setShowSummaryCards] = useState(() => {
    return localStorage.getItem('hideLedgerSummary') !== 'true';
  });
  const customRange = useMemo(
    () => ({ start: customStart, end: customEnd }),
    [customStart, customEnd]
  );
  const [lotTableTab, setLotTableTab] = useState('others');
  const [viewMode, setViewMode] = useState('tile');
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    type: 'Received',
    amount: '',
    party: 'Owner',
    date: '',
    note: '',
    linkedLot: '',
  });
  const [payErrors, setPayErrors] = useState({});
  const [completeBillModal, setCompleteBillModal] = useState(null);
  const [completeBillInput, setCompleteBillInput] = useState('');
  const [completeBillError, setCompleteBillError] = useState('');
  const completeBillResolveRef = useRef(null);
  const [completionPersistingLotId, setCompletionPersistingLotId] = useState(null);
  /** Lots currently being completed/settled — blocks a second concurrent trigger (no double entry). */
  const completingLotsRef = useRef(new Set());
  const [inlineSummaryBusy, setInlineSummaryBusy] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [billableCollapsed, setBillableCollapsed] = useState(false);
  const [billableSearch, setBillableSearch] = useState('');
  const [debouncedBillableSearch, setDebouncedBillableSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBillableSearch(billableSearch), 300);
    return () => clearTimeout(timer);
  }, [billableSearch]);
  const [billablePage, setBillablePage] = useState(1);
  const BILLABLE_PAGE_SIZE = 5;
  /** Instant UI while complete/settle API calls finish (removed when server state catches up). */
  const [optimisticCompletions, setOptimisticCompletions] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      setModal('form');
    }
    if (params.get('status')) {
      setStatusFilter(params.get('status'));
    }
  }, [location.search]);

  const effectiveCollectionLots = useMemo(() => {
    if (!Object.keys(optimisticCompletions).length) return collectionLots;
    return collectionLots.map((l) => {
      const opt = optimisticCompletions[String(l.id)];
      return opt?.lotPatch ? { ...l, ...opt.lotPatch } : l;
    });
  }, [collectionLots, optimisticCompletions]);

  const effectivePayments = useMemo(() => {
    const pending = Object.values(optimisticCompletions)
      .map((o) => o.payment)
      .filter(Boolean);
    if (!pending.length) return payments;
    return [...payments, ...pending];
  }, [payments, optimisticCompletions]);

  const clearOptimisticCompletion = (lotKey) => {
    setOptimisticCompletions((prev) => {
      if (!prev[lotKey]) return prev;
      const next = { ...prev };
      delete next[lotKey];
      return next;
    });
  };

  const _statusMeta = {
    pending: { className: 'badge badge-pending', label: 'Pending' },
    dispatched: { className: 'badge badge-dispatched', label: 'Dispatched' },
    'received back': { className: 'badge badge-received', label: 'Received Back' },
    completed: { className: 'badge badge-completed', label: 'Completed' },
    'in progress': { className: 'badge badge-inprogress', label: 'In Progress' },
    'pending approval': { className: 'badge badge-inprogress', label: 'Awaiting approval' },
    rejected: { className: 'badge badge-dispatched', label: 'Rejected' },
  };

  const activeWorkspace = useMemo(() => {
    if (viewAllWorkspaces) return { name: 'All workspaces' };
    return businessOwners.find((o) => String(o.id || o._id) === String(activeBusinessOwnerId));
  }, [businessOwners, activeBusinessOwnerId, viewAllWorkspaces]);

  const dismissCompleteBillModal = () => {
    const resolve = completeBillResolveRef.current;
    completeBillResolveRef.current = null;
    setCompleteBillModal(null);
    setCompleteBillInput('');
    setCompleteBillError('');
    if (resolve) resolve(null);
  };

  const confirmCompleteBillModal = () => {
    const n = Number(completeBillInput);
    if (completeBillInput === '' || Number.isNaN(n) || n <= 0) {
      setCompleteBillError('Enter a valid amount greater than zero');
      return;
    }
    const resolve = completeBillResolveRef.current;
    completeBillResolveRef.current = null;
    setCompleteBillModal(null);
    setCompleteBillInput('');
    setCompleteBillError('');
    if (resolve) resolve(n);
  };

  const promptBillAmountForCompletion = (lot, options = {}) =>
    new Promise((resolve) => {
      const effective = getAdminLedgerOrBusinessBill(lot, partyEdits[lot.id] || {});
      const ov = options.billAmountOverride;
      const rawBill =
        ov !== undefined && ov !== null ? Number(ov) : Number(effective || lot.billAmount || 0);
      completeBillResolveRef.current = resolve;
      setCompleteBillInput(rawBill > 0 ? String(rawBill) : '');
      setCompleteBillError('');
      setCompleteBillModal({
        lot,
        fromBillable: !!options.fromBillable,
        billAmountOverride: options.billAmountOverride,
      });
    });

  const persistLotCompletedWithPayment = async (lot, billAmount, options = {}) => {
    const { fromBillable = false } = options;
    const lotKey = String(lot.id);
    // Guard against double submission (rapid clicks / a stale re-render re-triggering) which
    // would create a duplicate Owner payment.
    if (completingLotsRef.current.has(lotKey)) return;
    completingLotsRef.current.add(lotKey);
    setCompletionPersistingLotId(lot.id);

    const today = new Date().toISOString().slice(0, 10);
    const lotUpdate = {
      status: 'completed',
      receivedBackDate: today,
      billAmount:
        fromBillable && partyEdits[lot.id]?.amountChangeNote
          ? Number(lot.billAmount || 0)
          : billAmount,
      ...(fromBillable ? { completedFromBillable: false } : {}),
    };
    const linkedLot = String(lot.lotNumber || lot.lotNo || '').trim();
    const partyName =
      (lot.partyName && String(lot.partyName).trim()) ||
      (lot.partyId ? getPartyName(lot.partyId) : '') ||
      '';
    const designNo = String(lot.designNo || '').trim() || '—';
    const optimisticPayment = {
      id: `optimistic-${lotKey}-${Date.now()}`,
      type: fromBillable ? 'Paid' : 'Received',
      amount: Number(billAmount),
      party: 'Owner',
      date: today,
      linkedLot,
      note: fromBillable
        ? `Billable lot settled — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lot.itemType || lot.fabric || '—'}`
        : `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lot.itemType || lot.fabric || '—'}`,
      businessOwnerId: lotBizId(lot),
    };

    setOptimisticCompletions((prev) => ({
      ...prev,
      [lotKey]: { lotPatch: lotUpdate, payment: optimisticPayment },
    }));

    try {
      try {
        await updateLot(lot.id, lotUpdate, { businessOwnerId: lotBizId(lot) });
      } catch (e) {
        clearOptimisticCompletion(lotKey);
        Swal.fire({ icon: 'error', title: 'Could not update lot', text: 'Please try again.' });
        return;
      }

      const partyEditPromise = updatePartyEdit(
        lot.id,
        {
          overrideStatus: 'Completed',
          completeDate: today,
        },
        { businessOwnerId: lotBizId(lot) }
      ).catch((_e) => {
        console.error(_e);
      });

      const paymentPromise = (
        fromBillable
          ? recordOwnerBillableSettlementPayment({ ...lot, ...lotUpdate }, billAmount, today)
          : recordOwnerReceivedForCompletedLot({ ...lot, ...lotUpdate }, billAmount, today)
      ).catch(() => {
        Swal.fire({
          icon: 'warning',
          title: 'Lot updated; payment failed',
          text: fromBillable
            ? 'The lot was marked completed, but saving the settlement payment failed. Add a Paid → Owner entry from Payment Management if needed.'
            : 'The lot was marked completed with a bill amount, but saving the owner payment failed. Add it manually from Payment Management if needed.',
        });
      });

      await Promise.all([partyEditPromise, paymentPromise]);
    } finally {
      completingLotsRef.current.delete(lotKey);
      setCompletionPersistingLotId(null);
      clearOptimisticCompletion(lotKey);
    }
  };

  const handleCompleteFromBillable = async (lot) => {
    const amount = await promptBillAmountForCompletion(lot, {
      fromBillable: true,
      billAmountOverride: getOwnerBillableAmount(lot),
    });
    if (amount == null) return;
    await persistLotCompletedWithPayment(lot, amount, { fromBillable: true });
  };

  const recordOwnerReceivedForCompletedLot = async (lotRef, amount, paymentDate) => {
    const linkedLot = String(lotRef.lotNumber || lotRef.lotNo || '').trim();
    const partyName =
      (lotRef.partyName && String(lotRef.partyName).trim()) ||
      (lotRef.partyId ? getPartyName(lotRef.partyId) : '') ||
      '';
    const designNo = String(lotRef.designNo || '').trim() || '—';
    await addPayment(
      {
        type: 'Received',
        amount: Number(amount),
        party: 'Owner',
        date: paymentDate,
        linkedLot,
        note: `Lot completed — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lotRef.itemType || lotRef.fabric || '—'}`,
      },
      { businessOwnerId: lotBizId(lotRef) }
    );
  };

  /** Settlement for billable lots: records Paid → Owner so it appears in Payment Management and reduces Owner Received net. */
  const recordOwnerBillableSettlementPayment = async (lotRef, amount, paymentDate) => {
    const linkedLot = String(lotRef.lotNumber || lotRef.lotNo || '').trim();
    const partyName =
      (lotRef.partyName && String(lotRef.partyName).trim()) ||
      (lotRef.partyId ? getPartyName(lotRef.partyId) : '') ||
      '';
    const designNo = String(lotRef.designNo || '').trim() || '—';
    await addPayment(
      {
        type: 'Paid',
        amount: Number(amount),
        party: 'Owner',
        date: paymentDate,
        linkedLot,
        note: `Billable lot settled — Party: ${partyName || '—'}; Design: ${designNo}; Type: ${lotRef.itemType || lotRef.fabric || '—'}`,
      },
      { businessOwnerId: lotBizId(lotRef) }
    );
  };

  const setLotStatus = async (lot, newStatus) => {
    if (newStatus === 'dispatched' && !lot.partyId) {
      Swal.fire({ icon: 'warning', title: 'Select a Party', text: 'You must assign a party before dispatching this lot.' });
      return;
    }
    if (newStatus === 'completed') {
      const amount = await promptBillAmountForCompletion(lot);
      if (amount == null) return;
      await persistLotCompletedWithPayment(lot, amount);
      return;
    }

    setInlineSummaryBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const lotUpdate = { status: newStatus };
      if (newStatus === 'dispatched') lotUpdate.dispatchDate = today;
      if (newStatus === 'received back') lotUpdate.receivedBackDate = today;

      try {
        await updateLot(lot.id, lotUpdate, { businessOwnerId: lotBizId(lot) });
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not update lot', text: 'Please try again.' });
        return;
      }

      const ledgerStatus = newStatus === 'dispatched' ? 'In Progress' : newStatus;
      try {
        await updatePartyEdit(
          lot.id,
          {
            overrideStatus: ledgerStatus,
            completeDate: '',
          },
          { businessOwnerId: lotBizId(lot) }
        );
      } catch (e) {
        console.error(e);
      }
    } finally {
      setInlineSummaryBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const list = effectiveCollectionLots.filter((l) => {
      const q = debouncedSearch.toLowerCase();
      const lotLabel = (l.lotNumber || l.lotNo || '').toLowerCase();
      const matchQ =
        !q ||
        lotLabel.includes(q) ||
        String(l.designNo || '')
          .toLowerCase()
          .includes(q) ||
        String(l.description || '')
          .toLowerCase()
          .includes(q);
      if (!matchQ) return false;
      if (partyFilter !== 'All' && String(l.partyId || '') !== String(partyFilter)) return false;
      if (stuckLotIdsFilter.length > 0 && !stuckLotIdsFilter.includes(String(l.id))) return false;
      if (
        !isWithinDateRange(
          latestDateFrom(l, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
          ]),
          dateRange,
          customRange
        )
      )
        return false;
      if (lotTableTab === 'completed') return l.status === 'completed';
      if (l.status === 'completed') return false;
      return statusFilter === 'All' || l.status === statusFilter;
    });
    return [...list].sort((a, b) => compareRowsByUpdatedNewestFirst(a, b, 'lot'));
  }, [
    effectiveCollectionLots,
    debouncedSearch,
    partyFilter,
    dateRange,
    customRange,
    statusFilter,
    stuckLotIdsFilter,
    lotTableTab,
  ]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedLots = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, partyFilter, dateRange, customRange, statusFilter, stuckLotIdsFilter, lotTableTab, viewAllWorkspaces]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleLots = useMemo(
    () =>
      effectiveCollectionLots.filter((l) => {
        if (partyFilter !== 'All' && String(l.partyId || '') !== String(partyFilter)) return false;
        if (stuckLotIdsFilter.length > 0 && !stuckLotIdsFilter.includes(String(l.id))) return false;
        return isWithinDateRange(
          latestDateFrom(l, [
            'updatedAt',
            'createdAt',
            'receivedBackDate',
            'dispatchDate',
            'allotDate',
            'receivedDate',
          ]),
          dateRange,
          customRange
        );
      }),
    [effectiveCollectionLots, partyFilter, dateRange, customRange, stuckLotIdsFilter]
  );

  const completedLotsCount = useMemo(
    () => visibleLots.filter((l) => l.status === 'completed').length,
    [visibleLots]
  );
  const otherLotsCount = visibleLots.length - completedLotsCount;
  const othersTabStatusLabel =
    statusFilter === 'All'
      ? 'Others'
      : statusFilter
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  const othersTabCount = useMemo(() => {
    if (statusFilter === 'All') return otherLotsCount;
    return visibleLots.filter((l) => l.status === statusFilter).length;
  }, [visibleLots, statusFilter, otherLotsCount]);
  const othersTabHint =
    statusFilter === 'All'
      ? 'Pending, dispatched, and received back (not completed)'
      : `${othersTabStatusLabel} lots in the current filters`;

  const billable = useMemo(
    () =>
      [...visibleLots.filter((l) => l.status === 'received back')].sort((a, b) =>
        compareRowsByUpdatedNewestFirst(a, b, 'lot')
      ),
    [visibleLots]
  );
  /**
   * Amount billable to owner: workspace lot bill only (not party ledger `partyBillAmount`).
   * Party-facing figures stay on Party Ledger; this page’s owner tiles use the business-defined amount.
   */
  const getOwnerBillableAmount = (lot) => getBusinessBillAmount(lot);
  const billableTotal = billable.reduce((s, l) => s + getOwnerBillableAmount(l), 0);

  const billableFiltered = useMemo(() => {
    const q = debouncedBillableSearch.trim().toLowerCase();
    if (!q) return billable;
    return billable.filter((l) => {
      const lotNo = String(l.lotNumber || l.lotNo || '').toLowerCase();
      const design = String(l.designNo || '').toLowerCase();
      const party = String(l.partyName || '').toLowerCase();
      return lotNo.includes(q) || design.includes(q) || party.includes(q);
    });
  }, [billable, debouncedBillableSearch]);

  const billablePageCount = Math.max(1, Math.ceil(billableFiltered.length / BILLABLE_PAGE_SIZE));
  const billableSafePage = Math.min(billablePage, billablePageCount);
  const billablePageItems = billableFiltered.slice(
    (billableSafePage - 1) * BILLABLE_PAGE_SIZE,
    billableSafePage * BILLABLE_PAGE_SIZE
  );

  useEffect(() => {
    setBillablePage(1);
  }, [debouncedBillableSearch]);

  useEffect(() => {
    if (billablePage > billablePageCount) setBillablePage(billablePageCount);
  }, [billablePage, billablePageCount]);
  const ownerIn = effectivePayments
    .filter((p) => p.type === 'Received')
    .reduce((s, p) => s + p.amount, 0);
  const ownerPaidToOwner = effectivePayments
    .filter((p) => p.type === 'Paid' && p.party === 'Owner')
    .reduce((s, p) => s + p.amount, 0);
  const billableSettledTotal = useMemo(
    () =>
      effectiveCollectionLots
        .filter((l) => l.status === 'completed' && l.completedFromBillable)
        .reduce((s, l) => s + Number(l.billAmount || 0), 0),
    [effectiveCollectionLots]
  );
  const ownerReceivedNet = ownerIn - ownerPaidToOwner - billableSettledTotal;
  const ownerReceivedIsPending = ownerReceivedNet < 0;
  const _partyOut = effectivePayments
    .filter((p) => p.type === 'Paid')
    .reduce((s, p) => s + p.amount, 0);
  const statsRefreshing = lotSaving || paymentSaving || deleteLoading || inlineSummaryBusy;

  const openEdit = (lot) => {
    let editPayload = lot;
    if (lot.suitType === '3-piece' && lot.suitComponent === 'main' && lot.linkedLotId) {
      const linkedDupatta = effectiveCollectionLots.find((l) => l.id === lot.linkedLotId || l._id === lot.linkedLotId);
      if (linkedDupatta) {
        editPayload = {
          ...lot,
          dupattaDetails: {
            partyId: linkedDupatta.partyId || '',
            partyName: linkedDupatta.partyName || '',
            fabric: linkedDupatta.fabric || '',
            itemType: linkedDupatta.itemType || linkedDupatta.fabric || '',
            customFabric: linkedDupatta.customFabric || '',
            quantity: linkedDupatta.quantity || '',
            billAmount: linkedDupatta.billAmount || '',
          }
        };
      }
    }
    setEditing(editPayload);
    setModal('form');
  };
  const openLinkedLot = (linkedId) => {
    const linked = effectiveCollectionLots.find((lot) => lot.id === linkedId || lot._id === linkedId);
    if (linked) {
      openEdit(linked);
    } else {
      Swal.fire({ icon: 'info', title: 'Not found', text: 'The linked lot could not be found in current collection.' });
    }
  };
  const openAdd = () => {
    setEditing(null);
    setModal('form');
  };

  const handleSave = async (form) => {
    if (form.status === 'dispatched' && !form.partyId) {
      Swal.fire({ icon: 'warning', title: 'Select a Party', text: 'You must select a party before dispatching this lot.' });
      return;
    }
    const bulkLotNumbers = Array.isArray(form.bulkLotNumbers) ? form.bulkLotNumbers : null;

    const prev = editing;
    const wasCompleted = prev?.status === 'completed';
    const nowCompleted = form.status === 'completed';
    const becomingCompleted = nowCompleted && !wasCompleted;
    let saveForm = { ...form };
    let recordOwnerPaymentAfterSave = false;

    if (bulkLotNumbers && bulkLotNumbers.length > 1 && !prev) {
      const targetBiz = String(form.saveBusinessOwnerId || activeBusinessOwnerId || '').trim();
      if (!targetBiz.trim()) {
        lotSaveErrorToast('Select a business collection before saving lots.');
        return;
      }

      const {
        saveBusinessOwnerId: _ignoreSaveOwner,
        bulkLotNumbers: _bulk,
        ...basePayload
      } = saveForm;
      const existingKeys = new Set(
        collectionLots
          .filter((l) => String(l.businessOwnerId ?? '') === targetBiz)
          .map((l) => normalizeLotNumberKey(l.lotNumber ?? l.lotNo))
      );

      setLotSaving(true);
      let created = 0;
      let skipped = 0;
      const failed = [];

      try {
        for (const lotNumber of bulkLotNumbers) {
          const lotKey = normalizeLotNumberKey(lotNumber);
          if (!lotKey) continue;
          if (existingKeys.has(lotKey)) {
            skipped += 1;
            continue;
          }
          try {
            await addLot(
              {
                ...basePayload,
                lotNumber,
                lotNo: lotNumber,
                status: 'pending',
              },
              { businessOwnerId: targetBiz }
            );
            existingKeys.add(lotKey);
            created += 1;
          } catch (e) {
            failed.push({ lotNumber, message: messageFromLotSaveError(e) });
          }
        }

        if (created === 0 && failed.length === 0) {
          lotSaveErrorToast(
            skipped > 0
              ? 'All lot numbers in this range already exist in this collection.'
              : 'No lots were saved. Check your lot numbers.'
          );
          return;
        }

        const parts = [`${created} lot${created === 1 ? '' : 's'} saved`];
        if (skipped > 0) parts.push(`${skipped} skipped (already exist)`);
        if (failed.length > 0) parts.push(`${failed.length} failed`);

        await Swal.fire({
          icon: failed.length > 0 ? 'warning' : 'success',
          title: 'Bulk save done',
          html: `<p style="margin:0 0 8px">${parts.join(' · ')}</p>${failed.length > 0
              ? `<p style="margin:0;font-size:13px;color:#64748b">${failed
                .slice(0, 5)
                .map((f) => `${f.lotNumber}: ${f.message}`)
                .join('<br/>')}${failed.length > 5 ? '<br/>…' : ''}</p>`
              : ''
            }`,
        });

        if (created > 0) {
          rememberLotFormSave(saveForm, { collectionId: targetBiz, bulkLotNumbers });
        }

        setModal(null);
        setEditing(null);
      } finally {
        setLotSaving(false);
      }
      return;
    }

    if (becomingCompleted && !hasPositiveBillAmount(saveForm)) {
      const lotForPrompt = prev ? { ...prev, ...saveForm } : saveForm;
      const amount = await promptBillAmountForCompletion(lotForPrompt);
      if (amount == null) return;
      saveForm = { ...saveForm, billAmount: amount };
      recordOwnerPaymentAfterSave = true;
    }

    const lotKey = normalizeLotNumberKey(saveForm.lotNumber ?? saveForm.lotNo);
    const targetBiz = prev
      ? lotBizId(prev)
      : String(form.saveBusinessOwnerId || activeBusinessOwnerId || '').trim();

    if (lotKey) {
      if (!targetBiz.trim()) {
        lotSaveErrorToast('Select a business collection before saving lots.');
        return;
      }
      const dupLocal = collectionLots.some((l) => {
        if (prev && String(l.id) === String(prev.id)) return false;
        if (String(l.businessOwnerId ?? '') !== targetBiz) return false;
        if (normalizeLotNumberKey(l.lotNumber ?? l.lotNo) !== lotKey) return false;
        
        // Allowed to have same lot number if they are different suit components or different rework status
        const thisSuitComp = saveForm.suitComponent || 'main';
        const thatSuitComp = l.suitComponent || 'main';
        const thisRework = Boolean(saveForm.isRework);
        const thatRework = Boolean(l.isRework);
        
        return thisSuitComp === thatSuitComp && thisRework === thatRework;
      });
      if (dupLocal) {
        lotSaveErrorToast(
          'A lot with this number already exists in this collection. Try a different number.'
        );
        return;
      }
    }

    const { saveBusinessOwnerId: _ignoreSaveOwner, ...lotPayloadForApi } = saveForm;

    const today = new Date().toISOString().slice(0, 10);
    setLotSaving(true);
    try {
      if (prev) {
        await updateLot(prev.id, lotPayloadForApi, { businessOwnerId: targetBiz });
        if (saveForm.status === 'completed') {
          await updatePartyEdit(
            prev.id,
            {
              overrideStatus: 'Completed',
              completeDate: today,
            },
            { businessOwnerId: targetBiz }
          );
        }
        if (recordOwnerPaymentAfterSave) {
          try {
            await recordOwnerReceivedForCompletedLot(
              { ...prev, ...saveForm, businessOwnerId: targetBiz },
              saveForm.billAmount,
              today
            );
          } catch (e) {
            Swal.fire({
              icon: 'warning',
              title: 'Lot saved; payment failed',
              text: 'Add the owner payment manually from Payment Management if needed.',
            });
          }
        }
      } else {
        const created = await addLot(lotPayloadForApi, { businessOwnerId: targetBiz });
        if (saveForm.status === 'completed') {
          await updatePartyEdit(
            created.id,
            {
              overrideStatus: 'Completed',
              completeDate: today,
            },
            { businessOwnerId: targetBiz }
          );
        }
        if (recordOwnerPaymentAfterSave) {
          try {
            await recordOwnerReceivedForCompletedLot(
              { ...created, ...saveForm, businessOwnerId: targetBiz },
              saveForm.billAmount,
              today
            );
          } catch (e) {
            Swal.fire({
              icon: 'warning',
              title: 'Lot saved; payment failed',
              text: 'Add the owner payment manually from Payment Management if needed.',
            });
          }
        }
      }
      rememberLotFormSave(saveForm, { collectionId: targetBiz });
      setModal(null);
      setEditing(null);
    } catch (e) {
      lotSaveErrorToast(messageFromLotSaveError(e));
    } finally {
      setLotSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteLot(deleteTarget.id, { businessOwnerId: lotBizId(deleteTarget) });
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handlePartyChange = async (lotId, partyId) => {
    setInlineSummaryBusy(true);
    try {
      const lot = collectionLots.find((l) => String(l.id) === String(lotId));
      const biz = lot ? lotBizId(lot) : String(activeBusinessOwnerId || '').trim();
      const currentDate = new Date().toISOString().slice(0, 10);
      const selectedParty = parties.find((p) => p.id === partyId);
      await updateLot(
        lotId,
        {
          partyId: partyId || '',
          partyName: selectedParty ? selectedParty.name : '',
          status: partyId ? 'dispatched' : 'pending',
          dispatchDate: partyId ? currentDate : '',
        },
        { businessOwnerId: biz }
      );
      if (partyId) {
        await updatePartyEdit(
          lotId,
          {
            overrideStatus: 'In Progress',
            allotDate: currentDate,
          },
          { businessOwnerId: biz }
        );
      }
    } finally {
      setInlineSummaryBusy(false);
    }
  };

  const validatePayForm = () => {
    const errs = {};
    if (!payForm.amount) errs.amount = 'Amount is required';
    if (!payForm.date) errs.date = 'Date is required';
    if (payForm.type === 'Paid' && !payForm.party) errs.party = 'Please select a party';
    setPayErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddPayment = async () => {
    if (!validatePayForm()) return;
    setPaymentSaving(true);
    try {
      await addPayment(
        {
          type: payForm.type,
          amount: Number(payForm.amount),
          party: payForm.party,
          date: payForm.date,
          linkedLot: payForm.linkedLot,
          note: payForm.note,
        },
        { businessOwnerId: activeBusinessOwnerId }
      );
      setPayModal(false);
      setPayErrors({});
      setPayForm({
        type: 'Received',
        amount: '',
        party: 'Owner',
        date: '',
        note: '',
        linkedLot: '',
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save payment. Please try again.',
      });
    } finally {
      setPaymentSaving(false);
    }
  };

  const _handleDeletePayment = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Payment?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
    });
    if (result.isConfirmed) {
      try {
        await deletePayment(id, { businessOwnerId: activeBusinessOwnerId });
      } catch (e) {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: String(e?.message || e || 'Could not delete payment'),
        });
      }
    }
  };

  if (initialDataLoading || (!viewAllWorkspaces && scopedDataLoading)) {
    return (
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <LoaderDashboard height={30} width={30} />
      </div>
    );
  }

  return (
    <div>
      <div
        className="ghausia-collection-page-hero"
        style={{
          marginBottom: 24,
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            padding: '22px 24px 18px',
          }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--primary)',
                marginBottom: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary-light), var(--primary))',
                  boxShadow: '0 0 0 3px var(--primary-bg)',
                }}
              />
              Workspace
            </div>
            <h1
              className="page-title"
              style={{
                fontSize: 'clamp(22px, 3vw, 30px)',
                fontWeight: 800,
                letterSpacing: '-0.04em',
                lineHeight: 1.15,
                margin: 0,
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
              }}
            >
              {activeWorkspace?.name || 'Select a workspace'}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                marginTop: 10,
                lineHeight: 1.5,
                maxWidth: 560,
              }}
            >
              {viewAllWorkspaces
                ? 'Showing lots across every workspace. Pick a single workspace here to anchor new payments and the add-lot flow, or use “Business collection” in the lot form when adding in this view.'
                : 'Manage design lots, statuses, and owner billing for this business. Use the dropdown below to switch workspace or view all workspaces.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={() => {
                const next = !showSummaryCards;
                setShowSummaryCards(next);
                localStorage.setItem('hideLotsSummary', !next ? 'true' : 'false');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: showSummaryCards ? '#475569' : '#1e40af',
                border: '1px solid var(--border)',
                background: showSummaryCards ? 'var(--surface-card, #ffffff)' : '#eff6ff',
                borderRadius: 20,
                padding: '5px 14px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease',
              }}
              title={showSummaryCards ? 'Hide summary stat cards for privacy' : 'Show summary stat cards'}
            >
              {showSummaryCards ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <span>Hide Summary</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Show Summary</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openAdd}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                fontWeight: 700,
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(30, 64, 175, 0.25)',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add lot
            </button>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: '14px 24px 18px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.85)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', width: '100%' }}>
            <span
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0, minWidth: '70px' }}
            >
              Workspace:
            </span>
            <div style={{ flex: '1 1 300px' }}>
              <BusinessOwnerSwitcher compact />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div style={{ position: 'relative', marginBottom: 22 }}>
        {statsRefreshing && (
          <div
            aria-busy="true"
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(2px)',
              borderRadius: 12,
              pointerEvents: 'none',
            }}
          >
            <Loader />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              Updating…
            </span>
          </div>
        )}
        {showSummaryCards && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
          {[
            { label: 'Total Lots', value: visibleLots.length, color: '#1e40af' },
            { label: 'Billable Lots', value: billable.length, color: '#dc2626' },
            {
              label: 'Billable Amount',
              value: `₨${billableTotal.toLocaleString()}`,
              color: '#dc2626',
            },
            {
              label: 'Received from Owner',
              value: ownerReceivedIsPending
                ? 'Pending to owner'
                : `₨${ownerReceivedNet.toLocaleString()}`,
              color: ownerReceivedIsPending ? '#d97706' : '#15803d',
            },
            {
              label: `${billableTotal - ownerReceivedNet >= 0 ? 'Receivable from Owner' : 'Advance from Owner'}`,
              value: `₨${(billableTotal - ownerReceivedNet).toLocaleString()}`,
              color: billableTotal - ownerReceivedNet >= 0 ? '#15803d' : '#dc2626',
            },
          ].map((c) => (
            <div key={c.label} className="stat-card">
              <div className="stat-label">{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Payment Panel */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div
          className="card-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span className="card-title">
            Billable lots to Owner
            {billable.length > 0 && (
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: '#92600A' }}>
                ({billable.length})
              </span>
            )}
          </span>
          {billable.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setBillableCollapsed((v) => !v)}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {billableCollapsed ? 'Show' : 'Hide'}
            </button>
          )}
        </div>
        {/* <div style={{ padding: 0 }}>
          {payments.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No payments yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom:10 }} className='table-wrapper'>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Party / From</th>
                    <th>Linked Lot</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{formatDisplayDate(p.date)}</td>
                      <td>
                        <span style={{
                          background: p.type === 'Received' ? '#F0FDF4' : '#FEF2F2',
                          color: p.type === 'Received' ? '#166534' : '#991B1B',
                          border: `1px solid ${p.type === 'Received' ? '#BBF7D0' : '#FECACA'}`,
                          borderRadius: 20, padding: '2px 10px', fontSize: 11.5, fontWeight: 600,
                        }}>{p.type}</span>
                      </td>
                      <td>{p.party}</td>
                      <td>{p.linkedLot || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.note}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.type === 'Received' ? '#15803d' : '#dc2626' }}>
                        ₨{p.amount.toLocaleString()}
                      </td>
                      <td>
                        <button className="btn-icon" onClick={() => _handleDeletePayment(p.id)} title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div> */}
        {billable.length > 0 && !billableCollapsed && (
          <div
            style={{
              margin: '0',
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92600A' }}>
                Billable to Owner — {billable.length} lots · Total: ₨
                {billableTotal.toLocaleString()}
              </div>
              <input
                type="text"
                value={billableSearch}
                onChange={(e) => setBillableSearch(e.target.value)}
                placeholder="Search lot, design, party…"
                style={{
                  fontSize: 12.5,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #FDE68A',
                  background: '#fff',
                  color: 'var(--text-primary)',
                  minWidth: 200,
                  flex: '0 1 240px',
                }}
              />
            </div>

            {billableFiltered.length === 0 ? (
              <div style={{ fontSize: 13, color: '#92600A', padding: '8px 0' }}>
                No billable lots match “{billableSearch}”.
              </div>
            ) : (
              <>
                {billablePageItems.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      fontSize: 13,
                      padding: '8px 0',
                      borderBottom: '1px solid #FDE68A',
                    }}
                  >
                    <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                      {l.lotNumber || l.lotNo} / {l.designNo} —{' '}
                      <span style={{ color: '#92600A' }}>{l.partyName || '—'}</span>
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {partyEdits[l.id]?.amountChangeNote ? (
                        <div style={{ textAlign: 'right', color: '#92600A' }}>
                          <strong>₨{getOwnerBillableAmount(l).toLocaleString()}</strong>
                          <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                            Party ledger: Previous ₨
                            {Number(
                              partyEdits[l.id].amountChangeNote.previousAmount || 0
                            ).toLocaleString()}{' '}
                            → Updated ₨
                            {Number(
                              partyEdits[l.id].amountChangeNote.updatedAmount || 0
                            ).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <strong style={{ color: '#92600A' }}>
                          ₨{getOwnerBillableAmount(l).toLocaleString()}
                        </strong>
                      )}
                      <button
                        type="button"
                        className="responsive-btn"
                        disabled={completionPersistingLotId === l.id}
                        onClick={() => handleCompleteFromBillable(l)}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {completionPersistingLotId === l.id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Loader /> Completing…
                          </span>
                        ) : (
                          'Make Complete'
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                {billablePageCount > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginTop: 12,
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#92600A' }}>
                      Showing {(billableSafePage - 1) * BILLABLE_PAGE_SIZE + 1}–
                      {Math.min(billableSafePage * BILLABLE_PAGE_SIZE, billableFiltered.length)} of{' '}
                      {billableFiltered.length}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={billableSafePage <= 1}
                        onClick={() => setBillablePage((p) => Math.max(1, p - 1))}
                        style={{
                          background: '#fff',
                          border: '1px solid #FDE68A',
                          color: '#92600A',
                          opacity: billableSafePage <= 1 ? 0.5 : 1,
                        }}
                      >
                        ‹ Prev
                      </button>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#92600A' }}>
                        {billableSafePage} / {billablePageCount}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={billableSafePage >= billablePageCount}
                        onClick={() => setBillablePage((p) => Math.min(billablePageCount, p + 1))}
                        style={{
                          background: '#fff',
                          border: '1px solid #FDE68A',
                          color: '#92600A',
                          opacity: billableSafePage >= billablePageCount ? 0.5 : 1,
                        }}
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="toolbar pl-toolbar">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search lot no., design, description..."
        />
        <select
          className="form-select pl-toolbar-filter pl-toolbar-filter--party"
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
        >
          <option value="All">All Parties</option>
          {parties.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <DateRangeSelect
          value={dateRange}
          onChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={({ start, end }) => {
            setCustomStart(start);
            setCustomEnd(end);
          }}
          className="pl-toolbar-filter pl-toolbar-filter--date"
        />
        {lotTableTab === 'others' ? (
          <select
            className="form-select pl-toolbar-filter pl-toolbar-filter--status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setStuckLotIdsFilter([]); }}
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.filter((s) => s !== 'completed').map((s) => (
              <option key={s} value={s}>
                {s
                  .split(' ')
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ')}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>
            Completed lots only
          </span>
        )}
      </div>

      {/* Table tabs & View Mode Switcher */}
      <div
        role="tablist"
        aria-label="Lots by completion"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          marginBottom: 10,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            { id: 'others', label: othersTabStatusLabel, count: othersTabCount, hint: othersTabHint },
            {
              id: 'completed',
              label: 'Completed',
              count: completedLotsCount,
              hint: 'Lots marked completed',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={lotTableTab === tab.id}
              title={tab.hint}
              onClick={() => { setLotTableTab(tab.id); setStuckLotIdsFilter([]); }}
              style={{
                padding: '8px 10px',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                borderBottom: lotTableTab === tab.id ? '2px solid #1e40af' : '2px solid transparent',
                marginBottom: -1,
                background: 'transparent',
                color: lotTableTab === tab.id ? '#1e40af' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: lotTableTab === tab.id ? '#EFF6FF' : '#F3F4F6',
                  color: lotTableTab === tab.id ? '#1e40af' : 'var(--text-muted)',
                  padding: '1px 6px',
                  borderRadius: 999,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* View Switcher: Table View vs Tile View (Mobile Only) */}
        <div className="mobile-view-switcher" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('table')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            List
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewMode === 'tile' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewMode('tile')}
            style={{ padding: '3px 8px', fontSize: 11 }}
          >
            Tiles
          </button>
        </div>
      </div>

      {/* Table for Desktop & Tablet (Always visible on Desktop > 768px) */}
      <div className="table-wrapper desktop-only-table">
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Lot No</th>
                <th>Design No</th>
                <th>Description</th>
                <th>Fabric</th>
                <th>Colors</th>
                <th>Pieces</th>
                <th>Allot Date</th>
                <th>Business</th>
                <th>Party Name</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Bill Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <EmptyState message="No lots found" />
                  </td>
                </tr>
              ) : (
                paginatedLots.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {l.lotNumber || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 500 }}>(No Lot)</span>}
                        {l.suitComponent === 'dupatta' && (
                          <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#fdf4ff', color: '#a21caf', border: '1px solid #f5d0fe', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>
                        )}
                        {l.suitComponent === 'main' && l.suitType === '3-piece' && (
                          <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>
                        )}
                        {l.isRework && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 4 }}>Rework</span>
                        )}
                        {l.linkedLotId && (
                          <div title="Jump to linked lot">
                            <button
                              type="button"
                              onClick={() => openLinkedLot(l.linkedLotId)}
                              style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                              {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{l.designNo}</td>
                    <td className="desc-col">{l.description}</td>
                    <td>
                      <span
                        style={{
                          background: '#F0F9FF',
                          color: '#0369a1',
                          border: '1px solid #BAE6FD',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: 12,
                        }}
                      >
                        {l.itemType || l.fabric}
                      </span>
                    </td>
                    <td>{l.colors}</td>
                    <td>{l.pieces}</td>
                    <td>{formatDisplayDate(l.allotDate)}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 160 }}>
                      {workspaceDisplayTitleForLot(l, businessOwners)}
                    </td>
                    <td>
                      <select
                        className="form-select"
                        style={{
                          width: '100%',
                          fontSize: 13,
                          padding: '4px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                        }}
                        value={l.partyId || ''}
                        onChange={(e) => handlePartyChange(l.id, e.target.value)}
                      >
                        <option value="">— Select Party —</option>
                        {parties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {lotTableTab === 'completed' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'green',
                              fontWeight: '500',
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#DCFCE7',
                              border: '1px solid #DCFCE7',
                              alignSelf: 'flex-start'
                            }}
                          >
                            Completed
                          </span>
                          <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                            Completed Date: {formatDisplayDate(l.completionApprovedAt || l.allotDate)}
                          </div>
                        </div>
                      ) : (
                        <>
                          <LotStatusSelect
                            value={l.status}
                            options={STATUS_OPTIONS}
                            disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                            onChange={(next) => setLotStatus(l, next)}
                          />
                          {l.dispatchDate && l.status !== 'pending' && (
                            <div
                              style={{
                                fontSize: 12,
                                color: '#dc2626',
                                marginTop: 3,
                                fontWeight: '500',
                              }}
                            >
                              Dispatch: {formatDisplayDate(l.dispatchDate)}
                            </div>
                          )}
                          {l.receivedBackDate && (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'green',
                                marginTop: 1,
                                fontWeight: '500',
                              }}
                            >
                              Received: {formatDisplayDate(l.receivedBackDate)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
                      ₨{getOwnerBillableAmount(l).toLocaleString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <ActionBtn variant="edit" onClick={() => openEdit(l)} />
                        <ActionBtn variant="delete" onClick={() => setDeleteTarget(l)} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Views (< 768px): Ultra-Compact Tiles vs Single-Column Cards List */}
      {viewMode === 'tile' ? (
        <div className="tiles-grid mobile-only-tiles">
          {filtered.length === 0 ? (
            <EmptyState message="No lots found" />
          ) : (
            paginatedLots.map((l) => (
              <div key={`gh-tile-${l.id}`} className="lot-tile-card">
                <div className="lot-tile-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span className="lot-tile-number">Lot {l.lotNumber ? `#${l.lotNumber}` : <span style={{ fontStyle: 'italic', fontWeight: 500, color: '#94a3b8' }}>(No Lot)</span>}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {l.suitComponent === 'dupatta' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#fdf4ff', color: '#a21caf', border: '1px solid #f5d0fe', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>}
                      {l.suitComponent === 'main' && l.suitType === '3-piece' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>}
                      {l.linkedLotId && (
                        <button type="button" onClick={() => openLinkedLot(l.linkedLotId)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                          {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                        </button>
                      )}
                    </div>
                    </div>
                    {l.designNo ? <div className="lot-tile-design">Design #{l.designNo}</div> : null}
                  </div>
                  <div style={{ flexBasis: '100%', marginTop: 4 }}>
                    {lotTableTab === 'completed' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="badge-completed" style={{ display: 'block', textAlign: 'center', fontSize: 13, padding: '4px 0', borderRadius: 20 }}>Done</span>
                        <div style={{ fontSize: 11, color: '#166534', textAlign: 'center', fontWeight: 600 }}>
                          Completed Date: {formatDisplayDate(l.completionApprovedAt || l.allotDate)}
                        </div>
                      </div>
                    ) : (
                      <LotStatusSelect
                        value={l.status}
                        options={STATUS_OPTIONS}
                        disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                        onChange={(next) => setLotStatus(l, next)}
                        wrapStyle={{ display: 'block', width: '100%' }}
                        style={{ width: '100%', minWidth: 0, maxWidth: 'none', fontSize: 13, fontWeight: 700, padding: '4px 24px 4px 12px', height: 32, backgroundPosition: 'right 10px center', borderRadius: 20 }}
                      />
                    )}
                  </div>
                </div>

                <div className="lot-tile-body">
                  <div className="lot-tile-chips">
                    <span className="fabric-chip">{l.itemType || l.fabric || 'Lawn'}</span>
                    <span className="info-chip">{l.colors || 0} col</span>
                    <span className="info-chip">{l.pieces || 0} pcs</span>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <PartyPickerSelect
                      value={l.partyId || ''}
                      onChange={(val) => handlePartyChange(l.id, val)}
                      parties={parties}
                    />
                  </div>
                </div>

                <div className="lot-tile-footer">
                  <span className="lot-tile-price">
                    ₨{getOwnerBillableAmount(l).toLocaleString()}
                  </span>
                  <div className="lot-tile-actions">
                    <button
                      type="button"
                      className="btn-tile-action"
                      onClick={() => openEdit(l)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-tile-action delete"
                      onClick={() => setDeleteTarget(l)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mobile-only-ghausia-cards">
          {filtered.length === 0 ? (
            <EmptyState message="No lots found" />
          ) : (
            paginatedLots.map((l) => (
              <div key={`gh-mob-${l.id}`} className="ghausia-mobile-card">
                <div className="gh-mob-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span className="gh-mob-lot-no">Lot {l.lotNumber ? `#${l.lotNumber}` : <span style={{ fontStyle: 'italic', fontWeight: 500, color: '#94a3b8' }}>(No Lot)</span>}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        {l.suitComponent === 'dupatta' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#fdf4ff', color: '#a21caf', border: '1px solid #f5d0fe', borderRadius: 4, cursor: 'pointer' }}>Dupatta</button>}
                        {l.suitComponent === 'main' && l.suitType === '3-piece' && <button type="button" onClick={() => openEdit(l)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>Main Lot</button>}
                        {l.isRework && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 4 }}>Rework</span>}
                        {l.linkedLotId && (
                          <button type="button" onClick={() => openLinkedLot(l.linkedLotId)} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            {l.suitComponent === 'main' ? 'View Dupatta' : 'View Main'}
                          </button>
                        )}
                      </div>
                    </div>
                    {l.designNo ? <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Design #{l.designNo}</span> : null}
                  </div>
                  <div>
                    {lotTableTab === 'completed' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="badge-completed">Completed</span>
                        <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                          Completed Date: {formatDisplayDate(l.completionApprovedAt || l.allotDate)}
                        </div>
                      </div>
                    ) : (
                      <LotStatusSelect
                        value={l.status}
                        options={STATUS_OPTIONS}
                        disabled={completionPersistingLotId === l.id || inlineSummaryBusy}
                        onChange={(next) => setLotStatus(l, next)}
                        style={{ fontSize: 13, fontWeight: 700, borderRadius: 20 }}
                      />
                    )}
                  </div>
                </div>

                <div className="gh-mob-body">
                  <div className="gh-mob-chips">
                    <span className="fabric-chip">{l.itemType || l.fabric || 'Lawn'}</span>
                    <span className="info-chip">Col: {l.colors || 0}</span>
                    <span className="info-chip">Pcs: {l.pieces || 0}</span>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <PartyPickerSelect
                      value={l.partyId || ''}
                      onChange={(val) => handlePartyChange(l.id, val)}
                      parties={parties}
                    />
                  </div>

                  <div className="gh-mob-info">
                    <div>Workspace: {workspaceDisplayTitleForLot(l, businessOwners)}</div>
                    <div>Allot Date: {formatDisplayDate(l.allotDate)}</div>
                    {l.description && <div>Note: {l.description}</div>}
                  </div>

                  <div className="gh-mob-bill-row">
                    <span style={{ fontSize: 13, color: '#64748b' }}>Bill Amount:</span>
                    <strong style={{ fontSize: 15, color: '#1e40af' }}>
                      ₨{getOwnerBillableAmount(l).toLocaleString()}
                    </strong>
                  </div>
                </div>

                <div className="gh-mob-footer">
                  <ActionBtn variant="edit" onClick={() => openEdit(l)} />
                  <ActionBtn variant="delete" onClick={() => setDeleteTarget(l)} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {filtered.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Showing {pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
            >
              Prev
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Lot Form Modal */}
      {modal === 'form' && (
        <Modal
          title={editing ? (editing.suitComponent === 'dupatta' ? 'Edit Lot (Dupatta)' : 'Edit Lot') : 'Add New Lot'}
          onClose={() => {
            if (!lotSaving) {
              setModal(null);
              setEditing(null);
            }
          }}
        >
          <LotForm
            key={editing?.id || 'new'}
            initial={editing}
            onSave={handleSave}
            onClose={() => {
              if (!lotSaving) {
                setModal(null);
                setEditing(null);
              }
            }}
            parties={parties}
            saving={lotSaving}
            pickWorkspaceForNewLot={viewAllWorkspaces && !editing}
            workspaceOwnerOptions={businessOwners}
            defaultNewLotOwnerId={activeBusinessOwnerId}
            onJumpToLinkedLot={openLinkedLot}
          />
        </Modal>
      )}

      {/* Complete lot — bill amount & owner payment */}
      {completeBillModal &&
        (() => {
          const lot = completeBillModal.lot;
          const fromBillable = !!completeBillModal.fromBillable;
          const ov = completeBillModal.billAmountOverride;
          const effective = getAdminLedgerOrBusinessBill(lot, partyEdits[lot.id] || {});
          const rawBill =
            ov !== undefined && ov !== null ? Number(ov) : Number(effective || lot.billAmount || 0);
          const confirmAmt = Number(completeBillInput);
          const amountForOwnerCheck =
            !Number.isNaN(confirmAmt) && confirmAmt > 0 ? confirmAmt : rawBill;
          const amountBill = rawBill.toLocaleString();
          const lotNo = String(lot.lotNumber || lot.lotNo || '').trim() || '—';
          const designNo = String(lot.designNo || '').trim() || '—';
          const partyLabel =
            (lot.partyName && String(lot.partyName).trim()) ||
            (lot.partyId ? getPartyName(lot.partyId) : '') ||
            '—';
          return (
            <Modal
              title={fromBillable ? 'Confirm payment & complete lot' : 'Bill amount for completion'}
              onClose={dismissCompleteBillModal}
              onFormSubmit={() => {
                confirmCompleteBillModal();
              }}
              footer={
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={dismissCompleteBillModal}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {fromBillable ? 'Complete & settle' : 'Complete & record payment'}
                  </button>
                </>
              }
            >
              {fromBillable ? (
                <p
                  style={{
                    textAlign: 'left',
                    fontSize: 13,
                    margin: '0 0 12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Confirm the bill amount for this lot. It will move to <strong>Completed</strong>,
                  the <strong>Owner Received</strong> total will go down by this amount, and a{' '}
                  <strong>Paid → Owner</strong> row will be saved in Payment Management (linked to
                  this lot).
                  {rawBill > 0 ? (
                    <>
                      {' '}
                      Current bill: <strong>₨{amountBill}</strong> (edit below if needed).
                    </>
                  ) : (
                    <> No bill amount on file (₨{amountBill}) — enter the amount below.</>
                  )}
                  {amountForOwnerCheck > 0 && ownerReceivedNet < amountForOwnerCheck && (
                    <span
                      style={{ display: 'block', marginTop: 10, color: '#b45309', fontWeight: 600 }}
                    >
                      Owner Received (after other settlements) is less than this bill — after
                      completion, Owner Received will show as <strong>Pending to owner</strong>{' '}
                      until recorded receipts catch up.
                    </span>
                  )}
                </p>
              ) : rawBill > 0 ? (
                <p
                  style={{
                    textAlign: 'left',
                    fontSize: 13,
                    margin: '0 0 12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  This lot has a bill amount of <strong>₨{amountBill}</strong>. You can keep it or
                  change it below. Completing will add a <strong>Received</strong> entry in Payment
                  Management using the amount you confirm.
                </p>
              ) : (
                <p
                  style={{
                    textAlign: 'left',
                    fontSize: 13,
                    margin: '0 0 12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  This lot has no bill amount (₨{amountBill}). Enter the amount received from the
                  owner to mark it completed and add a <strong>Received</strong> entry in Payment
                  Management.
                </p>
              )}
              <div
                style={{
                  textAlign: 'left',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  marginBottom: 16,
                }}
              >
                <strong>Lot:</strong> {lotNo} · <strong>Design:</strong> {designNo}
                <br />
                <strong>Party:</strong> {partyLabel}
                <br />
              </div>
              <FormGroup
                label={rawBill > 0 ? 'Bill amount (₨) — edit if needed' : 'Amount received (₨) *'}
              >
                <input
                  className={`form-input${completeBillError ? ' input-error' : ''}`}
                  type="number"
                  min={1}
                  step={1}
                  value={completeBillInput}
                  onChange={(e) => {
                    setCompleteBillInput(e.target.value);
                    setCompleteBillError('');
                  }}
                  placeholder={rawBill > 0 ? `Default ₨${amountBill}` : 'Amount (₨)'}
                  autoFocus
                />
                {completeBillError && (
                  <span style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}>
                    {completeBillError}
                  </span>
                )}
              </FormGroup>
              <strong>Owner Received:</strong> ₨{ownerReceivedNet.toLocaleString()}
            </Modal>
          );
        })()}

      {/* Payment Modal */}
      {payModal && (
        <Modal
          title="Record Payment"
          onClose={() => {
            if (!paymentSaving) {
              setPayModal(false);
              setPayErrors({});
            }
          }}
          onFormSubmit={() => {
            void handleAddPayment();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPayModal(false);
                  setPayErrors({});
                }}
                disabled={paymentSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={paymentSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {paymentSaving ? (
                  <>
                    <Loader /> Saving…
                  </>
                ) : (
                  'Save Payment'
                )}
              </button>
            </>
          }
        >
          <div className="grid-2">
            <FormGroup label="Type">
              <select
                className="form-select"
                value={payForm.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setPayForm((f) => ({
                    ...f,
                    type: newType,
                    party: newType === 'Received' ? 'Owner' : '',
                  }));
                  setPayErrors((prev) => ({ ...prev, party: undefined }));
                }}
              >
                <option>Received</option>
                <option>Paid</option>
              </select>
            </FormGroup>
            <FormGroup label="Amount (₨) *">
              <input
                className={`form-input${payErrors.amount ? ' input-error' : ''}`}
                type="number"
                value={payForm.amount}
                onChange={(e) => {
                  setPayForm((f) => ({ ...f, amount: e.target.value }));
                  setPayErrors((p) => ({ ...p, amount: undefined }));
                }}
                placeholder="50000"
              />
              {payErrors.amount && (
                <span style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}>
                  {payErrors.amount}
                </span>
              )}
            </FormGroup>
            <FormGroup label={payForm.type === 'Received' ? 'Received From' : 'Paid To *'}>
              {payForm.type === 'Received' ? (
                <select
                  className="form-select"
                  value={payForm.party}
                  onChange={(e) => setPayForm((f) => ({ ...f, party: e.target.value }))}
                >
                  <option value="Owner">Owner</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <select
                    className={`form-select${payErrors.party ? ' input-error' : ''}`}
                    value={payForm.party}
                    onChange={(e) => {
                      setPayForm((f) => ({ ...f, party: e.target.value }));
                      setPayErrors((p) => ({ ...p, party: undefined }));
                    }}
                  >
                    <option value="">— Select Party —</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                  {payErrors.party && (
                    <span
                      style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}
                    >
                      {payErrors.party}
                    </span>
                  )}
                </>
              )}
            </FormGroup>
            <FormGroup label="Date *">
              <input
                className={`form-input${payErrors.date ? ' input-error' : ''}`}
                type="date"
                value={payForm.date}
                onChange={(e) => {
                  setPayForm((f) => ({ ...f, date: e.target.value }));
                  setPayErrors((p) => ({ ...p, date: undefined }));
                }}
              />
              {payErrors.date && (
                <span style={{ color: '#dc2626', fontSize: 11, marginTop: 3, display: 'block' }}>
                  {payErrors.date}
                </span>
              )}
            </FormGroup>
            <FormGroup label="Linked Lot (optional)">
              <select
                className="form-select"
                value={payForm.linkedLot}
                onChange={(e) => setPayForm((f) => ({ ...f, linkedLot: e.target.value }))}
              >
                <option value="">None</option>
                {collectionLots.map((l) => (
                  <option key={l.id} value={l.lotNumber}>
                    {l.lotNumber || l.lotNo} / {l.designNo}
                  </option>
                ))}
              </select>
            </FormGroup>
            <FormGroup label="Note">
              <input
                className="form-input"
                value={payForm.note}
                onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional note"
              />
            </FormGroup>
          </div>
        </Modal>
      )}

      {/* Confirm Delete */}
      {deleteTarget && (
        <ConfirmDialog
          message={
            deleteTarget.suitComponent === 'main' && deleteTarget.linkedLotId
              ? `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This will also delete the linked Dupatta lot. This action cannot be undone.`
              : deleteTarget.suitComponent === 'dupatta' && deleteTarget.linkedLotId
              ? `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This will downgrade the linked Main lot to a 2-piece suit. This action cannot be undone.`
              : `Delete lot ${deleteTarget.lotNumber || deleteTarget.lotNo} / ${deleteTarget.designNo}? This action cannot be undone.`
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          confirming={deleteLoading}
        />
      )}
    </div>
  );
}

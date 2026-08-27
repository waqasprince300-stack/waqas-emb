import React, { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { FormGroup } from '../UI';
import Loader from '../Loader';
import { generateSerialLotNumbers, previewSerialLotNumbers } from '../../utils/lotSerial';
import {
  getRecentPartyIds,
  getRememberedItemTypes,
  getMachineHeadConfig,
  getAllMachineHeads,
  addCustomMachineHead,
  setDefaultMachineHead,
  removeCustomMachineHead,
  BASE_MACHINE_HEADS,
} from '../../utils/lotFieldMemory';
import {
  BASE_FABRICS,
  COLOR_OPTIONS,
  STATUS_OPTIONS,
  checkIsCombinedDupatta,
  resolveItemTypeFields,
} from '../../utils/ghausiaHelpers';
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
  onSeparateBill,
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
  const [moveToBusinessOwnerId, setMoveToBusinessOwnerId] = useState('');
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
        newErrors.bulkCount = 'Enter 2-100 lots';
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
        confirmButtonColor: 'var(--purple, #4f46e5)',
        cancelButtonColor: 'var(--text-muted, #94a3b8)',
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
      ...(syncMainLotPieces ? { syncMainLotPieces } : {}),
      ...(moveToBusinessOwnerId ? { moveToBusinessOwnerId } : {}),
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
    if (saving) return 'Saving...';
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
        borderBottom: '1px solid var(--primary-bg, #f1f5f9)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 10px',
        alignItems: 'center',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--text-muted, #94a3b8)' }}>Head</span>
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
              border: active ? '1px solid var(--purple, #4f46e5)' : '1px solid var(--border, #e2e8f0)',
              background: active ? 'var(--primary-bg, #eef2ff)' : 'var(--card-bg, #fff)',
              color: active ? 'var(--primary, #3730a3)' : 'var(--text-secondary, #475569)',
              fontWeight: active ? 800 : 600,
              fontSize: 12,
              cursor: 'pointer',
              lineHeight: 1.3,
            }}
          >
            {h}
            {isDefault ? '*' : ''}
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
          border: '1px dashed var(--border, #cbd5e1)',
          background: 'var(--card-bg, #fff)',
          color: 'var(--text-muted, #64748b)',
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
              border: '1px solid var(--border, #e2e8f0)',
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
              style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger, #dc2626)' }}
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
          <span style={{ color: 'var(--border, #e2e8f0)', userSelect: 'none' }}>|</span>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              color: 'var(--text-secondary, #475569)',
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
                  border: errors.bulkCount ? '1px solid var(--danger, #dc2626)' : '1px solid var(--border, #e2e8f0)',
                }}
              />
              {bulkLotNumbers && bulkLotNumbers.length > 1 ? (
                <span
                  style={{
                    color: 'var(--text-muted, #94a3b8)',
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
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11 }}>{errors.bulkCount}</span>
          ) : null}
          {bulkMode && !bulkLotNumbers && form.lotNumber.trim() ? (
            <span style={{ color: 'var(--success, #166534)', fontSize: 11, marginLeft: 'auto' }}>
              Hit Save to generate
            </span>
          ) : null}
        </>
      ) : null}
      {!isNewLot && workspaceOwnerOptions && workspaceOwnerOptions.length > 1 && (
        <>
          <span style={{ color: 'var(--border, #e2e8f0)', userSelect: 'none' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
            {moveToBusinessOwnerId && (
              <span style={{ fontSize: 11, color: 'var(--warning, #b45309)', fontWeight: 600 }}>
                ⚠ Is lot ko nayi workspace mein move kar diya jayega.
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-secondary, #475569)', fontSize: 11 }}>Move to:</span>
            <select
              className="form-select"
              value={moveToBusinessOwnerId}
              onChange={(e) => setMoveToBusinessOwnerId(e.target.value)}
              style={{
                padding: '2px 24px 2px 8px',
                fontSize: 11,
                height: 26,
                minHeight: 26,
                fontWeight: 600,
                ...(moveToBusinessOwnerId ? { borderColor: 'var(--warning, #f59e0b)', background: 'var(--warning-bg, #fffbeb)', color: 'var(--warning, #b45309)' } : {})
              }}
            >
              <option value="">Current</option>
              {(workspaceOwnerOptions || []).filter((o) => String(o.id || o._id) !== String(initial?.businessOwnerId || '')).map((o) => (
                <option key={o.id || o._id} value={String(o.id || o._id)}>
                  {o.name}
                </option>
              ))}
            </select>
            </div>
          </div>
        </>
      )}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--purple, #4f46e5)', fontWeight: 600, background: 'var(--primary-bg, #eef2ff)' }}
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
                  border: form.suitType === type ? '2px solid var(--purple, #4f46e5)' : '1px solid var(--border, #e2e8f0)',
                  backgroundColor: form.suitType === type ? 'var(--primary-bg, #eef2ff)' : 'transparent',
                  color: form.suitType === type ? 'var(--primary, #3730a3)' : 'var(--text-secondary, #475569)',
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
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary, #475569)', fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.isRework}
            onChange={(e) => set('isRework', e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--warning, #b45309)' }}
            disabled={!isNewLot && initial?.suitComponent === 'dupatta' && initial?.linkedLotId}
          />
          Mark as Rework / Claim
        </label>
      </div>

      {pickWorkspaceForNewLot && (
        <FormGroup label="Business collection *" style={{ marginBottom: 16 }}>
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
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}>
              {errors.saveBusinessOwnerId}
            </span>
          )}
        </FormGroup>
      )}

      <div className="grid-2">
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
            <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', display: 'block', marginTop: 4 }}>
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
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 11, marginTop: 3, display: 'block' }}>
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
            <option value="__custom">+ New fabric...</option>
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
                  ? { backgroundColor: 'var(--success-bg, #dcfce7)', color: 'var(--success, #166534)', borderColor: 'var(--success-bg, #bbf7d0)', fontWeight: '600' }
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
        <FormGroup label="Bill Amount (Rs)">
          {checkIsCombinedDupatta(initial) ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                Combined with main lot
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSeparateBill}
              >
                Separate Bill
              </button>
            </div>
          ) : (
            <input
              className="form-input"
              type="number"
              min="0"
              value={form.billAmount}
              onChange={(e) => set('billAmount', e.target.value)}
              placeholder="45000"
            />
          )}
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
                background: 'var(--dupatta-box-bg, rgba(168, 85, 247, 0.06))',
                borderRadius: 12,
                border: '1px solid var(--dupatta-box-border, rgba(168, 85, 247, 0.2))',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                transform: form.suitType === '3-piece' ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
          <h4 style={{ margin: '0 0 16px 0', color: 'var(--text-secondary, #334155)', fontSize: 15, fontWeight: 700 }}>Dupatta Details</h4>
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
                <option value="__custom">+ New fabric...</option>
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
              <FormGroup label="Dupatta Owner Bill (Rs)">
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

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--border, #cbd5e1)' }}>
            <h5 style={{ margin: '0 0 10px 0', fontSize: 13, color: 'var(--text-secondary, #475569)' }}>Owner Billing Preference</h5>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => set('ownerBillingChoice', 'separate')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: form.ownerBillingChoice === 'separate' ? '1px solid var(--success, #10b981)' : '1px solid var(--border, #e2e8f0)',
                  background: form.ownerBillingChoice === 'separate' ? 'var(--success-bg, #ecfdf5)' : 'var(--card-bg, #ffffff)',
                  color: form.ownerBillingChoice === 'separate' ? 'var(--success, #10b981)' : 'var(--text-muted, #64748b)',
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
                  border: form.ownerBillingChoice === 'combined' ? '1px solid var(--warning, #f59e0b)' : '1px solid var(--border, #e2e8f0)',
                  background: form.ownerBillingChoice === 'combined' ? 'var(--warning-bg, #fffbeb)' : 'var(--card-bg, #ffffff)',
                  color: form.ownerBillingChoice === 'combined' ? 'var(--warning, #d97706)' : 'var(--text-muted, #64748b)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ marginBottom: 4 }}>Combined Bill</div>
                <div style={{ fontSize: '10px', fontWeight: 400 }}>Main lot will combine both bills. Dupatta lot will show Rs 0 for owner.</div>
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
              <Loader /> Saving...
            </>
          ) : (
            saveButtonLabel
          )}
        </button>
      </div>
    </form>
  );
}

export default LotForm;


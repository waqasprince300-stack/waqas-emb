import { useState, useEffect, useMemo, useCallback } from 'react';

import Swal from 'sweetalert2';

import { Modal, FormGroup, ActionBtn } from '../components/UI';

import { useAuth } from '../context/AuthContext';

import { apiService } from '../services/api';

import {
  DEFAULT_QUICK_PART_IDS,
  REPEAT_OPTIONS,
  emptyStitchRow,
  normalizeStitchRow,
  rowStitchTotal,
  grandStitchTotal,
  formatCalcNum,
  rowDisplayLabel,
  buildStitchPartsList,
  findStitchPart,
  quickPartChipLabel,
} from '../utils/stitchCalculator';

import {
  loadCustomStitchParts,
  saveCustomStitchPart,
  customPartId,
} from '../utils/stitchPartMemory';

import './calculator.css';

import Loader from '../components/Loader';

export default function StitchCalculator() {
  const { isParty } = useAuth();

  const [customParts, setCustomParts] = useState(() => loadCustomStitchParts());

  const [rows, setRows] = useState([emptyStitchRow()]);

  const [rate, setRate] = useState('');

  const [pieces, setPieces] = useState(1);

  const [selectedDesign, setSelectedDesign] = useState(null);

  const [savedDesigns, setSavedDesigns] = useState([]);

  const [saveModal, setSaveModal] = useState(false);

  const [saveDesignModal, setSaveDesignModal] = useState(false);

  const [designNumber, setDesignNumber] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);

  const allParts = useMemo(() => buildStitchPartsList(customParts), [customParts]);

  const quickParts = useMemo(() => {
    const seen = new Set();

    const out = [];

    for (const id of DEFAULT_QUICK_PART_IDS) {
      const p = findStitchPart(id, customParts);

      if (p && !seen.has(p.id)) {
        seen.add(p.id);

        out.push(p);
      }
    }

    for (const p of customParts) {
      if (!seen.has(p.id)) {
        seen.add(p.id);

        out.push(p);
      }
    }

    return out;
  }, [customParts]);

  const grandTotal = useMemo(() => grandStitchTotal(rows), [rows]);

  const onePieceRate = useMemo(
    () => (rate ? (grandTotal * Number(rate)) / 1000 : 0),

    [grandTotal, rate]
  );

  const totalCost = useMemo(
    () => onePieceRate * Number(pieces || 0),

    [onePieceRate, pieces]
  );

  const format = formatCalcNum;

  useEffect(() => {
    if (!isParty) {
      void loadSavedDesigns();
    }
  }, [isParty]);

  const loadSavedDesigns = async () => {
    setLoading(true);

    try {
      const designs = await apiService.getSavedDesigns();

      setSavedDesigns(designs);
    } catch (error) {
      console.error('Failed to load saved designs:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRow = useCallback((index, patch) => {
    setRows((prev) => {
      const next = [...prev];

      next[index] = { ...next[index], ...patch };

      return next;
    });
  }, []);

  const commitCustomLabel = useCallback(
    (index, rawLabel) => {
      const label = String(rawLabel || '').trim();

      if (!label) return;

      const id = customPartId(label);

      const nextCustom = saveCustomStitchPart(label);

      setCustomParts(nextCustom);

      updateRow(index, { part: id, label });
    },
    [updateRow]
  );

  const onPartChange = useCallback(
    (index, partId) => {
      const preset = findStitchPart(partId, customParts);

      updateRow(index, {
        part: partId,

        label: partId === 'custom' ? '' : preset?.label || '',
      });
    },
    [customParts, updateRow]
  );

  const addRow = useCallback(
    (partId = '') => {
      setRows((prev) => [...prev, emptyStitchRow(partId, customParts)]);
    },
    [customParts]
  );

  const removeRow = useCallback((index) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const handleSaveDesign = async () => {
    if (!designNumber.trim()) {
      Swal.fire({ icon: 'warning', title: 'Required', text: 'Please enter a design number.' });

      return;
    }

    setLoading(true);

    try {
      const normalizedRows = rows.map((row) => normalizeStitchRow(row, customParts));

      const designData = {
        designNumber: designNumber.trim(),

        rows: normalizedRows,

        rate,

        pieces: Number(pieces),

        grandTotal,

        onePieceRate,

        totalCost,

        createdAt: new Date().toISOString(),
      };

      await apiService.createSavedDesign(designData);

      setSaveModal(false);

      setDesignNumber('');

      await loadSavedDesigns();

      Swal.fire({
        icon: 'success',
        title: 'Saved!',
        text: 'Design saved successfully.',
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error('Failed to save design:', error);

      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to save design. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDesign = (design) => {
    const loaded = (design.rows || []).map((row) => normalizeStitchRow(row, customParts));

    setRows(loaded.length > 0 ? loaded : [emptyStitchRow('', customParts)]);

    setRate(design.rate ?? '');

    setPieces(design.pieces ?? 1);
  };

  const deleteDesign = async (id) => {
    const result = await Swal.fire({
      title: 'Delete Design?',

      text: 'This action cannot be undone.',

      icon: 'warning',

      showCancelButton: true,

      confirmButtonColor: '#dc2626',

      cancelButtonColor: '#6b7280',

      confirmButtonText: 'Yes, delete it',
    });

    if (!result.isConfirmed) return;

    try {
      await apiService.deleteSavedDesign(id);

      await loadSavedDesigns();
    } catch (error) {
      console.error('Failed to delete design:', error);

      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to delete design. Please try again.',
      });
    }
  };

  const filteredDesigns = useMemo(
    () =>
      savedDesigns.filter((design) =>
        design.designNumber.toLowerCase().includes(searchTerm.toLowerCase())
      ),

    [savedDesigns, searchTerm]
  );

  const detailDesign = useMemo(
    () => filteredDesigns.find((d) => d.id === selectedDesign),

    [filteredDesigns, selectedDesign]
  );

  return (
    <div className="container">
      <div className="card-calculator">
        <h2 className="title">{isParty ? 'Rate Calculator' : 'Rate Calculations'}</h2>

        <p className="calc-subtitle">
          Add each stitch area with base stitches and repeat — totals update automatically.
        </p>

        <div className="quick-parts">
          <span className="quick-parts-label">Quick add</span>

          {quickParts.map((p) => (
            <button
              key={p.id}
              type="button"
              className="quick-part-btn"
              onClick={() => addRow(p.id)}
            >
              + {quickPartChipLabel(p)}
            </button>
          ))}
        </div>

        <div className="row header calc-row">
          <div>Area / part</div>

          <div>Base stitches</div>

          <div>Repeat</div>

          <div>Total</div>

          <div />
        </div>

        {rows.map((row, index) => {
          const normalized = normalizeStitchRow(row, customParts);

          const total = rowStitchTotal(normalized);

          return (
            <div key={index} className="row box calc-row">
              <div className="part-cell">
                <select
                  value={normalized.part || ''}

                  onChange={(e) => onPartChange(index, e.target.value)}

                  className="input"

                  aria-label="Stitch area"
                >
                  <option value="">— Select —</option>

                  {allParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                {normalized.part === 'custom' ? (
                  <input
                    type="text"

                    value={normalized.label}

                    onChange={(e) => updateRow(index, { part: 'custom', label: e.target.value })}

                    onBlur={(e) => commitCustomLabel(index, e.target.value)}

                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();

                        commitCustomLabel(index, e.currentTarget.value);

                        e.currentTarget.blur();
                      }
                    }}

                    placeholder="Type area name…"

                    className="input part-custom"
                  />
                ) : null}
              </div>

              <input
                type="number"

                value={normalized.baseStitches}

                onChange={(e) => updateRow(index, { baseStitches: e.target.value })}

                placeholder="e.g. 10000"

                className="input"

                min={0}
              />

              <select
                value={normalized.repeat}

                onChange={(e) => updateRow(index, { repeat: Number(e.target.value) })}

                className="input"
              >
                {REPEAT_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <div className="total">{format(total)}</div>

              <button
                type="button"

                onClick={() => removeRow(index)}

                disabled={rows.length === 1}

                className="deleteBtn"

                aria-label="Remove row"
              >
                ✕
              </button>
            </div>
          );
        })}

        <button type="button" onClick={() => addRow()} className="addBtn">
          + Add stitch row
        </button>

        <div className="grid2">
          <div>
            <label style={{ fontSize: '12px' }}>Per 1000 stitches (₨)</label>

            <input
              type="number"

              value={rate}

              onChange={(e) => setRate(e.target.value)}

              placeholder="Rate per 1000"

              className="input"

              min={0}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px' }}># of pieces</label>

            <input
              type="number"

              value={pieces}

              onChange={(e) => setPieces(e.target.value)}

              placeholder="Pieces"

              className="input"

              min={1}
            />
          </div>
        </div>

        <div className="results">
          <div className="resultRow">
            <span>Grand total stitches</span>

            <span>{format(grandTotal)}</span>
          </div>

          <div className="resultRow">
            <span>One piece rate</span>

            <span>₨{format(onePieceRate)}</span>
          </div>

          <div className="resultRow totalFinal">
            <span>Total cost</span>

            <span>₨{format(totalCost)}</span>
          </div>

          {!isParty && (
            <button
              type="button"

              onClick={() => setSaveModal(true)}

              className="saveBtn"

              disabled={!grandTotal || !rate}
            >
              Save design
            </button>
          )}
        </div>
      </div>

      {!isParty && saveModal && (
        <Modal
          title="Save design"

          onClose={() => setSaveModal(false)}

          onFormSubmit={() => {
            void handleSaveDesign();
          }}

          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSaveModal(false)}>
                Cancel
              </button>

              <button type="submit" className="btn btn-success" disabled={loading}>
                {loading ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <FormGroup label="Design number *">
            <input
              type="text"

              value={designNumber}

              onChange={(e) => setDesignNumber(e.target.value)}

              placeholder="e.g. D-101"

              className="form-input"

              autoFocus
            />
          </FormGroup>

          <div className="calc-summary-box">
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Summary</div>

            <div style={{ fontSize: 13, color: '#64748B' }}>
              <div>
                {rows.length} stitch row{rows.length !== 1 ? 's' : ''} · {format(grandTotal)}{' '}
                stitches
              </div>

              <div>
                Rate: ₨{format(rate)} / 1000 · Pieces: {pieces}
              </div>

              <div>Total: ₨{format(totalCost)}</div>
            </div>
          </div>
        </Modal>
      )}

      {!isParty && (
        <div className="card-calculator" style={{ marginTop: 24 }}>
          <h2 className="title" style={{ fontSize: 20 }}>
            Saved designs
          </h2>

          <input
            type="text"

            value={searchTerm}

            onChange={(e) => setSearchTerm(e.target.value)}

            placeholder="Search design number…"

            className="input"

            style={{ width: '100%', marginBottom: 16 }}
          />

          {loading ? (
            <div
              style={{
                textAlign: 'center',
                display: 'flex',
                justifyContent: 'center',
                padding: 40,
              }}
            >
              <Loader />
            </div>
          ) : filteredDesigns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
              {savedDesigns.length === 0 ? 'No saved designs yet' : 'No match'}
            </div>
          ) : (
            <div className="saved-designs-grid">
              {filteredDesigns.map((design) => (
                <div key={design.id} className="saved-design-card">
                  <div className="saved-design-card-top">
                    <div>
                      <div className="saved-design-name">{design.designNumber}</div>

                      <div className="saved-design-rate">
                        ₨{format(design.onePieceRate)} / piece
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDesign(design.id);
                          setSaveDesignModal(true);
                        }}
                        className="btn btn-ghost btn-sm"
                      >
                        Details
                      </button>

                      <button
                        type="button"
                        onClick={() => loadDesign(design)}
                        className="btn btn-primary btn-sm"
                      >
                        Load
                      </button>

                      <ActionBtn variant="delete" onClick={() => deleteDesign(design.id)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isParty && saveDesignModal && detailDesign && (
        <Modal
          title={`Design — ${detailDesign.designNumber}`}

          onClose={() => setSaveDesignModal(false)}

          wide

          footer={
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSaveDesignModal(false)}
            >
              Close
            </button>
          }
        >
          <div className="detail-stats-grid">
            <div>
              <div className="detail-stat-label">Stitches</div>
              <div className="detail-stat-val">{format(detailDesign.grandTotal)}</div>
            </div>

            <div>
              <div className="detail-stat-label">Per 1000</div>
              <div className="detail-stat-val">₨{format(detailDesign.rate)}</div>
            </div>

            <div>
              <div className="detail-stat-label">One piece</div>
              <div className="detail-stat-val accent">₨{format(detailDesign.onePieceRate)}</div>
            </div>

            <div>
              <div className="detail-stat-label">Pieces</div>
              <div className="detail-stat-val">{detailDesign.pieces}</div>
            </div>

            <div>
              <div className="detail-stat-label">Total cost</div>
              <div className="detail-stat-val success">₨{format(detailDesign.totalCost)}</div>
            </div>
          </div>

          <div className="detail-entries">
            <div className="detail-entries-title">Stitch breakdown</div>

            <div className="detail-entries-table">
              <div className="detail-entries-head">
                <span>Area</span>

                <span>Base</span>

                <span>×</span>

                <span>Repeat</span>

                <span>Total</span>
              </div>

              {(detailDesign.rows || []).map((row, idx) => {
                const n = normalizeStitchRow(row, customParts);

                const lineTotal = rowStitchTotal(n);

                return (
                  <div key={idx} className="detail-entries-row">
                    <span className="detail-part">{rowDisplayLabel(n, customParts)}</span>

                    <span>{format(n.baseStitches)}</span>

                    <span className="detail-mul">×</span>

                    <span>{n.repeat}</span>

                    <span className="detail-line-total">{format(lineTotal)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

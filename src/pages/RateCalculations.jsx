import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { Modal, FormGroup, ActionBtn } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { apiService } from "../services/api";
import "./calculator.css";
import Loader from "../components/Loader";

export default function StitchCalculator() {
  const { isParty } = useAuth();
  const [rows, setRows] = useState([{ baseStitches: "", repeat: 1 }]);
  const [rate, setRate] = useState("");
  const [pieces, setPieces] = useState(1);
  const [selectedDesign, setSelectedDesign] = useState(null);

  // Saved designs state
  const [savedDesigns, setSavedDesigns] = useState([]);
  const [saveModal, setSaveModal] = useState(false);
  const [saveDesignModal, setSaveDesignModal] = useState(false);
  const [designNumber, setDesignNumber] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);

  const repeats = [1/6,1/3, 0.5, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 7.5, 8, 9, 10];

  const handleChange = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = field === "repeat" ? Number(value) : value;
    setRows(updated);
  };

  const addRow = () => {
    setRows([...rows, { baseStitches: "", repeat: 1 }]);
  };

  const removeRow = (index) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const calculateRowTotal = (row) => {
    return row.baseStitches ? Number(row.baseStitches) * row.repeat : 0;
  };

  const grandTotal = rows.reduce((sum, row) => sum + calculateRowTotal(row), 0);

  const onePieceRate = rate ? (grandTotal * Number(rate)) / 1000 : 0;

  const totalCost = onePieceRate * Number(pieces || 0);

  const format = (num) =>
    Number(num).toLocaleString(undefined, { maximumFractionDigits: 2 });

  useEffect(() => {
    if (!isParty) {
      loadSavedDesigns();
    }
  }, [isParty]);

  const loadSavedDesigns = async () => {
    setLoading(true);
    try {
      const designs = await apiService.getSavedDesigns();
      setSavedDesigns(designs);
    } catch (error) {
      console.error("Failed to load saved designs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDesign = async () => {
    if (!designNumber.trim()) {
      Swal.fire({ icon: 'warning', title: 'Required', text: 'Please enter a design number.' });
      return;
    }

    setLoading(true);
    try {
      const designData = {
        designNumber: designNumber.trim(),
        rows: rows.map((row) => ({ ...row })),
        rate,
        pieces: Number(pieces),
        grandTotal,
        onePieceRate,
        totalCost,
        createdAt: new Date().toISOString(),
      };

      await apiService.createSavedDesign(designData);
      setSaveModal(false);
      setDesignNumber("");
      await loadSavedDesigns();
      Swal.fire({ icon: 'success', title: 'Saved!', text: 'Design saved successfully.', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error("Failed to save design:", error);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save design. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const loadDesign = (design) => {
    setRows(design.rows.map((row) => ({ ...row })));
    setRate(design.rate);
    setPieces(design.pieces);
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
      console.error("Failed to delete design:", error);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to delete design. Please try again.' });
    }
  };

  const handleSaveDesignModal = (id) => {
    setSaveDesignModal(true);
    setSelectedDesign(id);

  };

  const filteredDesigns = savedDesigns.filter((design) =>
    design.designNumber.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="container">
      <div className="card-calculator">
        <h2 className="title">🧵 Embroidery Calculator</h2>

        {/* Header */}
        <div className="row header">
          <div>Base Stitches</div>
          <div>Repeat</div>
          <div>Total</div>
          <div></div>
        </div>

        {/* Rows */}
        {rows.map((row, index) => (
          <div key={index} className="row box">
            <input
              type="number"
              value={row.baseStitches}
              onChange={(e) =>
                handleChange(index, "baseStitches", e.target.value)
              }
              placeholder="e.g 10000"
              className="input"
            />

            <select
              value={row.repeat}
              onChange={(e) => handleChange(index, "repeat", e.target.value)}
              className="input"
            >
              {repeats.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <div className="total">{format(calculateRowTotal(row))}</div>

            <button
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              className="deleteBtn"
            >
              ✕
            </button>
          </div>
        ))}

        <button onClick={addRow} className="addBtn">
          + Add Entry
        </button>

        {/* Inputs */}
        <div className="grid2">
          <div>
            <label htmlFor="" style={{ fontSize: '12px' }}>Per 1000 Stitches</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Rate per 1000"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="" style={{ fontSize: '12px' }}># of Pieces</label>
            <input
              type="number"
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              placeholder="Pieces"
              className="input"
            />
          </div>
        </div>

        {/* Results */}
        <div className="results">
          <div className="resultRow">
            <span>Grand Total Stitches</span>
            <span>{format(grandTotal)}</span>
          </div>

          <div className="resultRow">
            <span>One Piece Rate</span>
            <span>{format(onePieceRate)}</span>
          </div>

          <div className="resultRow totalFinal">
            <span>Total Cost</span>
            <span>{format(totalCost)}</span>
          </div>

          {!isParty && (
            <button
              onClick={() => setSaveModal(true)}
              className="saveBtn"
              disabled={!grandTotal || !rate}
            >
              💾 Save Design
            </button>
          )}
        </div>
      </div>

      {/* Save Design Modal */}
      {!isParty && saveModal && (
        <Modal
          title="Save Design"
          onClose={() => setSaveModal(false)}
          onFormSubmit={() => {
            void handleSaveDesign();
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSaveModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Design"}
              </button>
            </>
          }
        >
          <FormGroup label="Design Number *">
            <input
              type="text"
              value={designNumber}
              onChange={(e) => setDesignNumber(e.target.value)}
              placeholder="e.g. EMB-001"
              className="form-input"
              autoFocus
            />
          </FormGroup>

          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#F8FAFC",
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Design Summary:
            </div>
            <div style={{ fontSize: 13, color: "#64748B" }}>
              <div>Stitches: {format(grandTotal)}</div>
              <div>Rate: ₨{format(rate)} per 1000</div>
              <div>Pieces: {pieces}</div>
              <div>Total Cost: ₨{format(totalCost)}</div>
            </div>
          </div>
        </Modal>
      )}

      {/* Saved Designs — admin only */}
      {!isParty && (
      <div className="card-calculator" style={{ marginTop: 24 }}>
        <h2 className="title">📚 Saved Designs</h2>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by design number..."
            className="input"
            style={{ width: "100%" }}
          />
        </div>

        {/* Designs List */}
        {loading ? <div style={{ textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", height: "100px" }}>
          <Loader />
        </div> :
          <>
            {filteredDesigns.length === 0 ? (
              <div
                style={{ textAlign: "center", padding: "40px", color: "#64748B" }}
              >
                {savedDesigns.length === 0
                  ? "No saved designs yet"
                  : "No designs match your search"}
              </div>
            ) : (
              <div className="saved-designs-grid">
                {filteredDesigns.map((design) => (
                  <div
                    key={design.id}
                    style={{
                      padding: 16,
                      border: "1px solid #E5E7EB",
                      borderRadius: 8,
                      background: "#FFF",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: "#1F2937",
                          }}
                        >
                          {design.designNumber}
                        </div>
                        <div style={{ fontSize: 12, color: "#6B7280" }}>
                        ₨{format(design.onePieceRate)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={()=>handleSaveDesignModal(design.id)} className="btn btn-primary">Show Details</button>
                        <button
                          onClick={() => loadDesign(design)}
                          className="btn btn-primary"
                          style={{ fontSize: 12, padding: "6px 12px" }}
                        >
                          Load
                        </button>
                        <ActionBtn
                          variant="delete"
                          onClick={() => deleteDesign(design.id)}
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </>
        }
      </div>
      )}
      {!isParty && saveDesignModal && (
        <Modal
          title="Save Design"
          onClose={() => setSaveDesignModal(false)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setSaveDesignModal(false)}
              >
                Cancel
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {filteredDesigns.filter((design) => design.id === selectedDesign).map((design) => (
              <div
                key={design.id}
                style={{
                  padding: 16,
                  border: "1px solid #E5E7EB",
                  borderRadius: 8,
                  background: "#FFF",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#1F2937",
                      }}
                    >
                      {design.designNumber}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      {new Date(design.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      Stitches
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {format(design.grandTotal)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Per 1000 Stitches</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      ₨{format(design.rate)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      One Piece
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#7C3AED",
                      }}
                    >
                      ₨{format(design.onePieceRate)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>Pieces</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {design.pieces}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      Total Cost
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#059669",
                      }}
                    >
                      ₨{format(design.totalCost)}
                    </div>
                  </div>
                </div>

                {/* Show all entries */}
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid #E5E7EB",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#374151",
                      marginBottom: 8,
                    }}
                  >
                    Entries:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {design.rows.map((row, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "#F3F4F6",
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          color: "#4B5563",
                        }}
                      >
                        {format(row.baseStitches)} × {row.repeat}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

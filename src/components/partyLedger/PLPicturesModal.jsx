import React from 'react';
import { Modal } from '../UI';
import Loader from '../Loader';
import ImageUploader from '../ImageUploader';

/**
 * PLPicturesModal — Renders the lot pictures modal for Party Ledger.
 * Pure render component.
 */
export default function PLPicturesModal({
  picsLot,
  picsImages,
  setPicsImages,
  picsLoading,
  picsSaving,
  saveLotPictures,
  onClose,
  lotPicturesMax,
}) {
  if (!picsLot) return null;

  const maxPics = lotPicturesMax(picsLot);

  return (
    <Modal
      title={`Pictures \u2014 ${picsLot.lotNo || picsLot.lotNumber}${picsLot.designNo ? ` / ${picsLot.designNo}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={picsSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void saveLotPictures()}
            disabled={picsSaving || picsLoading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {picsSaving ? (
              <>
                <Loader /> Saving{'\u2026'}
              </>
            ) : (
              'Save Pictures'
            )}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
        This lot has <strong>{maxPics}</strong> color
        {maxPics === 1 ? '' : 's'} &mdash; add up to{' '}
        <strong>{maxPics}</strong> picture
        {maxPics === 1 ? '' : 's'} (one per color). You and the business can add
        or remove pictures here.
      </p>
      {picsLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
          <Loader /> Loading pictures{'\u2026'}
        </div>
      ) : (
        <ImageUploader
          value={picsImages}
          onChange={setPicsImages}
          max={maxPics}
          disabled={picsSaving}
          addLabel="Add picture"
          thumbSize={80}
        />
      )}
    </Modal>
  );
}

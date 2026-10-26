import { useEffect, useState } from 'react';

interface Props {
  onSave: (withMarks: boolean) => void;
  onCancel: () => void;
}

export function SaveModal({ onSave, onCancel }: Props) {
  const [marks, setMarks] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save portrait" onClick={(e) => e.stopPropagation()}>
        <h2>Save your shared portrait?</h2>
        <p>Downloads the artwork as a PNG. Only the drawing is saved — no camera footage, sound or keypoints.</p>
        <div className="choice">
          <label className="check">
            <input type="radio" name="exp" checked={!marks} onChange={() => setMarks(false)} />
            <span><b>Artwork only</b> — paper and ink, no interface</span>
          </label>
          <label className="check">
            <input type="radio" name="exp" checked={marks} onChange={() => setMarks(true)} />
            <span><b>With signal marks</b> — coordinates, scales and a caption</span>
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" autoFocus onClick={() => onSave(marks)}>Save PNG</button>
        </div>
      </div>
    </div>
  );
}

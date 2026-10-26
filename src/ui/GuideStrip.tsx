import { GUIDE_CATEGORIES } from '../lang/lexicon';

export const GUIDE_STEPS = [
  { id: 'answer', title: 'Answer', text: 'What makes you feel at home? Both answer in your own language — type, or press speak.' },
  { id: 'elements', title: 'Elements', text: 'Your words become elements in “my elements”: HOME → house · HOPE → halo · NATURE → tree/flower · FREEDOM → wings · CONNECTION → bridge.' },
  { id: 'send', title: 'Send & Catch', text: 'Each person sends one element. The other reaches a hand to it for half a second — or presses Catch.' },
  { id: 'transform', title: 'Transform', text: 'Change what you caught: turn it, resize it, add your own texture — then place it or send it back.' },
  { id: 'sanctuary', title: 'Shared Sanctuary', text: 'A moves the left wing, B the right. Raise your hands to open them; moving together grows the house, halo and rays.' },
  { id: 'reflect', title: 'Reflect', text: 'End the session to see your artwork, the creation video and your communication portrait.' },
] as const;

interface Props {
  step: number;
  progress: string;
  onNext: () => void;
  onExit: () => void;
  onEnd: () => void;
}

/** Guided experience: a slim strip above the canvas. Every step can be skipped; Free Canvas is one click away. */
export function GuideStrip({ step, progress, onNext, onExit, onEnd }: Props) {
  const s = GUIDE_STEPS[step];
  return (
    <div className="guide ui" role="region" aria-label="Guided experience">
      <ol className="guide-dots">
        {GUIDE_STEPS.map((g, i) => (
          <li key={g.id} className={i < step ? 'done' : i === step ? 'now' : ''} title={g.title}>{i + 1}</li>
        ))}
      </ol>
      <div className="guide-text">
        <b>{s.title}.</b> {s.text}
        {s.id === 'elements' && (
          <span className="guide-map">
            {GUIDE_CATEGORIES.map((c) => <span key={c.id} className="mono small">{c.id}→{c.element}</span>)}
          </span>
        )}
        {progress && <span className="guide-progress mono small"> · {progress}</span>}
      </div>
      <div className="guide-actions">
        {s.id === 'reflect' ? (
          <button className="btn primary" onClick={onEnd}>See our portraits</button>
        ) : (
          <button className="btn" onClick={onNext}>{step === 0 ? 'Skip' : 'Next'}</button>
        )}
        <button className="btn ghost" onClick={onExit}>Free canvas</button>
      </div>
    </div>
  );
}

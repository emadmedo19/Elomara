import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

type Confirmation = { title: string; description: string };
export function useSuccessFeedback() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audio = useRef<AudioContext | null>(null);
  const mounted = useRef(true);
  useBodyScrollLock(confirmation !== null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      if (audio.current && audio.current.state !== 'closed') void audio.current.close().catch(() => {});
      audio.current = null;
    };
  }, []);
  // Unlock audio in the user's click/submit gesture before the network request.
  // No tone is played until the server confirms success.
  const prepare = useCallback(() => {
    try {
      if (!audio.current && typeof AudioContext !== 'undefined') audio.current = new AudioContext();
      if (audio.current?.state === 'suspended') void audio.current.resume().catch(() => {});
    } catch { /* The visual confirmation works even when audio is unavailable. */ }
  }, []);
  const dismiss = useCallback(() => { clearTimeout(timer.current); setConfirmation(null); }, []);
  const show = useCallback((value: Confirmation) => {
    if (!mounted.current) return;
    clearTimeout(timer.current);
    setConfirmation(value);
    timer.current = setTimeout(() => setConfirmation(null), 2800);
    const context = audio.current;
    if (!context || context.state === 'closed') return;
    void context.resume().then(() => {
      if (!mounted.current || context.state === 'closed') return;
      [659.25, 880].forEach((frequency, index) => {
        const tone = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + index * .12;
        tone.type = 'sine'; tone.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.12, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .22);
        tone.connect(gain); gain.connect(context.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(start); tone.stop(start + .24);
      });
    }).catch(() => {});
  }, []);
  const feedback = confirmation ? createPortal(
    <div data-success-feedback dir="rtl" className="success-feedback" onClick={dismiss}>
      <section role="status" aria-live="polite" aria-atomic="true" className="success-feedback-card" onClick={event => event.stopPropagation()}>
        <div className="success-feedback-icon" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="43"/><path d="m29 51 14 14 29-30"/></svg></div>
        <h2>{confirmation.title}</h2><p>{confirmation.description}</p>
        <button type="button" onClick={dismiss}>تمام</button>
      </section>
    </div>, document.body) : null;
  return { prepare, show, feedback };
}

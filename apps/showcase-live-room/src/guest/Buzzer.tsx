import { useEffect, useRef } from 'react';
import { fireTexture } from '@shippie/sdk/wrapper';

interface BuzzerProps {
  locked: boolean;
  isMine: boolean;
  onBuzz: () => void;
}

export function Buzzer({ locked, isMine, onBuzz }: BuzzerProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  // When this guest wins the buzz, layer the `complete` texture on top of the
  // `confirm` that already fired on tap.
  useEffect(() => {
    if (isMine && ref.current) {
      try {
        fireTexture('complete', ref.current);
      } catch {
        /* engine not ready (test) */
      }
    }
  }, [isMine]);

  return (
    <div className="buzzer-area">
      <button
        ref={ref}
        type="button"
        className={`buzzer ${locked ? 'buzzer-locked' : ''} ${isMine ? 'buzzer-mine' : ''}`}
        disabled={locked}
        onClick={() => {
          if (!locked) onBuzz();
        }}
        aria-label="Buzz in"
      >
        BUZZ
      </button>
      {locked && !isMine ? <p>Someone got there first.</p> : null}
      {isMine ? <p>You buzzed first!</p> : null}
    </div>
  );
}

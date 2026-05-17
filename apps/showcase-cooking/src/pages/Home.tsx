/**
 * Home — cut picker + method picker. Selecting cut + method lands the
 * user on the method-specific guide page.
 */

import { CUTS, METHOD_LABEL, METHOD_BLURB, type Cut, type Method } from '../data.ts';
import { MethodPicker } from '../components/MethodPicker.tsx';

interface HomeProps {
  cut: Cut;
  method: Method;
  onPickCut(c: Cut): void;
  onPickMethod(m: Method): void;
  onOpenGuide(): void;
}

export function Home({ cut, method, onPickCut, onPickMethod, onOpenGuide }: HomeProps) {
  return (
    <div className="page page--home">
      <section className="cut-grid" aria-label="Cuts">
        {CUTS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cut-chip ${c.id === cut.id ? 'active' : ''}`}
            onClick={() => onPickCut(c)}
          >
            {c.name}
          </button>
        ))}
      </section>

      <MethodPicker available={cut.methods} active={method} onPick={onPickMethod} />

      <section className="method-blurb">
        <p className="eyebrow">{METHOD_LABEL[method]}</p>
        <p className="lede">{METHOD_BLURB[method]}</p>
      </section>

      <button type="button" className="primary start-cook" onClick={onOpenGuide}>
        Open {METHOD_LABEL[method].toLowerCase()} guide
      </button>
    </div>
  );
}

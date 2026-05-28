import { useState } from 'react';

/**
 * Tiny chip row above the map for muting/unmuting layers. Re-uses the
 * sharp/paper/mono design language; no new colour. Each pill is a button
 * with `aria-pressed` reflecting the current visibility.
 *
 * Round 8 split the layers into two rows: People (convoy / friends / side-tings
 * / reports / my-taps) and Places (toilets / water / atm). Volatile food/pub
 * availability is peer-reported instead of baked as static "open" data.
 */
export type MapLayerId =
  // People layers — fan signals, group positions, convoy marker.
  | 'bus'
  | 'friends'
  | 'crowd'
  | 'side-tings'
  | 'reports'
  | 'my-taps'
  // Places layers — baked POI categories.
  | 'toilets'
  | 'water'
  | 'atm';

interface LayerToggleRowProps {
  layers: Record<MapLayerId, boolean>;
  onToggle: (id: MapLayerId) => void;
}

const LAYER_LABEL: Record<MapLayerId, string> = {
  bus: 'Convoy',
  friends: 'Friends',
  crowd: 'Crowd',
  'side-tings': 'Side tings',
  reports: 'Reports',
  'my-taps': 'My taps',
  toilets: 'WC',
  water: 'Water',
  atm: 'ATM',
};

const PEOPLE_LAYERS: MapLayerId[] = ['bus', 'friends', 'crowd', 'reports', 'my-taps', 'side-tings'];
const PLACE_LAYERS: MapLayerId[] = ['toilets', 'water', 'atm'];

export function LayerToggleRow({ layers, onToggle }: LayerToggleRowProps) {
  const [open, setOpen] = useState(false);
  const activeCount = Object.values(layers).filter(Boolean).length;

  return (
    <div className="layer-toggle-stack" aria-label="Map layers">
      <button
        type="button"
        className="layer-toggle-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Map layers</span>
        <strong>{activeCount} on</strong>
        <em>{open ? 'Less' : 'More'}</em>
      </button>
      {open ? (
        <>
          <LayerRow group="People" ids={PEOPLE_LAYERS} layers={layers} onToggle={onToggle} />
          <LayerRow group="Places" ids={PLACE_LAYERS} layers={layers} onToggle={onToggle} />
        </>
      ) : null}
    </div>
  );
}

interface LayerRowProps {
  group: string;
  ids: MapLayerId[];
  layers: Record<MapLayerId, boolean>;
  onToggle: (id: MapLayerId) => void;
}

function LayerRow({ group, ids, layers, onToggle }: LayerRowProps) {
  return (
    <div className="layer-toggle-row" role="group" aria-label={`${group} layers`}>
      <span className="layer-toggle-row__label" aria-hidden>
        {group}
      </span>
      {ids.map((id) => {
        const on = layers[id];
        return (
          <button
            key={id}
            type="button"
            className={`layer-toggle layer-toggle--${id} ${on ? 'is-on' : 'is-off'}`}
            aria-pressed={on}
            onClick={() => onToggle(id)}
          >
            <span className="layer-toggle__dot" aria-hidden />
            <span className="layer-toggle__label">{LAYER_LABEL[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

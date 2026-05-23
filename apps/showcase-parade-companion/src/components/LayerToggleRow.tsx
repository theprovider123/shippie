/**
 * Tiny chip row above the map for muting/unmuting layers. Re-uses the
 * sharp/paper/mono design language; no new colour. Each pill is a button
 * with `aria-pressed` reflecting the current visibility.
 */
export type MapLayerId = 'bus' | 'friends' | 'side-tings' | 'reports' | 'my-taps';

interface LayerToggleRowProps {
  layers: Record<MapLayerId, boolean>;
  onToggle: (id: MapLayerId) => void;
}

const LAYER_LABEL: Record<MapLayerId, string> = {
  bus: 'Bus',
  friends: 'Friends',
  'side-tings': 'Side tings',
  reports: 'Reports',
  'my-taps': 'My taps',
};

const LAYER_ORDER: MapLayerId[] = ['bus', 'friends', 'side-tings', 'reports', 'my-taps'];

export function LayerToggleRow({ layers, onToggle }: LayerToggleRowProps) {
  return (
    <div className="layer-toggle-row" role="group" aria-label="Map layers">
      {LAYER_ORDER.map((id) => {
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

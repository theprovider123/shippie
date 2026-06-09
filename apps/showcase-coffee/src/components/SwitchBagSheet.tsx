// "Switch bag" — pick which active bag the Brew screen is driving.

import { C, F } from '../tokens.ts';
import type { Bag } from '../types.ts';
import { Sheet } from './Sheet.tsx';
import { BagCard } from './BagCard.tsx';

export interface SwitchBagSheetProps {
  bags: Bag[];
  activeBagId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function SwitchBagSheet({ bags, activeBagId, onSelect, onClose }: SwitchBagSheetProps) {
  return (
    <Sheet title="Switch bag" onClose={onClose} meta={`${bags.length} active`}>
      {bags.length === 0 ? (
        <p style={{ fontFamily: F.sans, fontSize: 13, color: C.espressoLight, fontStyle: 'italic', padding: '20px 0' }}>
          No active bags. Add one from the Cellar.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bags.map((bag) => (
            <BagCard
              key={bag.id}
              bag={bag}
              isActive={bag.id === activeBagId}
              onSelect={() => {
                onSelect(bag.id);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}

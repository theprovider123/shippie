/**
 * Pantry store hook — one source of truth for items + consumption log.
 *
 * Pages call `useStore()` to read `items`, `consumption`, and the
 * mutators (addItem, updateItem, removeItem, decrementItem, recordCook).
 * The store auto-persists on every change and rebroadcasts
 * `pantry-inventory` on the SDK so consumers stay in sync.
 *
 * The store is intentionally a hook rather than a context provider —
 * the showcase only ever has one consumer tree, the simpler shape is
 * easier to read.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ShippieIframeSdk } from '@shippie/iframe-sdk';
import type {
  ConsumptionEvent,
  InventoryRow,
  Item,
  Location,
} from './types.ts';
import {
  appendConsumption,
  loadConsumption,
  loadItems,
  nameKey,
  saveConsumption,
  saveItems,
} from './storage.ts';
import { consumptionEventFromItem } from './low-stock-predict.ts';

export interface ItemDraft {
  name: string;
  quantity?: number;
  unit?: string;
  expiresOn?: string;
  location?: Location;
  barcode?: string;
  notes?: string;
}

export interface PantryStore {
  items: Item[];
  consumption: ConsumptionEvent[];
  /** Add a new item; returns the created row. */
  addItem(draft: ItemDraft): Item;
  updateItem(id: string, patch: Partial<Item>): void;
  removeItem(id: string, source?: ConsumptionEvent['source']): void;
  /** -1 unit; removes the row if quantity reaches 0. Records a consumption. */
  decrementItem(id: string, source?: ConsumptionEvent['source']): void;
  /**
   * Record a cooked-meal event, decrementing every matching pantry item
   * by 1 unit. Returns the names that decremented for status.
   */
  recordCookedMeal(ingredientNames: readonly string[]): string[];
  clearAll(): void;
}

export function usePantryStore(shippie: ShippieIframeSdk): PantryStore {
  const [items, setItems] = useState<Item[]>(() => loadItems());
  const [consumption, setConsumption] = useState<ConsumptionEvent[]>(() =>
    loadConsumption(),
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Persist + broadcast on every change.
  useEffect(() => {
    saveItems(items);
    broadcastInventory(shippie, items);
  }, [items, shippie]);

  useEffect(() => {
    saveConsumption(consumption);
  }, [consumption]);

  // Initial broadcast — consumers shouldn't have to wait for the next
  // mutation to learn the inventory.
  const didFirstBroadcast = useRef(false);
  useEffect(() => {
    if (didFirstBroadcast.current) return;
    didFirstBroadcast.current = true;
    broadcastInventory(shippie, itemsRef.current);
  }, [shippie]);

  const addItem = useCallback((draft: ItemDraft): Item => {
    const now = new Date().toISOString();
    const item: Item = {
      id: `i_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: draft.name.trim(),
      nameKey: nameKey(draft.name),
      quantity: draft.quantity ?? 1,
      unit: draft.unit?.trim() || 'ea',
      expiresOn: draft.expiresOn || undefined,
      location: draft.location ?? 'pantry',
      barcode: draft.barcode || undefined,
      notes: draft.notes || undefined,
      addedAt: now,
      updatedAt: now,
    };
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              ...patch,
              nameKey: patch.name ? nameKey(patch.name) : it.nameKey,
              updatedAt: new Date().toISOString(),
            }
          : it,
      ),
    );
  }, []);

  const removeItem = useCallback(
    (id: string, source: ConsumptionEvent['source'] = 'manual') => {
      const removed = itemsRef.current.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (removed) {
        const event = consumptionEventFromItem(
          removed,
          source,
          new Date().toISOString(),
          removed.quantity,
        );
        setConsumption((prev) => appendConsumption(prev, event));
        // pantry-low broadcasts on manual removal so Shopping List can
        // auto-add the missing item.
        if (source === 'manual') {
          shippie.intent.broadcast('pantry-low', [
            {
              name: removed.name,
              barcode: removed.barcode,
              lastSeenAt: removed.updatedAt,
              confidence: 'manual',
            },
          ]);
        }
        shippie.feel.texture('delete');
      }
    },
    [shippie],
  );

  const decrementItem = useCallback(
    (id: string, source: ConsumptionEvent['source'] = 'manual') => {
      const target = itemsRef.current.find((i) => i.id === id);
      if (!target) return;
      if (target.quantity <= 1) {
        removeItem(id, source);
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                quantity: it.quantity - 1,
                updatedAt: new Date().toISOString(),
              }
            : it,
        ),
      );
      const event = consumptionEventFromItem(
        target,
        source,
        new Date().toISOString(),
        1,
      );
      setConsumption((prev) => appendConsumption(prev, event));
      shippie.feel.texture('toggle');
    },
    [removeItem, shippie],
  );

  const recordCookedMeal = useCallback(
    (ingredientNames: readonly string[]): string[] => {
      const decremented: string[] = [];
      const now = new Date().toISOString();
      setItems((prev) => {
        const next = [...prev];
        for (const ing of ingredientNames) {
          const k = nameKey(ing);
          if (!k) continue;
          // Match by exact key or substring — same rule as recipe match.
          const idx = next.findIndex(
            (it) =>
              it.quantity > 0 &&
              (it.nameKey === k ||
                it.nameKey.includes(k) ||
                k.includes(it.nameKey)),
          );
          if (idx === -1) continue;
          const target = next[idx]!;
          decremented.push(target.name);
          if (target.quantity <= 1) {
            next.splice(idx, 1);
          } else {
            next[idx] = {
              ...target,
              quantity: target.quantity - 1,
              updatedAt: now,
            };
          }
        }
        return next;
      });
      // Append consumption events for the matched names (we use the
      // ingredient name, not the pantry name, because that's what the
      // cooking app sent us).
      if (decremented.length > 0) {
        setConsumption((prev) => {
          let acc = prev;
          for (const name of decremented) {
            acc = appendConsumption(acc, {
              nameKey: nameKey(name),
              at: now,
              source: 'cooked-meal',
              quantity: 1,
            });
          }
          return acc;
        });
      }
      return decremented;
    },
    [],
  );

  const clearAll = useCallback(() => {
    setItems([]);
    setConsumption([]);
  }, []);

  return useMemo(
    () => ({
      items,
      consumption,
      addItem,
      updateItem,
      removeItem,
      decrementItem,
      recordCookedMeal,
      clearAll,
    }),
    [
      items,
      consumption,
      addItem,
      updateItem,
      removeItem,
      decrementItem,
      recordCookedMeal,
      clearAll,
    ],
  );
}

function broadcastInventory(
  shippie: ShippieIframeSdk,
  items: readonly Item[],
): void {
  const rows: InventoryRow[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    inStock: it.quantity > 0,
    quantity: it.quantity,
    unit: it.unit,
    expiresOn: it.expiresOn,
    location: it.location,
  }));
  shippie.intent.broadcast('pantry-inventory', rows);
}

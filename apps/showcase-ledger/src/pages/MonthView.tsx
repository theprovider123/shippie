import { useEffect, useState } from 'react';
import {
  formatCents,
  monthTotals,
  type CategoryTotal,
  type MonthTotals,
} from '../db/queries.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface MonthViewProps {
  db: ShippieLocalDb;
  year: number;
  month: number;
  onMonthChange(year: number, month: number): void;
  currency: string;
  refreshKey: number;
  onExport(): void;
}

export function MonthView({
  db,
  year,
  month,
  onMonthChange,
  currency,
  refreshKey,
  onExport,
}: MonthViewProps) {
  const [totals, setTotals] = useState<MonthTotals>({
    spend_cents: 0,
    income_cents: 0,
    net_cents: 0,
    by_category: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await monthTotals(db, year, month);
      if (!cancelled) setTotals(t);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, year, month, refreshKey]);

  const monthLabel = formatMonthLabel(year, month);
  const isCurrentMonth = isSameMonthAsToday(year, month);
  const maxSpend = Math.max(1, ...totals.by_category.map((c) => c.spend_cents));
  const spendCats = totals.by_category.filter((c) => c.spend_cents > 0);
  const incomeCats = totals.by_category.filter((c) => c.income_cents > 0);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Month</span>
          </div>
          <h1>{monthLabel}</h1>
        </div>
        <div className="month-nav" role="group" aria-label="Change month">
          <button type="button" onClick={() => navMonth(year, month, -1, onMonthChange)}>
            ‹
          </button>
          <button
            type="button"
            disabled={isCurrentMonth}
            onClick={() => navMonth(year, month, 1, onMonthChange)}
          >
            ›
          </button>
        </div>
      </header>

      <div className="totals-strip">
        <div>
          <span className="label">Spent</span>
          <span className="value">{formatCents(totals.spend_cents, currency)}</span>
        </div>
        <div>
          <span className="label">Received</span>
          <span className="value positive">{formatCents(totals.income_cents, currency)}</span>
        </div>
        <div>
          <span className="label">Net</span>
          <span
            className={`value ${
              totals.net_cents < 0 ? 'negative' : totals.net_cents > 0 ? 'positive' : ''
            }`}
          >
            {formatCents(totals.net_cents, currency)}
          </span>
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={onExport}>
          Export CSV
        </button>
      </div>

      {spendCats.length > 0 ? (
        <section>
          <h3 className="eyebrow" style={{ marginBottom: 8 }}>
            Spending by category
          </h3>
          <CategoryBars
            rows={spendCats}
            field="spend_cents"
            max={maxSpend}
            currency={currency}
          />
        </section>
      ) : null}

      {incomeCats.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <h3 className="eyebrow" style={{ marginBottom: 8 }}>
            Income by category
          </h3>
          <CategoryBars
            rows={incomeCats}
            field="income_cents"
            max={Math.max(1, ...incomeCats.map((c) => c.income_cents))}
            currency={currency}
          />
        </section>
      ) : null}

      {spendCats.length === 0 && incomeCats.length === 0 ? (
        <div className="empty-state">No entries this month.</div>
      ) : null}

      <div className="privacy-note">
        Aggregations are computed locally from typed entries. Numbers stay on this phone.
      </div>
    </section>
  );
}

interface CategoryBarsProps {
  rows: ReadonlyArray<CategoryTotal>;
  field: 'spend_cents' | 'income_cents';
  max: number;
  currency: string;
}

function CategoryBars({ rows, field, max, currency }: CategoryBarsProps) {
  return (
    <div className="bar-list">
      {rows.map((r) => {
        const value = r[field];
        const widthPct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
        return (
          <div className="bar-row" key={`${r.category_id ?? 'none'}-${field}`}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track" aria-hidden>
              <span className="bar-fill" style={{ width: `${widthPct}%` }} />
            </span>
            <span className="bar-amount">{formatCents(value, currency)}</span>
          </div>
        );
      })}
    </div>
  );
}

function navMonth(
  year: number,
  month: number,
  delta: number,
  onChange: (y: number, m: number) => void,
): void {
  let nm = month + delta;
  let ny = year;
  while (nm > 12) {
    nm -= 12;
    ny += 1;
  }
  while (nm < 1) {
    nm += 12;
    ny -= 1;
  }
  onChange(ny, nm);
}

function formatMonthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return `${d.toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  })} ${year}`;
}

function isSameMonthAsToday(year: number, month: number): boolean {
  const today = new Date();
  return today.getFullYear() === year && today.getMonth() + 1 === month;
}

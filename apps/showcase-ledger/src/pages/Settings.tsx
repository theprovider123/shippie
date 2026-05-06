import { setCurrency } from '../db/queries.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface SettingsProps {
  db: ShippieLocalDb;
  currency: string;
  onCurrencyChange(next: string): void;
}

const SUPPORTED = ['GBP', 'USD', 'EUR', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'] as const;

export function Settings({ db, currency, onCurrencyChange }: SettingsProps) {
  async function handleChange(next: string) {
    await setCurrency(db, next);
    onCurrencyChange(next);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Settings</span>
          </div>
          <h1>Settings</h1>
        </div>
      </header>

      <div className="field">
        <label htmlFor="currency-select">Currency</label>
        <select
          id="currency-select"
          value={currency}
          onChange={(e) => handleChange(e.target.value)}
        >
          {SUPPORTED.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          Single currency per ledger. Existing entries keep their stored currency.
        </span>
      </div>

      <div className="privacy-note">
        Ledger has no servers. No bank connections. No Plaid. No aggregator. Numbers stay on this phone. CSV export is the product.
      </div>
    </section>
  );
}

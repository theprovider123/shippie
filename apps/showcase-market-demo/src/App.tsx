import { useMemo, useState, type CSSProperties } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  CATEGORY_META,
  EVENTS,
  FACILITIES,
  FILTERS,
  GETTING_THERE,
  MARKET,
  VENDORS,
  type Vendor,
  type VendorCategory,
} from './data.ts';

type Tab = 'home' | 'stalls' | 'events' | 'stamps' | 'visit';

const TABS: Array<{ key: Tab; label: string; icon: IconName }> = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'stalls', label: 'Stalls', icon: 'map' },
  { key: 'events', label: 'Events', icon: 'calendar' },
  { key: 'stamps', label: 'Stamps', icon: 'stamp' },
  { key: 'visit', label: 'Visit', icon: 'info' },
];

const DEFAULT_VENDOR = requireVendor('e5');

const MAP_LABELS: Record<string, string> = {
  'The Suffolk Smokehouse': 'Suffolk',
  'Crosstown Doughnuts': 'Cross.',
  'The Dusty Knuckle': 'Dusty',
  'Blackwoods Cheese Company': 'Black.',
  'Shrub & Sprout': 'Shrub',
  'Highbury Ceramics': 'Pots',
  'The London Apiarist': 'Apiarist',
  'Tendercare Nurseries': 'Tendercare',
};

export function App() {
  const sdk = useMemo(() => createShippieIframeSdk({ appId: 'market-demo' }), []);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [activeCategory, setActiveCategory] = useState<'all' | VendorCategory>('all');
  const [query, setQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('e5');
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [reservedEvents, setReservedEvents] = useState<Record<string, boolean>>({});

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VENDORS.filter((vendor) => {
      const categoryMatch =
        activeCategory === 'all' || vendor.category === activeCategory;
      const text = [
        vendor.name,
        vendor.stall,
        vendor.description,
        vendor.farmer ?? '',
        vendor.week ?? '',
        vendor.payment,
      ]
        .join(' ')
        .toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    });
  }, [activeCategory, query]);

  const selectedVendor =
    VENDORS.find((vendor) => vendor.id === selectedVendorId) ?? DEFAULT_VENDOR;

  function texture(name: 'confirm' | 'complete' | 'navigate' | 'toggle') {
    sdk.feel.texture(name);
  }

  function navigate(next: Tab) {
    setActiveTab(next);
    texture('navigate');
  }

  function openVendor(vendorId: string) {
    setSelectedVendorId(vendorId);
    setActiveTab('stalls');
    texture('navigate');
    sdk.intent.broadcast('market.vendor-viewed', [
      { vendor_id: vendorId, viewed_at: new Date().toISOString() },
    ]);
  }

  function reserveEvent(eventId: string) {
    setReservedEvents((prev) => ({ ...prev, [eventId]: !prev[eventId] }));
    texture(reservedEvents[eventId] ? 'toggle' : 'confirm');
    sdk.intent.broadcast('market.event-reserved', [
      { event_id: eventId, reserved_at: new Date().toISOString() },
    ]);
  }

  async function checkIn() {
    if (checkedIn || checkingIn) return;
    setCheckingIn(true);

    const fix = await getCurrentPositionSafe();
    let status: CheckInStatus;
    if (fix) {
      const distanceM = haversineMeters(
        fix.coords.latitude,
        fix.coords.longitude,
        HIGHBURY_FIELDS.lat,
        HIGHBURY_FIELDS.lon,
      );
      status = {
        verified: distanceM <= CHECK_IN_RADIUS_M,
        locationKnown: true,
        distanceM: Math.round(distanceM),
      };
    } else {
      status = { verified: false, locationKnown: false, distanceM: null };
    }

    setCheckInStatus(status);
    setCheckedIn(true);
    setCheckingIn(false);
    texture('complete');
    sdk.intent.broadcast('market.checked-in', [
      {
        market: MARKET.name,
        stamps: 9,
        verified: status.verified,
        distance_m: status.distanceM,
        checked_in_at: new Date().toISOString(),
      },
    ]);
  }

  return (
    <div className="market-stage">
      <div className="market-app" data-view={activeTab}>
        <header className="topbar">
          <button
            className="brand-chip"
            type="button"
            onClick={() => navigate('home')}
            aria-label="Open market home"
          >
            <span className="brand-mark" aria-hidden="true">
              <Icon name="stall" />
            </span>
            <span>
              <strong>Highbury</strong>
              <small>Sunday market</small>
            </span>
          </button>
          <span className="time-chip">10 AM - 2 PM</span>
        </header>

        <main className="market-main">
          {activeTab === 'home' && (
            <HomeScreen onNavigate={navigate} onOpenVendor={openVendor} />
          )}
          {activeTab === 'stalls' && (
            <StallsScreen
              activeCategory={activeCategory}
              filteredVendors={filteredVendors}
              query={query}
              selectedVendor={selectedVendor}
              onCategory={setActiveCategory}
              onOpenVendor={openVendor}
              onQuery={setQuery}
            />
          )}
          {activeTab === 'events' && (
            <EventsScreen reservedEvents={reservedEvents} onReserve={reserveEvent} />
          )}
          {activeTab === 'stamps' && (
            <StampsScreen
              checkedIn={checkedIn}
              checkingIn={checkingIn}
              status={checkInStatus}
              onCheckIn={checkIn}
            />
          )}
          {activeTab === 'visit' && <VisitScreen />}
        </main>

        <nav className="tabbar" aria-label="Market guide sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="tab-button"
              aria-current={activeTab === tab.key ? 'page' : undefined}
              onClick={() => navigate(tab.key)}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function HomeRow({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="home-row" onClick={onClick}>
      <span className="home-row-text">
        <strong>{label}</strong>
        <small>{sub}</small>
      </span>
      <Icon name="arrow" />
    </button>
  );
}

function HomeScreen({
  onNavigate,
}: {
  onNavigate: (tab: Tab) => void;
  onOpenVendor: (vendorId: string) => void;
}) {
  const here = VENDORS.filter((vendor) => !vendor.away).length;
  const [seasonTag, seasonHead] = MARKET.theme.split(' - ');
  return (
    <div className="screen home-screen">
      <section className="hero-panel">
        <MarketIllustration />
        <div className="hero-copy">
          <p className="eyebrow">This Sunday · 10–2</p>
          <h1>{MARKET.name}</h1>
          <p className="hero-note">{MARKET.strapline}</p>
        </div>
      </section>

      <section className="season-band" aria-label="In season now">
        <p className="eyebrow">In season · {seasonTag}</p>
        <p className="season-head">{seasonHead ?? MARKET.theme}</p>
      </section>

      <nav className="home-rows" aria-label="Market sections">
        <HomeRow label="Find your stall" sub={`${here} here today · live map`} onClick={() => onNavigate('stalls')} />
        <HomeRow label="What's on today" sub={`${EVENTS.length} events · talks & tastings`} onClick={() => onNavigate('events')} />
        <HomeRow label="Your market card" sub="8 of 10 Sundays · 2 to go" onClick={() => onNavigate('stamps')} />
        <HomeRow label="Plan your visit" sub={`${MARKET.location} · getting here`} onClick={() => onNavigate('visit')} />
      </nav>

      <section className="notice-band">
        <p className="eyebrow">Since {MARKET.established}</p>
        <p>{MARKET.about}</p>
      </section>
    </div>
  );
}

function StallsScreen({
  activeCategory,
  filteredVendors,
  query,
  selectedVendor,
  onCategory,
  onOpenVendor,
  onQuery,
}: {
  activeCategory: 'all' | VendorCategory;
  filteredVendors: Vendor[];
  query: string;
  selectedVendor: Vendor;
  onCategory: (category: 'all' | VendorCategory) => void;
  onOpenVendor: (vendorId: string) => void;
  onQuery: (query: string) => void;
}) {
  return (
    <div className="screen stalls-screen">
      <section className="page-title">
        <p className="eyebrow">Find your stall</p>
        <h1>Market map</h1>
        <p>
          {VENDORS.filter((vendor) => !vendor.away).length} of {VENDORS.length}{' '}
          featured stalls here this Sunday.
        </p>
      </section>

      <section className="map-panel" aria-label="Illustrated market map">
        <div className="map-legend">
          {(Object.keys(CATEGORY_META) as VendorCategory[]).map((key) => (
            <span key={key}>
              <i style={{ '--tone': CATEGORY_META[key].color } as CSSProperties} />
              {CATEGORY_META[key].short}
            </span>
          ))}
        </div>
        <div className="stall-map">
          <div className="map-grid">
            {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((row, index) => (
              <span
                key={row}
                className="map-row-label"
                style={{ gridRow: index + 1 } as CSSProperties}
              >
                {row}
              </span>
            ))}
            {VENDORS.map((vendor) => {
              const meta = CATEGORY_META[vendor.category];
              const style = {
                '--tone': meta.color,
                gridColumn: `${vendor.map.slot} / span ${vendor.map.span}`,
                gridRow: vendor.map.row,
              } as CSSProperties;
              return (
                <button
                  key={vendor.id}
                  type="button"
                  className="map-stall"
                  data-away={vendor.away ? 'true' : 'false'}
                  data-selected={vendor.id === selectedVendor.id ? 'true' : 'false'}
                  style={style}
                  onClick={() => onOpenVendor(vendor.id)}
                >
                  <span>{shortVendorName(vendor.name)}</span>
                  {(vendor.featured || vendor.newThisWeek) && <b aria-hidden="true">★</b>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="selected-vendor">
        <VendorDetail vendor={selectedVendor} />
      </section>

      <section className="directory-section">
        <label className="search-box">
          <Icon name="search" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search vendors or produce"
            type="search"
          />
        </label>
        <div className="filter-row" role="group" aria-label="Vendor categories">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="filter-button"
              aria-pressed={activeCategory === filter.key}
              onClick={() => onCategory(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="vendor-list">
          {filteredVendors.map((vendor) => (
            <VendorCard key={vendor.id} vendor={vendor} onOpen={onOpenVendor} />
          ))}
          {filteredVendors.length === 0 && (
            <p className="empty-note">No matching stalls this Sunday.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function VendorCard({
  vendor,
  onOpen,
}: {
  vendor: Vendor;
  onOpen: (vendorId: string) => void;
}) {
  const meta = CATEGORY_META[vendor.category];
  return (
    <button
      type="button"
      className="vendor-card"
      style={{ '--tone': meta.color } as CSSProperties}
      onClick={() => onOpen(vendor.id)}
    >
      <span className="vendor-card-main">
        <strong>{vendor.name}</strong>
        <small>{vendor.description}</small>
      </span>
      <span className="vendor-card-meta">
        <span>{vendor.stall}</span>
        <span className={vendor.away ? 'status-away' : 'status-here'}>
          {vendor.away ? 'Away' : 'Here'}
        </span>
      </span>
    </button>
  );
}

function VendorDetail({ vendor }: { vendor: Vendor }) {
  const meta = CATEGORY_META[vendor.category];
  return (
    <article className="vendor-detail" style={{ '--tone': meta.color } as CSSProperties}>
      <div className="vendor-detail-head">
        <p className="eyebrow">{meta.label}</p>
        <span>{vendor.stall}</span>
      </div>
      <h2>{vendor.name}</h2>
      <p>{vendor.description}</p>
      {vendor.farmer && <p className="soft-line">Farmer: {vendor.farmer}</p>}
      {vendor.bestKnown && <p className="soft-line">Best known: {vendor.bestKnown}</p>}
      {vendor.week && <p className="weekly-line">{vendor.week}</p>}
      {vendor.away && <p className="away-line">{vendor.away}</p>}
      <div className="badge-row" aria-label="Vendor details">
        <span>{vendor.payment}</span>
        {vendor.regular && <span>Every week</span>}
        {vendor.featured && <span>Featured</span>}
        {vendor.newThisWeek && <span>New this week</span>}
        {vendor.organic && <span>Organic</span>}
        {vendor.veganFriendly && <span>Vegan-friendly</span>}
      </div>
    </article>
  );
}

function EventsScreen({
  reservedEvents,
  onReserve,
}: {
  reservedEvents: Record<string, boolean>;
  onReserve: (eventId: string) => void;
}) {
  const nextEvent = EVENTS[0];
  return (
    <div className="screen events-screen">
      <section className="page-title">
        <p className="eyebrow">What's on</p>
        <h1>This Sunday at the market</h1>
      </section>

      {nextEvent && (
        <section className="next-event">
          <p className="eyebrow">Next up</p>
          <h2>{nextEvent.title}</h2>
          <p>
            {nextEvent.label} at {nextEvent.time} - {nextEvent.location}
          </p>
        </section>
      )}

      <section className="timeline" aria-label="Sunday event timeline">
        {EVENTS.map((event) => (
          <article key={event.id} className="timeline-row">
            <time>{event.time}</time>
            <div className="timeline-card">
              <p className="eyebrow">{event.label}</p>
              <h2>{event.title}</h2>
              <p>{event.location}</p>
              <small>
                {event.note}
                {event.cost ? ` · ${event.cost}` : ''}
              </small>
              {event.limited && (
                <button
                  type="button"
                  className="reserve-button"
                  aria-pressed={Boolean(reservedEvents[event.id])}
                  onClick={() => onReserve(event.id)}
                >
                  <Icon name="ticket" />
                  {reservedEvents[event.id] ? 'Reserved' : 'Reserve place'}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function StampsScreen({
  checkedIn,
  checkingIn,
  status,
  onCheckIn,
}: {
  checkedIn: boolean;
  checkingIn: boolean;
  status: CheckInStatus | null;
  onCheckIn: () => void;
}) {
  const stamps = checkedIn ? 9 : 8;
  const remaining = 10 - stamps;
  return (
    <div className="screen stamps-screen">
      <section className="page-title">
        <p className="eyebrow">Your market stamps</p>
        <h1>Every Sunday counts</h1>
        <p>
          Check in at the market to add a stamp. If you share your location we
          confirm you're within {CHECK_IN_RADIUS_M}m of Highbury Fields;
          otherwise the stamp is added unverified.
        </p>
        {checkedIn && status && (
          <p className="checkin-status" role="status">
            {checkInMessage(status)}
          </p>
        )}
      </section>

      <section className="stamp-card">
        <div className="stamp-grid" aria-label={`${stamps} of 10 Sundays visited`}>
          {Array.from({ length: 10 }, (_, index) => {
            const earned = index < stamps;
            return (
              <span key={index} className="stamp-tile" data-earned={earned}>
                <Icon name="stall" />
              </span>
            );
          })}
        </div>
        <h2>{stamps} of 10 Sundays visited</h2>
        <p>
          <strong>
            {remaining} more {remaining === 1 ? 'visit' : 'visits'}
          </strong>{' '}
          = Highbury Market Insider.
        </p>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${stamps * 10}%` }} />
        </div>
      </section>

      <section className="perks-panel">
        <p className="eyebrow">Insider perks</p>
        <ul>
          <li>Early access notification for seasonal specials</li>
          <li>Insider badge in the app</li>
          <li>Welcome token from Brown Bear Coffee</li>
        </ul>
      </section>

      <button
        type="button"
        className="primary-button"
        disabled={checkedIn || checkingIn}
        onClick={onCheckIn}
      >
        <Icon name="pin" />
        {checkedIn
          ? 'Checked in today'
          : checkingIn
            ? 'Checking location…'
            : "I'm at the market"}
      </button>
    </div>
  );
}

function VisitScreen() {
  return (
    <div className="screen visit-screen">
      <section className="page-title">
        <p className="eyebrow">Plan your visit</p>
        <h1>Visit Highbury Market</h1>
      </section>

      <section className="info-list">
        <h2>When</h2>
        <InfoRow label="Open" value={MARKET.hours} />
        <InfoRow label="Closing" value="Last vendors pack down from 1:45 PM" />
      </section>

      <section className="info-list">
        <h2>Where</h2>
        <InfoRow label="Location" value={`${MARKET.location}. ${MARKET.address}`} />
        {GETTING_THERE.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </section>

      <section className="info-list">
        <h2>Facilities</h2>
        {FACILITIES.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </section>

      <section className="notice-band visit-note">
        <p className="eyebrow">Weekly update</p>
        <p>Hook & Son are away this week and back in two weeks. Shrub & Sprout are back next Sunday.</p>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MarketIllustration() {
  return (
    <svg className="market-illustration" viewBox="0 0 360 210" role="img" aria-label="Market stalls at Highbury Fields">
      <rect width="360" height="210" fill="#ECE5D9" />
      <path d="M0 142H360V210H0Z" fill="#DDE2D2" />
      <path d="M0 136H360" stroke="#C8BCA9" strokeWidth="2" />
      <g className="bunting">
        <path d="M14 22C74 36 132 8 190 24C244 39 295 8 346 24" fill="none" stroke="#AFA38F" strokeWidth="2" />
        {[
          [38, 27, '#E8603C'],
          [72, 27, '#5E7B5C'],
          [111, 20, '#C4783C'],
          [151, 20, '#E8603C'],
          [224, 27, '#5E7B5C'],
          [266, 22, '#C4783C'],
          [312, 21, '#E8603C'],
        ].map(([x, y, fill]) => (
          <path key={`${x}-${y}`} d={`M${x} ${y}l7 18l7-18z`} fill={String(fill)} />
        ))}
      </g>
      <g opacity="0.95">
        <circle cx="32" cy="94" r="31" fill="#91A77A" />
        <circle cx="58" cy="84" r="29" fill="#7D9B6E" />
        <rect x="28" y="112" width="7" height="47" fill="#7D654D" />
        <circle cx="310" cy="92" r="31" fill="#91A77A" />
        <circle cx="333" cy="82" r="27" fill="#7D9B6E" />
        <rect x="306" y="111" width="7" height="48" fill="#7D654D" />
      </g>
      <g className="stall-row">
        <MarketStall x={75} roof="#E8603C" shade="#F6F0E7" />
        <MarketStall x={158} roof="#5E7B5C" shade="#F7F3EE" />
        <MarketStall x={241} roof="#C4783C" shade="#F6F0E7" />
      </g>
      <circle cx="307" cy="49" r="26" fill="#F0CD72" opacity="0.7" />
    </svg>
  );
}

function MarketStall({ x, roof, shade }: { x: number; roof: string; shade: string }) {
  return (
    <g transform={`translate(${x} 76)`}>
      <path d="M0 34H66L59 10H7Z" fill={roof} />
      <path d="M8 10H58L66 34H0Z" fill={roof} opacity="0.16" />
      <rect x="6" y="34" width="54" height="54" fill={shade} />
      <rect x="12" y="46" width="18" height="14" fill="#D7DFCF" />
      <rect x="35" y="46" width="13" height="14" fill="#E8B08F" />
      <path d="M8 88H58" stroke="#B6A792" strokeWidth="3" />
    </g>
  );
}

function shortVendorName(name: string) {
  const label = MAP_LABELS[name];
  if (label) return label;
  return name
    .replace('The ', '')
    .replace('Company', 'Co.')
    .split(' ')
    .slice(0, 2)
    .join(' ');
}

function requireVendor(id: string) {
  const vendor = VENDORS.find((item) => item.id === id);
  if (!vendor) throw new Error(`Missing market vendor: ${id}`);
  return vendor;
}

type CheckInStatus = {
  verified: boolean;
  locationKnown: boolean;
  distanceM: number | null;
};

const HIGHBURY_FIELDS = { lat: 51.5503, lon: -0.099 };
const CHECK_IN_RADIUS_M = 400;
const GEO_TIMEOUT_MS = 8000;

function getCurrentPositionSafe(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function checkInMessage(status: CheckInStatus): string {
  if (!status.locationKnown) {
    return 'Checked in — location unavailable, stamp added.';
  }
  if (status.verified) {
    return 'Checked in and verified at Highbury Fields. Stamp added.';
  }
  const away =
    status.distanceM != null ? ` (you're ~${formatDistance(status.distanceM)} away)` : '';
  return `Checked in${away}. Stamp added unverified.`;
}

type IconName =
  | 'arrow'
  | 'calendar'
  | 'home'
  | 'info'
  | 'map'
  | 'pin'
  | 'search'
  | 'stall'
  | 'stamp'
  | 'ticket';

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 11.5 12 4l8 7.5V20h-5v-6H9v6H4z" />
        </svg>
      );
    case 'map':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 6 5-2 6 2 5-2v16l-5 2-6-2-5 2zM9 4v16M15 6v16" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5h14v15H5zM8 3v4M16 3v4M5 10h14" />
        </svg>
      );
    case 'stamp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 13h8l1.5 6h-11zM9 9a3 3 0 1 1 6 0c0 1.2-.7 2.2-1.6 2.7H10.6A3.1 3.1 0 0 1 9 9zM5 21h14" />
        </svg>
      );
    case 'info':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 10v6M12 7h.01" />
        </svg>
      );
    case 'stall':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9h16l-2-5H6zM6 9v11M18 9v11M5 20h14M8 13h8v7H8z" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m20 20-4.2-4.2M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5l7 7-7 7" />
        </svg>
      );
    case 'ticket':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8a2 2 0 0 0 0 4 2 2 0 0 1 0 4v2h16v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H4zM9 8v8" />
        </svg>
      );
    case 'pin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        </svg>
      );
  }
}

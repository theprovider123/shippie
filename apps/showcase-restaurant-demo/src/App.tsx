import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import {
  DEFAULT_SPECIAL_NOTE,
  DISH_LOOKUP,
  FILTERS,
  MENU_SECTIONS,
  RESTAURANT,
  formatPrice,
  numericPrice,
  type DietaryFilter,
  type Dish,
  type MenuSection,
} from './menu-data.ts';

const shippie = createShippieIframeSdk({ appId: 'app_restaurant_demo' });

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const FILTER_KEY = 'shippie.restaurant-demo.filters.v1';
const ORDERS_KEY = 'shippie.restaurant-demo.orders.v1';
const FEEDBACK_KEY = 'shippie.restaurant-demo.feedback.v1';
const SPECIAL_KEY = 'shippie.restaurant-demo.special.v1';

type View = 'menu' | 'about' | 'kitchen' | 'admin';
type OrderStatus = 'received' | 'ready';

interface OrderLine {
  dishId: string;
  name: string;
  qty: number;
  unitPrice: number;
  priceLabel: string;
}

interface StoredOrder {
  id: string;
  table: string;
  items: OrderLine[];
  note: string;
  subtotal: number;
  createdAt: string;
  status: OrderStatus;
  readyAt?: string;
}

interface FeedbackEntry {
  id: string;
  table: string;
  score: number;
  text: string;
  createdAt: string;
}

interface SpecialState {
  note: string;
  updatedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function newId(prefix: string) {
  if ('randomUUID' in crypto) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function viewFromLocation(): View {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  const explicit = params.get('view');
  if (pathname.endsWith('/kitchen') || explicit === 'kitchen') return 'kitchen';
  if (pathname.endsWith('/admin') || explicit === 'admin') return 'admin';
  if (pathname.endsWith('/about') || explicit === 'about') return 'about';
  return 'menu';
}

function tableFromLocation() {
  const table = new URLSearchParams(window.location.search).get('table') || '4';
  return `Table ${table.replace(/^table\s*/i, '')}`;
}

function haptic(pattern: number | number[], texture?: 'confirm' | 'milestone') {
  navigator.vibrate?.(pattern);
  if (texture) shippie.feel.texture(texture);
}

function updateRoute(view: View) {
  const params = new URLSearchParams(window.location.search);
  const table = params.get('table');
  const key = params.get('key');
  const nextParams = new URLSearchParams();
  const pathname = window.location.pathname.replace(/\/(kitchen|admin|about)$/, '/') || '/';
  if (table) nextParams.set('table', table);
  if (key && (view === 'kitchen' || view === 'admin')) nextParams.set('key', key);
  if (view !== 'menu') nextParams.set('view', view);
  const qs = nextParams.toString();
  window.history.pushState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
}

function matchDish(dish: Dish, active: readonly DietaryFilter[]) {
  if (active.length === 0) return true;
  return active.every((filter) => {
    if (filter === 'vegetarian') {
      return dish.dietary.includes('vegetarian') || dish.dietary.includes('vegan');
    }
    return dish.dietary.includes(filter);
  });
}

function todayLabel(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function App() {
  const [view, setView] = useState<View>(() => viewFromLocation());
  const [table] = useState(() => tableFromLocation());
  const [activeFilters, setActiveFilters] = useState<DietaryFilter[]>(() =>
    readJson<DietaryFilter[]>(FILTER_KEY, []),
  );
  const [openDish, setOpenDish] = useState<Dish | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [sentOrder, setSentOrder] = useState<StoredOrder | null>(null);
  const [draftOrder, setDraftOrder] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<StoredOrder[]>(() => readJson(ORDERS_KEY, []));
  const [feedback, setFeedback] = useState<FeedbackEntry[]>(() =>
    readJson(FEEDBACK_KEY, []),
  );
  const [special, setSpecial] = useState<SpecialState>(() =>
    readJson(SPECIAL_KEY, {
      note: DEFAULT_SPECIAL_NOTE,
      updatedAt: new Date().toISOString(),
    }),
  );

  useEffect(() => {
    const onPop = () => setView(viewFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    writeJson(FILTER_KEY, activeFilters);
  }, [activeFilters]);

  useEffect(() => {
    writeJson(ORDERS_KEY, orders);
  }, [orders]);

  useEffect(() => {
    writeJson(FEEDBACK_KEY, feedback);
  }, [feedback]);

  useEffect(() => {
    writeJson(SPECIAL_KEY, special);
  }, [special]);

  useEffect(() => {
    function refresh() {
      setOrders(readJson(ORDERS_KEY, []));
      setFeedback(readJson(FEEDBACK_KEY, []));
      setSpecial(
        readJson(SPECIAL_KEY, {
          note: DEFAULT_SPECIAL_NOTE,
          updatedAt: new Date().toISOString(),
        }),
      );
    }

    function onStorage(event: StorageEvent) {
      if ([ORDERS_KEY, FEEDBACK_KEY, SPECIAL_KEY].includes(event.key ?? '')) refresh();
    }

    window.addEventListener('storage', onStorage);
    const id = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(id);
    };
  }, []);

  const sections = useMemo<MenuSection[]>(() => {
    return MENU_SECTIONS.map((section) =>
      section.id === 'specials'
        ? {
            ...section,
            dishes: section.dishes.map((dish) => ({
              ...dish,
              description: special.note || DEFAULT_SPECIAL_NOTE,
            })),
          }
        : section,
    );
  }, [special.note]);

  const orderCount = Object.values(draftOrder).reduce((sum, qty) => sum + qty, 0);
  const orderSubtotal = Object.entries(draftOrder).reduce((sum, [dishId, qty]) => {
    const dish = DISH_LOOKUP.get(dishId);
    return dish ? sum + numericPrice(dish) * qty : sum;
  }, 0);
  const readyOrder = orders.find((order) => order.table === table && order.status === 'ready');

  function navigate(next: View) {
    setView(next);
    updateRoute(next);
  }

  function toggleFilter(filter: DietaryFilter) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter],
    );
  }

  function addDish(dish: Dish) {
    haptic(10, 'confirm');
    setDraftOrder((prev) => ({ ...prev, [dish.id]: (prev[dish.id] ?? 0) + 1 }));
  }

  function updateDishQty(dishId: string, qty: number) {
    setDraftOrder((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[dishId];
      else next[dishId] = qty;
      return next;
    });
  }

  function sendOrder(note: string) {
    const items = Object.entries(draftOrder)
      .map(([dishId, qty]) => {
        const dish = DISH_LOOKUP.get(dishId);
        if (!dish) return null;
        return {
          dishId,
          name: dish.name,
          qty,
          unitPrice: numericPrice(dish),
          priceLabel: formatPrice(dish),
        };
      })
      .filter((line): line is OrderLine => Boolean(line));

    if (items.length === 0) return;

    const order: StoredOrder = {
      id: newId('order'),
      table,
      items,
      note: note.trim(),
      subtotal: items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
      createdAt: new Date().toISOString(),
      status: 'received',
    };
    setOrders((prev) => [order, ...prev].slice(0, 100));
    setSentOrder(order);
    haptic([15, 5, 15], 'milestone');
  }

  function closeOrderSheet() {
    setOrderOpen(false);
    if (sentOrder) {
      window.setTimeout(() => {
        setSentOrder(null);
        setDraftOrder({});
      }, 260);
    }
  }

  function markReady(orderId: string) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? { ...order, status: 'ready', readyAt: new Date().toISOString() }
          : order,
      ),
    );
    haptic(25, 'milestone');
  }

  function submitFeedback(score: number, text: string) {
    setFeedback((prev) => [
      {
        id: newId('feedback'),
        table,
        score,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    haptic(25, 'confirm');
  }

  if (view === 'kitchen') {
    return (
      <KitchenView
        orders={orders}
        onReady={markReady}
        onMenu={() => navigate('menu')}
      />
    );
  }

  if (view === 'admin') {
    return (
      <AdminView
        orders={orders}
        feedback={feedback}
        special={special}
        onSaveSpecial={(note) =>
          setSpecial({ note: note.trim() || DEFAULT_SPECIAL_NOTE, updatedAt: new Date().toISOString() })
        }
        onMenu={() => navigate('menu')}
      />
    );
  }

  if (view === 'about') {
    return <AboutView table={table} onMenu={() => navigate('menu')} />;
  }

  return (
    <main className="restaurant-app">
      <MenuHeader
        table={table}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
        onClearFilters={() => setActiveFilters([])}
        onAbout={() => navigate('about')}
      />
      {readyOrder ? (
        <div className="ready-ribbon" role="status">
          Your food is coming. {readyOrder.readyAt ? `Marked ready ${todayLabel(readyOrder.readyAt)}.` : null}
        </div>
      ) : null}
      <MenuSections
        sections={sections}
        activeFilters={activeFilters}
        special={special}
        draftOrder={draftOrder}
        onOpenDish={(dish) => {
          haptic(5);
          setOpenDish(dish);
        }}
        onAddDish={addDish}
        onFeedback={submitFeedback}
      />
      <footer className="menu-footer">
        <p>We use Shippie - no data collected about your visit.</p>
      </footer>

      <ChoiceBar
        count={orderCount}
        subtotal={orderSubtotal}
        onOpen={() => setOrderOpen(true)}
      />

      <DishSheet
        dish={openDish}
        inOrder={openDish ? draftOrder[openDish.id] ?? 0 : 0}
        onAdd={addDish}
        onClose={() => setOpenDish(null)}
      />

      <OrderSheet
        open={orderOpen}
        table={table}
        draftOrder={draftOrder}
        subtotal={orderSubtotal}
        sentOrder={sentOrder}
        onQty={updateDishQty}
        onSend={sendOrder}
        onClose={closeOrderSheet}
      />
    </main>
  );
}

function MenuHeader({
  table,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  onAbout,
}: {
  table: string;
  activeFilters: readonly DietaryFilter[];
  onToggleFilter: (filter: DietaryFilter) => void;
  onClearFilters: () => void;
  onAbout: () => void;
}) {
  return (
    <header className="menu-header">
      <button className="info-button" type="button" aria-label="About Locanda Soho" onClick={onAbout}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="8.5" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.6" r="0.5" fill="currentColor" stroke="currentColor" />
        </svg>
      </button>
      <div className="masthead">
        <p className="masthead-est">Frith Street · Soho · Est. 1989</p>
        <h1 className="masthead-name">{RESTAURANT.name}</h1>
        <p className="masthead-sub">{RESTAURANT.tagline}</p>
        <div className="masthead-rule">
          <span className="masthead-table">{table}</span>
        </div>
      </div>
      <nav className="filter-row" aria-label="Dietary filters">
        <button
          type="button"
          className={`filter-chip ${activeFilters.length === 0 ? 'is-active' : ''}`}
          onClick={onClearFilters}
        >
          All
        </button>
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`filter-chip ${activeFilters.includes(filter.id) ? 'is-active' : ''}`}
            aria-pressed={activeFilters.includes(filter.id)}
            onClick={() => onToggleFilter(filter.id)}
            title={filter.label}
          >
            <span aria-hidden>{filter.shortLabel}</span>
            <span className="sr-only">{filter.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}

function MenuSections({
  sections,
  activeFilters,
  special,
  draftOrder,
  onOpenDish,
  onAddDish,
  onFeedback,
}: {
  sections: readonly MenuSection[];
  activeFilters: readonly DietaryFilter[];
  special: SpecialState;
  draftOrder: Record<string, number>;
  onOpenDish: (dish: Dish) => void;
  onAddDish: (dish: Dish) => void;
  onFeedback: (score: number, text: string) => void;
}) {
  const numerals: Record<string, string> = {};
  let courseN = 0;
  for (const s of sections) {
    if (s.id !== 'specials') numerals[s.id] = ROMAN[courseN++] ?? '';
  }

  return (
    <div className="menu-sections">
      {sections.map((section) => {
        const isSpecial = section.id === 'specials';
        return (
        <section
          key={section.id}
          className={`menu-section ${isSpecial ? 'special-section' : ''}`}
        >
          <div className="section-heading">
            <span className="course-num" aria-hidden="true">{isSpecial ? '✦' : numerals[section.id]}</span>
            <div className="course-title">
              <h2>{section.title}</h2>
              {isSpecial ? (
                <p className="special-updated">Specials board · updated {todayLabel(special.updatedAt)}</p>
              ) : section.note ? (
                <p className="course-note">{section.note}</p>
              ) : null}
            </div>
          </div>

          {isSpecial ? (
            <p className="special-demo-note">
              <span className="ai-tag">AI</span>
              The owner photographs the specials board and the menu updates itself — no typing, fully offline.
            </p>
          ) : null}

          <div className="dish-list">
            {section.dishes.map((dish) => {
              const matches = matchDish(dish, activeFilters);
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  matches={matches}
                  qty={draftOrder[dish.id] ?? 0}
                  onOpen={() => onOpenDish(dish)}
                  onAdd={() => onAddDish(dish)}
                />
              );
            })}
          </div>

          {section.id === 'dolci' ? <FeedbackPanel onSubmit={onFeedback} /> : null}
        </section>
        );
      })}
    </div>
  );
}

function DishRow({
  dish,
  matches,
  qty,
  onOpen,
  onAdd,
}: {
  dish: Dish;
  matches: boolean;
  qty: number;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const disabled = !matches;

  return (
    <article className={`dish-row ${dish.special ? 'dish-row-special' : ''} ${disabled ? 'is-muted' : ''}`}>
      {dish.special ? <span className="special-badge">Special</span> : null}
      <div className="dish-line">
        <button className="dish-main" type="button" onClick={onOpen} disabled={disabled}>
          <span className="dish-top">
            <span className="dish-name">{dish.name}</span>
            <span className="leader" aria-hidden />
            <span className="dish-price">{formatPrice(dish)}</span>
          </span>
          <span className="dish-description">{dish.description}</span>
        </button>
        {typeof dish.price === 'number' ? (
          <button
            className="add-one"
            type="button"
            aria-label={`Add ${dish.name}`}
            onClick={onAdd}
            disabled={disabled}
          >
            +1{qty ? <span>{qty}</span> : null}
          </button>
        ) : null}
      </div>
      <DishBadges dish={dish} />
      {dish.allergenNote ? (
        <div className="allergen-wrap">
          <button
            className="allergen-toggle"
            type="button"
            onClick={() => setExpanded((current) => !current)}
            disabled={disabled}
            aria-expanded={expanded}
          >
            <svg className="allergen-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 4 21 19H3z" />
              <line x1="12" y1="10" x2="12" y2="14" />
              <circle cx="12" cy="16.4" r="0.5" fill="currentColor" stroke="currentColor" />
            </svg>
            {expanded ? dish.allergenNote : 'Allergen warning'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function dietTone(badge: string): string {
  if (/vegan/i.test(badge)) return 'is-vegan';
  if (/gluten/i.test(badge)) return 'is-gf';
  if (/veget/i.test(badge)) return 'is-veg';
  return '';
}

function DishBadges({ dish }: { dish: Dish }) {
  const labels = dish.badges ?? [];
  if (labels.length === 0) return null;
  return (
    <div className="badge-row" aria-label="Dietary badges">
      {labels.map((badge) => (
        <span key={badge} className={`diet-badge ${dietTone(badge)}`.trim()}>
          {badge}
        </span>
      ))}
    </div>
  );
}

function FeedbackPanel({
  onSubmit,
}: {
  onSubmit: (score: number, text: string) => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const ratingLabels = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];

  function pick(index: number) {
    setScore(index);
    setSent(false);
  }

  function onStarKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = score ?? 0;
    const next = event.key === 'ArrowRight' ? Math.min(4, current + 1) : Math.max(0, current - 1);
    pick(next);
  }

  function submit() {
    if (score == null || sent) return;
    onSubmit(score + 1, text);
    setSent(true);
    setText('');
  }

  return (
    <section className="feedback-panel" aria-label="Anonymous feedback">
      <h3>How's your meal?</h3>
      <div className="rating-row" role="radiogroup" aria-label="Rate your meal" onKeyDown={onStarKey}>
        {ratingLabels.map((label, index) => {
          const picked = score != null && index <= score;
          const tabbable = score === index || (score == null && index === 0);
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={score === index}
              tabIndex={tabbable ? 0 : -1}
              className={`rating-star ${picked ? 'is-filled' : ''}`}
              aria-label={`${label} — ${index + 1} of 5`}
              title={label}
              onClick={() => pick(index)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 3.2l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.5l6.1-.7z" />
              </svg>
            </button>
          );
        })}
      </div>
      {score != null ? <p className="rating-caption">{sent ? 'Thank you — sent anonymously' : ratingLabels[score]}</p> : null}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Anything to tell us?"
        rows={2}
      />
      <button className="quiet-action" type="button" onClick={submit} disabled={score == null}>
        {sent ? 'Sent anonymously' : 'Send anonymously'}
      </button>
    </section>
  );
}

function ChoiceBar({
  count,
  subtotal,
  onOpen,
}: {
  count: number;
  subtotal: number;
  onOpen: () => void;
}) {
  if (count === 0) return null;
  return (
    <button className="choice-bar" type="button" onClick={onOpen}>
      <span>Your choices: {count} {count === 1 ? 'dish' : 'dishes'}</span>
      <strong>£{subtotal.toFixed(2)}</strong>
    </button>
  );
}

function DishSheet({
  dish,
  inOrder,
  onAdd,
  onClose,
}: {
  dish: Dish | null;
  inOrder: number;
  onAdd: (dish: Dish) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={Boolean(dish)} onClose={onClose} labelledBy="dish-sheet-title">
      {dish ? (
        <div className="dish-sheet">
          <button className="sheet-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
          <p className="sheet-kicker">{dish.special ? 'Special today' : 'À la carte'}</p>
          <h2 id="dish-sheet-title">{dish.name}</h2>
          <p className="dish-sheet-desc">{dish.description}</p>
          {dish.chefNote ? (
            <blockquote className="chef-note">
              {dish.chefNote}
              <cite>From the pass</cite>
            </blockquote>
          ) : null}
          <div className="dish-facts">
            <DetailRow label="Price" value={formatPrice(dish)} />
            <DetailRow
              label="Allergens"
              value={dish.allergens && dish.allergens.length ? dish.allergens.join(', ') : 'None declared'}
            />
          </div>
          {dish.winePairing ? <WinePairing pairing={dish.winePairing} /> : null}
          <DishBadges dish={dish} />
          {typeof dish.price === 'number' ? (
            <button
              className="sheet-add"
              type="button"
              onClick={() => {
                onAdd(dish);
                onClose();
              }}
            >
              Add to order{inOrder > 0 ? ` · ${inOrder} chosen` : ''}
            </button>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function DetailRow({
  label,
  value,
  italic = false,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <p className={italic ? 'detail-italic' : ''}>{value}</p>
    </div>
  );
}

function WinePairing({ pairing }: { pairing: string }) {
  // Data shape: "Chianti Classico, Castello di Ama - earthy, bright, built for ragu."
  const dash = pairing.indexOf(' - ');
  const fullName = dash === -1 ? pairing : pairing.slice(0, dash);
  const note = dash === -1 ? '' : pairing.slice(dash + 3);
  const comma = fullName.indexOf(',');
  const wine = comma === -1 ? fullName : fullName.slice(0, comma);
  const producer = comma === -1 ? '' : fullName.slice(comma + 1).trim();

  return (
    <aside className="wine-pairing" aria-label="Sommelier wine pairing">
      <div className="wine-pairing-head">
        <svg className="wine-glass" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 3h8c0 4-1.6 7-4 7s-4-3-4-7z" />
          <line x1="12" y1="10" x2="12" y2="19" />
          <line x1="8.5" y1="21" x2="15.5" y2="21" />
        </svg>
        <p className="wine-pairing-kicker">The sommelier suggests</p>
      </div>
      <p className="wine-pairing-name">{wine}</p>
      {producer ? <p className="wine-pairing-producer">{producer}</p> : null}
      {note ? <p className="wine-pairing-note">“{note.replace(/\.$/, '')}”</p> : null}
      <p className="wine-pairing-foot">By the glass or bottle · ask your server</p>
    </aside>
  );
}

function OrderSheet({
  open,
  table,
  draftOrder,
  subtotal,
  sentOrder,
  onQty,
  onSend,
  onClose,
}: {
  open: boolean;
  table: string;
  draftOrder: Record<string, number>;
  subtotal: number;
  sentOrder: StoredOrder | null;
  onQty: (dishId: string, qty: number) => void;
  onSend: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const lines = Object.entries(draftOrder)
    .map(([dishId, qty]) => {
      const dish = DISH_LOOKUP.get(dishId);
      return dish ? { dish, qty } : null;
    })
    .filter((line): line is { dish: Dish; qty: number } => Boolean(line));

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="order-sheet-title" tall>
      <div className="order-sheet">
        <button className="sheet-close" type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
        {sentOrder ? (
          <div className="sent-state">
            <div className="sent-mark">✓</div>
            <h2 id="order-sheet-title">Order received</h2>
            <p>Your server will confirm shortly.</p>
            <small>{table} · {todayLabel(sentOrder.createdAt)}</small>
            <button className="quiet-action" type="button" onClick={onClose}>
              Back to menu
            </button>
          </div>
        ) : (
          <>
            <h2 id="order-sheet-title">Your choices</h2>
            <p className="sheet-subtitle">for {table}</p>
            {lines.length === 0 ? (
              <p className="empty-copy">Your list is empty. Tap +1 beside a dish.</p>
            ) : (
              <>
                <div className="order-lines">
                  {lines.map(({ dish, qty }) => (
                    <div key={dish.id} className="order-line">
                      <div>
                        <strong>{dish.name}</strong>
                        <span>{formatPrice(dish)} each</span>
                      </div>
                      <div className="qty-stepper">
                        <button type="button" onClick={() => onQty(dish.id, qty - 1)} aria-label="Decrease">
                          -
                        </button>
                        <span>{qty}</span>
                        <button type="button" onClick={() => onQty(dish.id, qty + 1)} aria-label="Increase">
                          +
                        </button>
                      </div>
                      <b>£{(numericPrice(dish) * qty).toFixed(2)}</b>
                    </div>
                  ))}
                </div>
                <div className="subtotal-row">
                  <span>Subtotal</span>
                  <strong>£{subtotal.toFixed(2)}</strong>
                </div>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Note for kitchen"
                  rows={3}
                />
                <p className="hub-note">
                  In the full version, orders sync to a kitchen screen over the restaurant's WiFi - no internet needed. The Hub sits behind the bar and handles everything locally.
                </p>
                <button className="send-kitchen" type="button" onClick={() => onSend(note)}>
                  Send to kitchen
                </button>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function BottomSheet({
  open,
  onClose,
  labelledBy,
  tall = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  tall?: boolean;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const origin = useRef<number | null>(null);

  if (!open) return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    origin.current = event.clientY;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (origin.current == null) return;
    const delta = event.clientY - origin.current;
    if (delta > 0) setDragY(delta);
  }

  function onPointerUp() {
    if (dragY > 110) onClose();
    setDragY(0);
    origin.current = null;
  }

  return (
    <div className="sheet-layer" role="presentation">
      <button className="sheet-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <section
        className={`bottom-sheet ${tall ? 'is-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{ transform: `translate(-50%, ${dragY}px)` }}
      >
        <div
          className="grabber-zone"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span />
        </div>
        {children}
      </section>
    </div>
  );
}

function AboutView({ table, onMenu }: { table: string; onMenu: () => void }) {
  return (
    <main className="restaurant-app sub-view">
      <button className="back-link" type="button" onClick={onMenu}>
        ← Menu
      </button>
      <section className="about-panel">
        <p className="table-pill">{table}</p>
        <h1>{RESTAURANT.name}</h1>
        <p className="tagline">{RESTAURANT.tagline}</p>
        <blockquote>{RESTAURANT.about}</blockquote>
        <div className="info-grid">
          <div>
            <h2>Opening Hours</h2>
            {RESTAURANT.hours.map(([day, hours]) => (
              <p key={day}>
                <span>{day}</span>
                <strong>{hours}</strong>
              </p>
            ))}
          </div>
          <div>
            <h2>Find Us</h2>
            <p className="address-line">{RESTAURANT.address}</p>
            <a href={`tel:${RESTAURANT.phone.replace(/\s/g, '')}`}>{RESTAURANT.phone}</a>
            <a href={`mailto:${RESTAURANT.email}`}>{RESTAURANT.email}</a>
          </div>
        </div>
        <p className="privacy-line">We use Shippie - no data collected about your visit.</p>
      </section>
    </main>
  );
}

function KitchenView({
  orders,
  onReady,
  onMenu,
}: {
  orders: readonly StoredOrder[];
  onReady: (orderId: string) => void;
  onMenu: () => void;
}) {
  const openOrders = orders.filter((order) => order.status === 'received');
  const readyOrders = orders.filter((order) => order.status === 'ready').slice(0, 8);

  return (
    <main className="restaurant-app ops-view">
      <button className="back-link" type="button" onClick={onMenu}>
        ← Menu
      </button>
      <header className="ops-header">
        <h1>Kitchen</h1>
        <p>Orders refresh every 30 seconds when Hub is not present.</p>
      </header>
      <section className="ops-list">
        {openOrders.length === 0 ? <p className="empty-copy">No open orders.</p> : null}
        {openOrders.map((order) => (
          <article key={order.id} className="ops-card">
            <div className="ops-card-head">
              <h2>{order.table}</h2>
              <span>{todayLabel(order.createdAt)}</span>
            </div>
            <ul>
              {order.items.map((item) => (
                <li key={item.dishId}>
                  <strong>{item.qty}×</strong> {item.name}
                </li>
              ))}
            </ul>
            {order.note ? <p className="order-note">{order.note}</p> : null}
            <button className="quiet-action" type="button" onClick={() => onReady(order.id)}>
              Mark ready
            </button>
          </article>
        ))}
      </section>
      <section className="ops-list">
        <h2 className="ops-subhead">Ready</h2>
        {readyOrders.map((order) => (
          <article key={order.id} className="ops-card is-ready">
            <div className="ops-card-head">
              <h2>{order.table}</h2>
              <span>{order.readyAt ? todayLabel(order.readyAt) : 'Ready'}</span>
            </div>
            <p>{order.items.reduce((sum, item) => sum + item.qty, 0)} items</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function AdminView({
  orders,
  feedback,
  special,
  onSaveSpecial,
  onMenu,
}: {
  orders: readonly StoredOrder[];
  feedback: readonly FeedbackEntry[];
  special: SpecialState;
  onSaveSpecial: (note: string) => void;
  onMenu: () => void;
}) {
  const [note, setNote] = useState(special.note);
  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === today);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const dishCounts = new Map<string, number>();
  orders
    .filter((order) => new Date(order.createdAt).getTime() >= weekAgo)
    .flatMap((order) => order.items)
    .forEach((item) => dishCounts.set(item.name, (dishCounts.get(item.name) ?? 0) + item.qty));
  const topDishes = [...dishCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const average =
    feedback.length > 0
      ? feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length
      : 0;

  useEffect(() => setNote(special.note), [special.note]);

  return (
    <main className="restaurant-app ops-view">
      <button className="back-link" type="button" onClick={onMenu}>
        ← Menu
      </button>
      <header className="ops-header">
        <h1>Owner Dashboard</h1>
        <p>{RESTAURANT.name}</p>
      </header>
      <section className="metric-grid">
        <div className="metric-card">
          <span>Today's orders</span>
          <strong>{todayOrders.length}</strong>
        </div>
        <div className="metric-card">
          <span>Subtotal today</span>
          <strong>£{todayOrders.reduce((sum, order) => sum + order.subtotal, 0).toFixed(2)}</strong>
        </div>
        <div className="metric-card">
          <span>Feedback</span>
          <strong>{average ? average.toFixed(1) : '–'}</strong>
        </div>
      </section>
      <section className="ops-card">
        <h2>Most ordered this week</h2>
        {topDishes.length === 0 ? <p className="empty-copy">No dishes ordered yet.</p> : null}
        <ol className="top-list">
          {topDishes.map(([name, count]) => (
            <li key={name}>
              <span>{name}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section className="ops-card">
        <h2>Update specials</h2>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} />
        <button className="quiet-action" type="button" onClick={() => onSaveSpecial(note)}>
          Save specials
        </button>
        <p className="special-updated">Last updated {todayLabel(special.updatedAt)}</p>
      </section>
      <section className="ops-card">
        <h2>Anonymous feedback</h2>
        {feedback.slice(0, 6).map((entry) => (
          <p key={entry.id} className="feedback-row">
            <strong>{'★'.repeat(entry.score)}</strong>
            <span>{entry.text || 'No note'}</span>
          </p>
        ))}
        {feedback.length === 0 ? <p className="empty-copy">No feedback yet.</p> : null}
      </section>
    </main>
  );
}

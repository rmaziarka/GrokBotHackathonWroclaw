import { useEffect, useState, type FormEvent } from "react";
import type { Props } from "./index.server";
import { daysUntil, type ExpiryState } from "../src/dates";
import type { InventoryRecord, MealRecord, ShoppingRecord } from "../src/store";
import "./style.css";

type Tab = "fridge" | "meals" | "shopping";
type IngredientDraft = { name: string; quantity: string; unit: string };

const emptyIngredient = (): IngredientDraft => ({ name: "", quantity: "", unit: "" });

export default function HomePage({ access, today, inventory, meals, shopping, storageError }: Props) {
  const configured = access.configured;
  const [authenticated, setAuthenticated] = useState(access.authenticated);
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("fridge");
  const [items, setItems] = useState(inventory);
  const [mealRows, setMealRows] = useState(meals);
  const [shoppingRows, setShoppingRows] = useState(shopping);
  const [calendarToday, setCalendarToday] = useState(today);
  const [showConsumed, setShowConsumed] = useState(false);
  const [message, setMessage] = useState<string | null>(storageError ? "Baza nie jest jeszcze gotowa. Uruchom migracje D1." : null);
  const [pending, setPending] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState("/mcp");

  async function send(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.status === 401) {
      setAuthenticated(false);
      setItems([]);
      setMealRows([]);
      setShoppingRows([]);
    }
    if (!response.ok) {
      throw new Error(payload?.message || errorText(payload?.error) || "Nie udało się zapisać zmiany.");
    }
    return payload;
  }

  async function refresh() {
    const [inventoryResponse, mealResponse, shoppingResponse] = await Promise.all([
      fetch("/api/inventory?includeConsumed=true", { credentials: "same-origin" }),
      fetch("/api/meals", { credentials: "same-origin" }),
      fetch("/api/shopping", { credentials: "same-origin" }),
    ]);
    if (inventoryResponse.status === 401 || mealResponse.status === 401 || shoppingResponse.status === 401) {
      setAuthenticated(false);
      setItems([]);
      setMealRows([]);
      setShoppingRows([]);
      return;
    }
    if (!inventoryResponse.ok || !mealResponse.ok || !shoppingResponse.ok) {
      setMessage("Nie udało się odświeżyć danych.");
      return;
    }
    const inventoryBody = (await inventoryResponse.json()) as { today: string; items: InventoryRecord[] };
    const mealBody = (await mealResponse.json()) as { meals: MealRecord[] };
    const shoppingBody = (await shoppingResponse.json()) as { items: ShoppingRecord[] };
    setCalendarToday(inventoryBody.today);
    setItems(inventoryBody.items);
    setMealRows(mealBody.meals);
    setShoppingRows(shoppingBody.items);
    setRefreshedAt(new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date()));
    setMessage(null);
  }

  useEffect(() => {
    setMcpUrl(`${window.location.origin}/mcp`);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [authenticated]);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await send("/api/session", { method: "POST", body: JSON.stringify({ token }) });
      setToken("");
      setAuthenticated(true);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logowanie nie powiodło się.");
    } finally {
      setPending(false);
    }
  }

  async function onLogout() {
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" });
    setAuthenticated(false);
    setItems([]);
    setMealRows([]);
    setShoppingRows([]);
  }

  return (
    <main className="app">
      <header className="hero">
        <div>
          <div className="row">
            <span className="mark" aria-hidden="true">Ś</span>
            <p className="eyebrow">Jedno gospodarstwo</p>
          </div>
          <h1>Spiżarnia</h1>
          <p className="lede">
            Wspólna lodówka, zapisane posiłki i lista zakupów. Boty Grok czytają i zapisują te same dane przez MCP.
            Ta strona nie wymyśla posiłków.
          </p>
        </div>
        {authenticated ? (
          <button className="ghost" type="button" onClick={() => void onLogout()}>Wyloguj</button>
        ) : null}
      </header>

      {message ? <p className="alert" role="alert">{message}</p> : null}

      {authenticated ? (
        <Dashboard
          tab={tab}
          setTab={setTab}
          items={items}
          meals={mealRows}
          shopping={shoppingRows}
          today={calendarToday}
          showConsumed={showConsumed}
          setShowConsumed={setShowConsumed}
          pending={pending}
          setPending={setPending}
          refreshedAt={refreshedAt}
          setMessage={setMessage}
          send={send}
          refresh={refresh}
        />
      ) : (
        <section className="gate">
          <h2>Wejście gospodarstwa</h2>
          <p className="muted">
            Kod zostaje na serwerze. Przeglądarka dostaje tylko ciasteczko sesji i nie zapisuje kodu w adresie.
          </p>
          {!configured ? (
            <p className="alert">
              Serwer nie ma ustawionego HOUSEHOLD_TOKEN o długości co najmniej 16 znaków. Prywatne API i MCP odmawiają dostępu.
            </p>
          ) : null}
          <form className="row" onSubmit={(event) => void onLogin(event)}>
            <label>
              Kod gospodarstwa
              <input
                type="password"
                name="household-token"
                autoComplete="current-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </label>
            <button className="primary" type="submit" disabled={pending}>Wejdź</button>
          </form>
        </section>
      )}

      <section className="note">
        <h2>Podłączenie bota</h2>
        <p>
          Zdalny adres MCP to <code>{mcpUrl}</code>.
          Klient ma wysłać nagłówek <code>Authorization: Bearer &lt;HOUSEHOLD_TOKEN&gt;</code>. Nie umieszczaj kodu w URL.
        </p>
        <p className="muted">
          Bot lodówki aktualizuje zapasy. Bot kuchni sam proponuje posiłek i zapisuje go narzędziem. Bot zakupów dopisuje braki.
          Koordynator korzysta z tych samych narzędzi. Promocje sklepów nie są podłączone.
        </p>
      </section>
      <section className="note future">
        <h2>Promocje</h2>
        <p className="muted">Aktualne ceny i oferty sklepów zostają na później. Ta wersja nie pokazuje cen i nie ma przycisku, który udawałby sklep.</p>
      </section>
    </main>
  );
}

function Dashboard(props: {
  tab: Tab;
  setTab: (tab: Tab) => void;
  items: InventoryRecord[];
  meals: MealRecord[];
  shopping: ShoppingRecord[];
  today: string;
  showConsumed: boolean;
  setShowConsumed: (value: boolean) => void;
  pending: boolean;
  setPending: (value: boolean) => void;
  refreshedAt: string | null;
  setMessage: (value: string | null) => void;
  send: (path: string, init?: RequestInit) => Promise<unknown>;
  refresh: () => Promise<void>;
}) {
  const visibleItems = props.items.filter((item) => props.showConsumed || item.consumedAt === null);

  async function submit(action: () => Promise<void>) {
    props.setPending(true);
    props.setMessage(null);
    try {
      await action();
      await props.refresh();
    } catch (error) {
      props.setMessage(error instanceof Error ? error.message : "Operacja nie powiodła się.");
    } finally {
      props.setPending(false);
    }
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Sekcje spiżarni">
        {([
          ["fridge", "Lodówka"],
          ["meals", "Posiłki"],
          ["shopping", "Zakupy"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={props.tab === id} onClick={() => props.setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="meta">
        <span>Dziś w Polsce: {formatDay(props.today)}</span>
        <span>{props.refreshedAt ? `Odświeżono ${props.refreshedAt}` : "Dane odświeżają się co 8 s"}</span>
        <button className="ghost" type="button" onClick={() => void props.refresh()}>Odśwież</button>
      </div>

      {props.tab === "fridge" ? (
        <Fridge
          items={visibleItems}
          pending={props.pending}
          showConsumed={props.showConsumed}
          setShowConsumed={props.setShowConsumed}
          today={props.today}
          submit={submit}
          send={props.send}
        />
      ) : null}
      {props.tab === "meals" ? <Meals meals={props.meals} pending={props.pending} submit={submit} send={props.send} /> : null}
      {props.tab === "shopping" ? (
        <Shopping items={props.shopping} pending={props.pending} submit={submit} send={props.send} />
      ) : null}
    </>
  );
}

function Fridge(props: {
  items: InventoryRecord[];
  pending: boolean;
  showConsumed: boolean;
  setShowConsumed: (value: boolean) => void;
  today: string;
  submit: (action: () => Promise<void>) => Promise<void>;
  send: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("szt");
  const [expiresOn, setExpiresOn] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ quantity: "", unit: "", expiresOn: "" });

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>Lodówka</h2>
        <label className="row">
          <input type="checkbox" checked={props.showConsumed} onChange={(event) => props.setShowConsumed(event.target.checked)} />
          Pokaż zużyte
        </label>
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void props.submit(async () => {
            await props.send("/api/inventory", {
              method: "POST",
              body: JSON.stringify({
                name,
                quantity: Number(quantity),
                unit,
                expiresOn: expiresOn || null,
              }),
            });
            setName("");
            setQuantity("1");
            setExpiresOn("");
          });
        }}
      >
        <label>Nazwa<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Ilość<input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label>Jednostka<input value={unit} onChange={(event) => setUnit(event.target.value)} required /></label>
        <label>Termin<input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
        <button className="primary" type="submit" disabled={props.pending}>Dodaj</button>
      </form>
      <div className="cards">
        {props.items.length === 0 ? <p className="muted">Lodówka jest pusta.</p> : null}
        {props.items.map((item) => (
          <article className="card" key={item.id}>
            <div>
              <h3 className={item.consumedAt ? "checked" : undefined}>{item.name}</h3>
              <p className="muted">{formatQuantity(item.quantity)} {item.unit}</p>
              <div className="row">
                <Expiry today={props.today} expiresOn={item.expiresOn} state={item.expiryState} />
                {item.isExample ? <span className="chip example">Przykład</span> : null}
                {item.consumedAt ? <span className="chip">Zużyte</span> : null}
              </div>
              {editing === item.id ? (
                <form
                  className="ingredient-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void props.submit(async () => {
                      await props.send(`/api/inventory/${item.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          quantity: Number(draft.quantity),
                          unit: draft.unit,
                          expiresOn: draft.expiresOn || null,
                        }),
                      });
                      setEditing(null);
                    });
                  }}
                >
                  <label>Ilość<input value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required /></label>
                  <label>Jednostka<input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} required /></label>
                  <label>Termin<input type="date" value={draft.expiresOn} onChange={(event) => setDraft({ ...draft, expiresOn: event.target.value })} /></label>
                  <button className="primary" type="submit" disabled={props.pending}>Zapisz</button>
                </form>
              ) : null}
            </div>
            {item.consumedAt ? null : (
              <div className="row">
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setEditing(item.id);
                    setDraft({ quantity: String(item.quantity), unit: item.unit, expiresOn: item.expiresOn ?? "" });
                  }}
                >
                  Edytuj
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => void props.submit(() => props.send(`/api/inventory/${item.id}/consume`, { method: "POST" }).then(() => undefined))}
                >
                  Zużyj
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <p className="muted">Przykładowe produkty są oznaczone i pojawiają się tylko po kliknięciu. Nie zastępują prawdziwej lodówki.</p>
      <button
        className="ghost"
        type="button"
        disabled={props.pending}
        onClick={() => void props.submit(() => props.send("/api/inventory/examples", { method: "POST" }).then(() => undefined))}
      >
        Wstaw przykładowe produkty
      </button>
    </section>
  );
}

function Meals(props: {
  meals: MealRecord[];
  pending: boolean;
  submit: (action: () => Promise<void>) => Promise<void>;
  send: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);

  return (
    <section className="panel">
      <h2>Posiłki</h2>
      <p className="muted">Zapisz propozycję ręcznie albo pozwól botowi kuchni zapisać własną przez MCP. Aplikacja nie generuje przepisu.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void props.submit(async () => {
            await props.send("/api/meals", {
              method: "POST",
              body: JSON.stringify({
                title,
                notes: notes || null,
                servings: servings ? Number(servings) : null,
                ingredients: ingredients
                  .filter((ingredient) => ingredient.name.trim())
                  .map((ingredient) => ({
                    name: ingredient.name,
                    quantity: ingredient.quantity ? Number(ingredient.quantity) : null,
                    unit: ingredient.unit || null,
                  })),
              }),
            });
            setTitle("");
            setNotes("");
            setServings("");
            setIngredients([emptyIngredient()]);
          });
        }}
      >
        <div className="form-grid">
          <label>Tytuł<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Porcje<input inputMode="numeric" value={servings} onChange={(event) => setServings(event.target.value)} /></label>
        </div>
        <label>Notatka<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        {ingredients.map((ingredient, index) => (
          <div className="ingredient-grid" key={index}>
            <label>Składnik<input value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value })} /></label>
            <label>Ilość<input value={ingredient.quantity} onChange={(event) => updateIngredient(index, { quantity: event.target.value })} /></label>
            <label>Jednostka<input value={ingredient.unit} onChange={(event) => updateIngredient(index, { unit: event.target.value })} /></label>
            <button className="ghost" type="button" onClick={() => setIngredients(ingredients.filter((_, itemIndex) => itemIndex !== index))}>Usuń</button>
          </div>
        ))}
        <div className="row">
          <button className="ghost" type="button" onClick={() => setIngredients([...ingredients, emptyIngredient()])}>Dodaj składnik</button>
          <button className="primary" type="submit" disabled={props.pending}>Zapisz propozycję</button>
        </div>
      </form>
      <div className="cards">
        {props.meals.length === 0 ? <p className="muted">Nie ma jeszcze zapisanych posiłków.</p> : null}
        {props.meals.map((meal) => (
          <article className="card" key={meal.id}>
            <div>
              <h3>{meal.title}</h3>
              <p className="muted">{meal.source === "mcp" ? "Zapisane przez MCP" : "Zapisane ręcznie"}{meal.servings ? ` · ${meal.servings} porcje` : ""}</p>
              {meal.notes ? <p>{meal.notes}</p> : null}
              {meal.ingredients.length > 0 ? (
                <ul>
                  {meal.ingredients.map((ingredient) => (
                    <li key={ingredient.id}>
                      {ingredient.name}
                      {ingredient.quantity ? ` · ${formatQuantity(ingredient.quantity)} ${ingredient.unit ?? ""}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  function updateIngredient(index: number, patch: Partial<IngredientDraft>) {
    setIngredients(ingredients.map((ingredient, itemIndex) => (itemIndex === index ? { ...ingredient, ...patch } : ingredient)));
  }
}

function Shopping(props: {
  items: ShoppingRecord[];
  pending: boolean;
  submit: (action: () => Promise<void>) => Promise<void>;
  send: (path: string, init?: RequestInit) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <section className="panel">
      <h2>Lista zakupów</h2>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          void props.submit(async () => {
            await props.send("/api/shopping", {
              method: "POST",
              body: JSON.stringify({
                name,
                quantity: quantity ? Number(quantity) : null,
                unit: unit || null,
              }),
            });
            setName("");
            setQuantity("");
            setUnit("");
          });
        }}
      >
        <label>Nazwa<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Ilość<input value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Jednostka<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
        <button className="primary" type="submit" disabled={props.pending}>Dodaj</button>
      </form>
      <div className="cards">
        {props.items.length === 0 ? <p className="muted">Lista jest pusta.</p> : null}
        {props.items.map((item) => (
          <article className="card" key={item.id}>
            <label className="row">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(event) => {
                  void props.submit(() =>
                    props.send(`/api/shopping/${item.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ checked: event.target.checked }),
                    }).then(() => undefined),
                  );
                }}
              />
              <span>
                <strong className={item.checked ? "checked" : undefined}>{item.name}</strong>
                {item.quantity ? <span className="muted"> · {formatQuantity(item.quantity)} {item.unit ?? ""}</span> : null}
              </span>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function Expiry({ today, expiresOn, state }: { today: string; expiresOn: string | null; state: ExpiryState }) {
  if (!expiresOn || state === "none") return <span className="chip">Bez terminu</span>;
  const days = daysUntil(expiresOn, today);
  const label = days < 0 ? "Po terminie" : days === 0 ? "Dzisiaj" : days === 1 ? "Jutro" : `Za ${days} dni`;
  return <span className={`chip ${state}`}>{label} · {formatDay(expiresOn)}</span>;
}

function formatDay(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(value);
}

function errorText(code: string | undefined): string | null {
  if (code === "unauthorized") return "Nieprawidłowy kod albo sesja wygasła.";
  if (code === "household_access_unconfigured") return "Dostęp gospodarstwa nie jest skonfigurowany.";
  if (code === "token_in_url") return "Kod nie może być w adresie.";
  if (code === "cross_origin") return "Żądanie pochodzi z innej strony.";
  if (code === "not_found") return "Nie znaleziono pozycji.";
  if (code === "already_consumed") return "Zużytej pozycji nie można edytować.";
  return null;
}

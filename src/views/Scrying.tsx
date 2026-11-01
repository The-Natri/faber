import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Telescope } from 'lucide-react';
import { call, errorText, subscribe } from '../lib/ipc.ts';
import { cn } from '../lib/format.ts';
import { useDecor } from '../lib/motion.ts';
import { Button, Checkbox, CountUp, CrystalSphere, Field, Input, Panel, Slider, ViewHeader, ViewScroll, useToast } from '../ui/index.ts';
import { CATEGORIES, type DiscoveryState } from '../../shared/types.ts';

const EMPTY: DiscoveryState = { running: false, logs: [], stats: { found: 0, saved: 0, updated: 0 }, center: null, points: [] };
const FALLBACK_CENTER = { lat: 13.0827, lon: 80.2707 };
const GLINTS = 30;
const LOG_SHOWN = 200;

const glintIcon = L.divIcon({
  className: 'faber-pin',
  html: '<div><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0 L8.4 5.6 L14 7 L8.4 8.4 L7 14 L5.6 8.4 L0 7 L5.6 5.6 Z" fill="#FFE2A0"/></svg></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Keeps the search circle framed inside the sphere
function FrameCircle({ lat, lon, radiusKm }: { lat: number; lon: number; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(lat, lon).toBounds(radiusKm * 2000), { padding: [6, 6], animate: false });
  }, [map, lat, lon, radiusKm]);
  return null;
}

// Scrying · Discover — the v1 OSM discovery around a crystal sphere. The run lives in main,
// so it keeps going (and its log survives) when you switch views.
export default function Scrying() {
  const toast = useToast();
  const decor = useDecor();
  const [location, setLocation] = useState('Anna Nagar, Chennai');
  const [radiusKm, setRadiusKm] = useState(5);
  const [categories, setCategories] = useState<string[]>(['Cafes']);
  const [home, setHome] = useState<{ lat: number; lon: number } | null>(null);
  const [state, setState] = useState<DiscoveryState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  // Defaults from Arcana, then whatever run is already in progress
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [view, current] = await Promise.all([call('settings:get'), call('discover:getState')]);
        if (cancelled) return;
        const defaults = view.settings.discovery;
        setLocation(defaults.location);
        setRadiusKm(defaults.radiusKm);
        setCategories(defaults.categories.filter((c) => (CATEGORIES as readonly string[]).includes(c)));
        const hb = view.settings.homeBase;
        if (hb.lat != null && hb.lon != null) setHome({ lat: hb.lat, lon: hb.lon });
        setState(current);
      } catch (err) {
        if (!cancelled) setFormError(errorText(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const offLog = subscribe('discover:log', (line) => setState((s) => ({ ...s, logs: [...s.logs, line] })));
    const offState = subscribe('discover:state', (next) => setState(next));
    return () => { offLog(); offState(); };
  }, []);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [state.logs.length]);

  const toggle = (category: string) =>
    setCategories((prev) => (prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]));

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!location.trim()) return setFormError('Please enter a location');
    if (categories.length === 0) return setFormError('Please select at least one category');
    setFormError(null);
    setState({ ...EMPTY, running: true });
    try {
      const result = await call('discover:run', { location: location.trim(), radiusKm, categories });
      setState((s) => ({ ...s, running: false, stats: { found: result.found, saved: result.saved, updated: result.updated } }));
    } catch (err) {
      setState((s) => ({ ...s, running: false, logs: [...s.logs, `❌ ${errorText(err)}`] }));
      toast({ title: 'Discovery could not start', description: errorText(err), tone: 'error' });
    }
  };

  const running = state.running;
  const center = state.center ?? { ...(home ?? FALLBACK_CENTER), radiusKm };
  const older = useMemo(() => state.points.slice(0, Math.max(0, state.points.length - GLINTS)), [state.points]);
  const newest = useMemo(() => state.points.slice(-GLINTS), [state.points]);
  const shownLogs = state.logs.slice(-LOG_SHOWN);
  const firstShown = state.logs.length - shownLogs.length;

  return (
    <ViewScroll>
      <ViewHeader themed="Scrying" plain="Discover" line="Look beyond the obvious." />

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)_auto] gap-6">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Search area" flourish>
            <form onSubmit={start} className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-5">
                <Field label="Target location" htmlFor="scry-location" className="col-span-2">
                  <Input id="scry-location" value={location} onChange={(e) => setLocation(e.target.value)} disabled={running} placeholder="e.g. Anna Nagar, Chennai" />
                </Field>
                <Field label={<>Radius: <span className="font-semibold text-gold-ink tabular">{radiusKm} km</span></>}>
                  <div className="flex h-9 items-center">
                    <Slider value={radiusKm} onChange={setRadiusKm} min={1} max={50} disabled={running} label="Search radius in kilometres" />
                  </div>
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-ink-muted">Categories</legend>
                <div className="grid grid-cols-4 gap-3 rounded-md border border-border bg-bg-elev p-4">
                  {CATEGORIES.map((cat) => (
                    <Checkbox key={cat} checked={categories.includes(cat)} onChange={() => toggle(cat)} label={cat} disabled={running} />
                  ))}
                </div>
              </fieldset>
              <div className="flex items-center gap-4">
                <Button type="submit" variant="primary" loading={running} icon={<Telescope className="size-4" />}>
                  {running ? 'Scrying…' : 'Start discovery'}
                </Button>
                <span className="text-xs text-ink-muted">Source: OpenStreetMap</span>
                {formError && <span className="text-sm text-st-lost" role="alert">{formError}</span>}
              </div>
            </form>
          </Panel>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Matches found', value: state.stats.found, tone: 'text-gold-ink' },
              { label: 'Saved as leads', value: state.stats.saved, tone: 'text-st-won' },
              { label: 'Updated', value: state.stats.updated, tone: 'text-st-contacted' },
            ].map((s) => (
              <div key={s.label} className="glass rounded-[var(--radius-md)] px-4 py-3">
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">{s.label}</div>
                <div className={cn('mt-1 text-2xl font-semibold tabular', s.tone)}><CountUp value={s.value} /></div>
              </div>
            ))}
          </div>

          <Panel title="Live log">
            <div className="max-h-72 overflow-y-auto rounded-md border border-border bg-bg p-3 font-mono text-[0.8rem] leading-relaxed" aria-live="polite">
              {state.logs.length === 0 && <div className="text-ink-muted">Awaiting the first vision…</div>}
              <AnimatePresence initial={false}>
                {shownLogs.map((line, i) => (
                  <motion.div
                    key={firstShown + i}
                    initial={decor ? { opacity: 0, x: -6 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35 }}
                    className={cn(line.includes('❌') ? 'text-st-lost' : line.includes('✅') || line.includes('🎉') ? 'text-st-won' : 'text-ink')}
                  >
                    {line}
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={logEnd} />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col items-center gap-3 pt-2">
          <CrystalSphere size={340} active={running}>
            <MapContainer
              key={`${center.lat.toFixed(3)},${center.lon.toFixed(3)}`}
              center={[center.lat, center.lon]}
              zoom={12}
              className="faber-map h-full w-full"
              preferCanvas
              zoomControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              boxZoom={false}
              keyboard={false}
              touchZoom={false}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FrameCircle lat={center.lat} lon={center.lon} radiusKm={center.radiusKm} />
              <Circle center={[center.lat, center.lon]} radius={center.radiusKm * 1000}
                pathOptions={{ color: '#F0C27A', weight: 1.5, dashArray: '4 6', fillColor: '#F0C27A', fillOpacity: 0.06 }} />
              {older.map((p, i) => (
                <CircleMarker key={i} center={[p.lat, p.lon]} radius={2.5} pathOptions={{ color: '#FFD98A', weight: 0, fillOpacity: 0.85 }} />
              ))}
              {newest.map((p, i) => (
                <Marker key={`g${state.points.length - newest.length + i}`} position={[p.lat, p.lon]} icon={glintIcon} interactive={false} />
              ))}
            </MapContainer>
          </CrystalSphere>
          <p className="max-w-[300px] text-center font-serif text-base italic text-ink-muted">
            {running ? 'The sphere stirs… each glint is a business found.' : state.points.length ? `${state.points.length} glints from the last search.` : 'Every new lead is a name waiting to be written.'}
          </p>
          <p className="text-[0.7rem] text-ink-muted">Map © OpenStreetMap contributors</p>
        </div>
      </div>
    </ViewScroll>
  );
}

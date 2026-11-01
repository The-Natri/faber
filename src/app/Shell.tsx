import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import * as RadixPopover from '@radix-ui/react-popover';
import { Bell, ChevronsLeft, ChevronsRight, Lock, Moon, Search, Sun } from 'lucide-react';
import { call, errorText, subscribe } from '../lib/ipc.ts';
import { cn, formatDateTime } from '../lib/format.ts';
import { NavigationContext, type NavTarget, type ViewId, type ViewRequest } from '../lib/navigation.ts';
import { useSettings } from '../lib/settings.ts';
import { BrandMark, Wordmark, Dialog, ErrorBoundary, IconButton, KeyboardHint, RuneStrip, Tooltip, useToast } from '../ui/index.ts';
import { EnrichmentChip } from './EnrichmentPanel.tsx';
import type { AppNotification, ExportEntity, SearchHit } from '../../shared/types.ts';
import { CommandPalette, type PaletteAction } from './CommandPalette.tsx';
import { NAV, navItem } from './nav.ts';

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', '1…7'], 'Switch views'],
  [['Ctrl', 'K'], 'Command palette'],
  [['/'], 'Focus search'],
  [['Ctrl', 'N'], 'New item in this view'],
  [['Ctrl', 'L'], 'Lock Faber'],
  [['Esc'], 'Close drawers and dialogs'],
  [['?'], 'Show this list'],
];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// Signs out after `minutes` without keyboard or mouse input; 0 turns it off
function useIdleLock(minutes: number, onIdle: () => void, paused: boolean) {
  const idle = useRef(onIdle);
  useEffect(() => {
    idle.current = onIdle;
  });
  useEffect(() => {
    if (!minutes || paused) return;
    let timer = setTimeout(() => idle.current(), minutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => idle.current(), minutes * 60_000);
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, paused]);
}

export function Shell({ username, locked, onLock }: { username: string; locked: boolean; onLock: () => void }) {
  const toast = useToast();
  const { view: settingsView, update } = useSettings();
  const appearance = settingsView?.settings.appearance;
  const collapsed = appearance?.sidebarCollapsed ?? false;
  const [current, setCurrent] = useState<ViewId>('atrium');
  const [request, setRequest] = useState<ViewRequest | null>(null);
  const [palette, setPalette] = useState<{ open: boolean; query: string }>({ open: false, query: '' });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const seq = useRef(0);

  useIdleLock(settingsView?.settings.security.autoLockMinutes ?? 15, onLock, locked);

  const navigate = useCallback((target: NavTarget) => {
    setCurrent(target.view);
    setRequest(target.focus || target.intent || target.section
      ? { seq: ++seq.current, focus: target.focus, intent: target.intent, section: target.section }
      : null);
  }, []);
  const navigation = useMemo(() => ({ current, navigate }), [current, navigate]);

  const setTheme = (theme: 'nocturne' | 'parchment') =>
    update('appearance', { theme }).catch((err) => toast({ title: 'Could not switch theme', description: errorText(err), tone: 'error' }));
  const toggleTheme = () => void setTheme(appearance?.theme === 'parchment' ? 'nocturne' : 'parchment');

  const exportCsv = async (entity: ExportEntity) => {
    try {
      const { path, rows } = await call('export:csv', { entity });
      if (path) toast({ title: `Exported ${rows} ${entity}`, description: path, tone: 'success' });
    } catch (err) {
      toast({ title: 'Export failed', description: errorText(err), tone: 'error' });
    }
  };

  const actions: PaletteAction[] = [
    ...NAV.map((n, i) => ({ id: `go-${n.id}`, label: `Open ${n.themed} · ${n.plain}`, hint: `Ctrl+${i + 1}`, keywords: 'go view', run: () => navigate({ view: n.id }) })),
    { id: 'discover', label: 'Start a discovery', keywords: 'scrying find osm', run: () => navigate({ view: 'scrying' }) },
    { id: 'enrich', label: 'Enrich the next 20 leads', keywords: 'google maps', run: () => {
      navigate({ view: 'codex' });
      void call('enrichment:run').catch((err) => toast({ title: 'Enrichment', description: errorText(err), tone: 'error' }));
    } },
    { id: 'new-lead', label: 'New lead', keywords: 'codex add manual referral walk-in', run: () => navigate({ view: 'codex', intent: 'new' }) },
    { id: 'new-project', label: 'New project', keywords: 'forge add', run: () => navigate({ view: 'forge', intent: 'new' }) },
    { id: 'new-payment', label: 'New payment milestone', keywords: 'treasury add', run: () => navigate({ view: 'treasury', intent: 'new' }) },
    { id: 'new-reminder', label: 'New reminder', keywords: 'almanac add follow up', run: () => navigate({ view: 'almanac', intent: 'new' }) },
    { id: 'backup', label: 'Back up now', keywords: 'backup save', run: () => {
      void call('backup:create').then(({ name }) => toast({ title: 'Backup written', description: name, tone: 'success' }))
        .catch((err) => toast({ title: 'Backup failed', description: errorText(err), tone: 'error' }));
    } },
    ...(['leads', 'projects', 'payments', 'reminders'] as const).map((entity) => ({
      id: `export-${entity}`, label: `Export ${entity} as CSV`, keywords: 'download csv', run: () => void exportCsv(entity),
    })),
    { id: 'trash', label: 'Open the trash', keywords: 'deleted restore', run: () => navigate({ view: 'arcana', section: 'data' }) },
    { id: 'theme', label: `Switch to ${appearance?.theme === 'parchment' ? 'nocturne' : 'parchment'}`, keywords: 'theme dark light', run: toggleTheme },
    { id: 'lock', label: 'Lock Faber', hint: 'Ctrl+L', keywords: 'sign out', run: onLock },
    { id: 'shortcuts', label: 'Show keyboard shortcuts', hint: '?', keywords: 'keys help', run: () => setShortcutsOpen(true) },
  ];

  const openHit = (hit: SearchHit) => {
    const view: ViewId = hit.type === 'lead' ? 'codex' : hit.type === 'project' ? 'forge' : 'almanac';
    navigate({ view, focus: { type: hit.type, id: hit.id } });
  };

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette({ open: true, query: '' }); return; }
      if (ctrl && e.key.toLowerCase() === 'l') { e.preventDefault(); onLock(); return; }
      if (ctrl && /^[1-9]$/.test(e.key)) {
        const item = NAV[Number(e.key) - 1];
        if (item) { e.preventDefault(); navigate({ view: item.id }); }
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'n') {
        const item = navItem(current);
        if (item.supportsNew) { e.preventDefault(); navigate({ view: current, intent: 'new' }); }
        return;
      }
      if (isTyping(e.target) || ctrl || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPalette({ open: true, query: '' }); }
      if (e.key === '?') { e.preventDefault(); setShortcutsOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, locked, navigate, onLock]);

  const active = navItem(current);
  const View = active.component;

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="flex h-full" inert={locked}>
        <Sidebar current={current} collapsed={collapsed} onNavigate={(id) => navigate({ view: id })}
          onToggle={() => void update('appearance', { sidebarCollapsed: !collapsed })} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-elev/90 px-5 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setPalette({ open: true, query: '' })}
              className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-md border border-border bg-bg px-3 text-sm text-ink-muted transition-colors hover:border-gold cursor-pointer"
              aria-label="Search (Ctrl+K)"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Search leads, projects, reminders…</span>
              <KeyboardHint keys={['Ctrl', 'K']} />
            </button>
            <div className="flex-1" />
            <EnrichmentChip />
            <NotificationsBell />
            <IconButton label={appearance?.theme === 'parchment' ? 'Switch to nocturne' : 'Switch to parchment'} onClick={toggleTheme}>
              {appearance?.theme === 'parchment' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </IconButton>
            <IconButton label="Lock" shortcut="Ctrl+L" onClick={onLock}><Lock className="size-4" /></IconButton>
            <span className="ml-1 hidden text-sm text-ink-muted lg:inline">{username}</span>
          </header>

          <main className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                className="h-full"
                initial={{ opacity: 0, filter: 'blur(3px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(2px)' }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              >
                <ErrorBoundary resetKey={current}>
                  <View request={request} />
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <CommandPalette
        open={palette.open}
        initialQuery={palette.query}
        onOpenChange={(open) => setPalette((p) => ({ ...p, open }))}
        actions={actions}
        onOpenHit={openHit}
      />
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard shortcuts">
        <ul className="divide-y divide-border">
          {SHORTCUTS.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between py-2.5 text-sm text-ink">
              <span>{label}</span>
              <KeyboardHint keys={keys} />
            </li>
          ))}
        </ul>
      </Dialog>
    </NavigationContext.Provider>
  );
}

function Sidebar({ current, collapsed, onNavigate, onToggle }: {
  current: ViewId; collapsed: boolean; onNavigate: (id: ViewId) => void; onToggle: () => void;
}) {
  return (
    <nav aria-label="Main" className={cn(
      'relative flex shrink-0 flex-col border-r bg-bg-elev transition-[width] duration-200',
      collapsed ? 'w-[68px]' : 'w-60'
    )} style={{ borderColor: 'color-mix(in oklab, var(--gilt-a) 40%, var(--border))' }}>
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-border', collapsed ? 'justify-center' : 'px-4')}>
        <BrandMark size={32} />
        {!collapsed && <Wordmark className="truncate text-[0.82rem] text-gold-ink" />}
      </div>
      {!collapsed && <RuneStrip className="mx-4 mt-2 !w-auto" opacity={0.35} />}
      <ul className="flex-1 space-y-1 p-2.5">
        {NAV.map((item, i) => {
          const isActive = item.id === current;
          const Icon = item.icon;
          const link = (
            <button
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={collapsed ? `${item.themed} · ${item.plain}` : undefined}
              className={cn(
                'group relative flex w-full items-center gap-3 overflow-hidden rounded-md py-2 text-left transition-colors cursor-pointer',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive ? 'text-gold-ink' : 'text-ink-muted hover:bg-surface hover:text-ink'
              )}
            >
              {isActive && (
                <motion.span layoutId="nav-active" aria-hidden className="absolute inset-0 rounded-md"
                  style={{ background: 'linear-gradient(90deg, color-mix(in oklab, var(--gold) 22%, transparent), color-mix(in oklab, var(--gold) 4%, transparent))', boxShadow: 'inset 2px 0 0 var(--gold)' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
              )}
              <Icon className="relative size-[18px] shrink-0" aria-hidden />
              {!collapsed && (
                <span className="relative min-w-0 flex-1">
                  <span className="block font-display text-[0.85rem] font-semibold tracking-wide">{item.themed}</span>
                  <span className="block text-[0.7rem] text-ink-muted">{item.plain}</span>
                </span>
              )}
              {!collapsed && <span className="relative text-[0.65rem] text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">^{i + 1}</span>}
            </button>
          );
          return (
            <li key={item.id}>
              {collapsed ? <Tooltip content={`${item.themed} · ${item.plain} (Ctrl+${i + 1})`} side="right">{link}</Tooltip> : link}
            </li>
          );
        })}
      </ul>
      <div className={cn('border-t border-border p-2.5', collapsed && 'flex justify-center')}>
        <IconButton label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </IconButton>
      </div>
    </nav>
  );
}

function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call('notifications:list').then((list) => { if (!cancelled) setItems(list); }).catch(() => {});
    const off = subscribe('notifications:new', (n) => setItems((list) => [n, ...list].slice(0, 50)));
    return () => { cancelled = true; off(); };
  }, []);

  const unread = items.filter((n) => !n.read).length;

  return (
    <RadixPopover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && unread) {
          setItems((list) => list.map((n) => ({ ...n, read: true })));
          void call('notifications:markAllRead').catch(() => {});
        }
      }}
    >
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          className="relative inline-flex size-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
        >
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full" style={{ backgroundColor: 'var(--gold-bright)' }} />}
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content align="end" sideOffset={6} className="z-[60] w-80 rounded-lg border border-border bg-bg-elev shadow-xl">
          <div className="border-b border-border px-4 py-2.5 font-display text-sm font-semibold text-gold-ink">Notifications</div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-muted">Nothing yet. Discovery, enrichment and backup events appear here.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--gold-bright)' }} />}
                      <span className="text-sm font-medium text-ink">{n.title}</span>
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-ink-muted">{n.body}</p>}
                    <p className="mt-1 text-[0.68rem] text-ink-muted tabular">{formatDateTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

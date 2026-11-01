import { useState } from 'react';
import { FileText } from 'lucide-react';
import { call } from '../lib/ipc.ts';
import { useLoad } from '../lib/useLoad.ts';
import { cn } from '../lib/format.ts';
import { useViewRequest, type ViewProps } from '../lib/navigation.ts';
import { motion } from 'motion/react';
import { useDecor } from '../lib/motion.ts';
import { Button, RuneStrip, ViewHeader } from '../ui/index.ts';
import { AppearanceSection, DiscoveryDefaultsSection, HomeBaseSection, OutreachSection, ProfileSection } from './arcana/ProfileSections.tsx';
import { IntegrationsSection, SecuritySection } from './arcana/SecuritySections.tsx';
import { BackupsSection, DataSection } from './arcana/DataSections.tsx';
import { SectionPanel } from './arcana/common.tsx';

const SECTIONS = [
  { id: 'profile', label: 'Profile & business' },
  { id: 'security', label: 'Security' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'homeBase', label: 'Home base' },
  { id: 'discovery', label: 'Discovery defaults' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'backups', label: 'Backups' },
  { id: 'data', label: 'Data & trash' },
  { id: 'about', label: 'About' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

// Arcana · Settings
export default function Arcana({ request }: ViewProps) {
  const decor = useDecor();
  const [section, setSection] = useState<SectionId>('profile');
  useViewRequest(request, ({ section: wanted }) => {
    if (wanted && SECTIONS.some((s) => s.id === wanted)) setSection(wanted as SectionId);
  });

  return (
    <div className="flex h-full">
      <nav aria-label="Settings sections" className="w-60 shrink-0 overflow-y-auto border-r border-border bg-bg-elev px-3 py-7">
        <div className="mb-2 px-3">
          <h1 className="font-display text-xl font-semibold tracking-wide text-gold-ink">Arcana</h1>
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">Settings</span>
          <p className="mt-1 font-serif text-base italic text-ink-muted">Make it yours.</p>
        </div>
        <RuneStrip className="mx-3 mb-4 !w-auto" opacity={0.35} />
        {/* Bookmark plaques */}
        <ul className="space-y-1.5">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative w-full rounded-r-md border-l-2 px-4 py-2 text-left font-display text-[0.8rem] font-semibold tracking-[0.06em] transition-[transform,background-color,color] duration-200 cursor-pointer',
                    active ? 'plank translate-x-1.5 border-l-[var(--gilt-b)]' : 'border-l-transparent text-ink-muted hover:translate-x-1 hover:bg-surface hover:text-ink'
                  )}
                >
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-3xl">
          {/* Remount per section so drafts start from the saved values; it slides out like a cabinet drawer */}
          <motion.div
            key={section}
            initial={decor ? { x: -36, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            {section === 'profile' && <ProfileSection />}
            {section === 'security' && <SecuritySection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'homeBase' && <HomeBaseSection />}
            {section === 'discovery' && <DiscoveryDefaultsSection />}
            {section === 'outreach' && <OutreachSection />}
            {section === 'integrations' && <IntegrationsSection />}
            {section === 'backups' && <BackupsSection />}
            {section === 'data' && <DataSection />}
            {section === 'about' && <AboutSection />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

const LICENSES = [
  ['Electron', 'MIT'], ['React', 'MIT'], ['better-sqlite3', 'MIT'], ['Playwright', 'Apache-2.0'], ['Leaflet', 'BSD-2-Clause'],
  ['react-leaflet', 'Hippocratic-2.1'], ['Tailwind CSS', 'MIT'], ['Radix UI', 'MIT'], ['Motion', 'MIT'], ['Lucide', 'ISC'],
  ['Zod', 'MIT'], ['Cinzel, Cormorant Garamond, Inter fonts', 'SIL Open Font License 1.1'],
  ['Map data © OpenStreetMap contributors', 'ODbL'],
];

function AboutSection() {
  const info = useLoad(() => call('app:info'));
  return (
    <div className="flex flex-col gap-5">
      <ViewHeader themed="Natri's Faber" plain={info.data ? `Version ${info.data.version}${info.data.is_dev ? ' · dev' : ''}` : ''} line="Faber est suae quisque fortunae." />
      <SectionPanel title="This installation">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-ink-muted">Data folder</dt><dd className="break-all font-mono text-xs text-ink">{info.data?.user_data_path}</dd>
          <dt className="text-ink-muted">Logs</dt><dd className="break-all font-mono text-xs text-ink">{info.data?.logs_path}</dd>
        </dl>
        <Button className="self-start" icon={<FileText className="size-4" />} onClick={() => void call('app:openLogs')}>Open logs folder</Button>
      </SectionPanel>
      <SectionPanel title="Open-source licenses">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {LICENSES.map(([name, license]) => (
            <li key={name} className="flex justify-between gap-3"><span className="text-ink">{name}</span><span className="text-ink-muted">{license}</span></li>
          ))}
        </ul>
      </SectionPanel>
    </div>
  );
}

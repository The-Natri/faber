import { BookOpen, CalendarDays, Coins, Hammer, Landmark, Settings2, Telescope, type LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ViewId, ViewProps } from '../lib/navigation.ts';
import Atrium from '../views/Atrium.tsx';
import Scrying from '../views/Scrying.tsx';
import Codex from '../views/Codex.tsx';
import Forge from '../views/Forge.tsx';
import Treasury from '../views/Treasury.tsx';
import Almanac from '../views/Almanac.tsx';
import Arcana from '../views/Arcana.tsx';

export interface NavItem {
  id: ViewId;
  themed: string;
  plain: string;
  icon: LucideIcon;
  component: ComponentType<ViewProps>;
  // Ctrl+N opens this view's "new" form
  supportsNew?: boolean;
}

// Sidebar order is also the Ctrl+1…9 order. Atlas and Missives arrive in later phases.
export const NAV: NavItem[] = [
  { id: 'atrium', themed: 'Atrium', plain: 'Dashboard', icon: Landmark, component: Atrium },
  { id: 'scrying', themed: 'Scrying', plain: 'Discover', icon: Telescope, component: Scrying },
  { id: 'codex', themed: 'Codex', plain: 'Leads', icon: BookOpen, component: Codex, supportsNew: true },
  { id: 'forge', themed: 'Forge', plain: 'Projects', icon: Hammer, component: Forge, supportsNew: true },
  { id: 'treasury', themed: 'Treasury', plain: 'Payments', icon: Coins, component: Treasury, supportsNew: true },
  { id: 'almanac', themed: 'Almanac', plain: 'Reminders', icon: CalendarDays, component: Almanac, supportsNew: true },
  { id: 'arcana', themed: 'Arcana', plain: 'Settings', icon: Settings2, component: Arcana },
];

export const navItem = (id: ViewId) => NAV.find((n) => n.id === id) ?? NAV[0];

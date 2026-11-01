import { createContext, useContext, useState } from 'react';

export type ViewId = 'atrium' | 'scrying' | 'codex' | 'forge' | 'treasury' | 'almanac' | 'arcana';

export type FocusTarget = { type: 'lead' | 'project' | 'reminder'; id: number };

// A one-off instruction for a view: open an item, or start a "new" form.
// `seq` changes every time, so the same request twice still triggers.
export interface ViewRequest {
  seq: number;
  focus?: FocusTarget;
  intent?: 'new';
  section?: string;
}

export interface ViewProps {
  request: ViewRequest | null;
}

export interface NavTarget {
  view: ViewId;
  focus?: FocusTarget;
  intent?: 'new';
  section?: string;
}

export interface Navigation {
  current: ViewId;
  navigate: (target: NavTarget) => void;
}

export const NavigationContext = createContext<Navigation>({ current: 'atrium', navigate: () => {} });

export function useNavigation(): Navigation {
  return useContext(NavigationContext);
}

// Runs onRequest once per new request. It runs during render (React's "adjust state when a
// prop changes" pattern), so it may only set this component's own state.
export function useViewRequest(request: ViewRequest | null, onRequest: (request: ViewRequest) => void) {
  const [handled, setHandled] = useState<number | null>(null);
  if (request && request.seq !== handled) {
    setHandled(request.seq);
    onRequest(request);
  }
}

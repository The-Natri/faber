import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Lead, LeadStatus } from '../../../shared/types.ts';
import { LEAD_STATUSES } from '../../../shared/pipeline.ts';

// Status-colored ink pins (custom divIcons, themed in CSS)
function pinIcon(status: LeadStatus): L.DivIcon {
  const hue = `var(--hue-${status})`;
  return L.divIcon({
    className: 'faber-pin',
    html: `<div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36" aria-hidden="true">
      <path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 23 11 23s11-14.7 11-23C23 5.9 18.1 1 12 1z" style="fill:${hue};stroke:var(--bg);stroke-width:1.5"/>
      <circle cx="12" cy="12" r="4.2" style="fill:var(--bg)"/></svg></div>`,
    iconSize: [24, 36],
    iconAnchor: [12, 35],
    popupAnchor: [0, -30],
  });
}

const ICONS = Object.fromEntries(LEAD_STATUSES.map((s) => [s, pinIcon(s)])) as Record<LeadStatus, L.DivIcon>;

const hasCoords = (l: Lead): l is Lead & { lat: number; lon: number } =>
  l.lat != null && l.lon != null && !isNaN(l.lat) && !isNaN(l.lon);

// v1 behavior: fit to the visible leads unless one is selected; fly to a selected lead
function MapController({ leads, selected }: { leads: Lead[]; selected: Lead | null }) {
  const map = useMap();

  useEffect(() => {
    const valid = leads.filter(hasCoords);
    if (valid.length > 0 && !selected) {
      map.fitBounds(L.latLngBounds(valid.map((l) => [l.lat, l.lon])), { padding: [40, 40], maxZoom: 15 });
    }
    // Only when the visible set changes, not when the selection does
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, map]);

  useEffect(() => {
    if (selected && hasCoords(selected)) {
      map.invalidateSize();
      map.flyTo([selected.lat, selected.lon], 17, { duration: 1 });
    }
  }, [selected, map]);

  return null;
}

export function LeadMap({ leads, selected, onSelect }: { leads: Lead[]; selected: Lead | null; onSelect: (lead: Lead) => void }) {
  const pins = useMemo(() => leads.filter(hasCoords), [leads]);

  return (
    <MapContainer center={[13.0827, 80.2707]} zoom={12} className="faber-map h-full w-full" preferCanvas={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController leads={leads} selected={selected} />
      {pins.map((lead) => (
        <Marker key={lead.id} position={[lead.lat, lead.lon]} icon={ICONS[lead.status] ?? ICONS.new} eventHandlers={{ click: () => onSelect(lead) }}>
          <Popup>
            <div className="text-[0.82rem]">
              <strong className="block">{lead.name}</strong>
              <span className="block text-ink-muted">{lead.category}</span>
              {lead.phone && <span className="mt-1 block tabular">{lead.phone}</span>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

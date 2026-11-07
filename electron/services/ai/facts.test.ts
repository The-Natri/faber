import { describe, expect, it } from 'vitest';
import type { Lead } from '../../../shared/types.ts';
import { factsForPrompt, publicLeadFacts, socialPlatforms } from './facts.ts';

// A full lead whose private fields hold values that must never reach a model
const lead: Lead = {
  id: 7, osm_id: 'node/7', name: '  Corner   Cafe ', category: 'Cafes', source: 'osm',
  phone: '98765 43210', address: '12 Example Street, Peelamedu', city: 'Coimbatore', lat: 11.02, lon: 76.99,
  rating: 4.4, review_count: 213,
  social_links: JSON.stringify(['https://instagram.com/cornercafe.owner', 'https://www.facebook.com/someone.private']),
  has_phone: 1, has_social: 1, enrichment_status: 'enriched', score: 72, status: 'contacted',
  notes: 'Owner prefers calls after 6pm; spoke to Ravi', scope: null, discovered_at: '2026-10-01', enriched_at: '2026-10-02',
  last_updated: '2026-10-02', is_chain: 0, chain_reason: null, tags: ['hot'], starred: 1, lost_reason: null,
  owner_name: 'Ravi Kumar', best_time: 'Evenings', last_contacted_at: '2026-10-05',
  website_url: 'https://cornercafe.example', website_status: 'unknown', website_evidence: null, website_reason: null, website_checked_at: null,
  website_audit: null, website_audited_at: null,
};

describe('publicLeadFacts', () => {
  it('keeps only the business-public allowlist', () => {
    expect(publicLeadFacts(lead)).toEqual({
      name: 'Corner Cafe', category: 'Cafes', city: 'Coimbatore', rating: 4.4, reviewCount: 213,
      social: ['instagram', 'facebook'], websiteStatus: 'unknown',
    });
  });

  it('never lets a phone number, owner name, note, address, handle or contact time through', () => {
    const out = JSON.stringify(publicLeadFacts(lead)) + factsForPrompt(publicLeadFacts(lead));
    for (const secret of ['98765', 'Ravi', 'Kumar', 'Owner prefers', 'Example Street', 'cornercafe.owner', 'someone.private', 'Evenings', 'hot']) {
      expect(out).not.toContain(secret);
    }
  });

  it('reduces social links to platform names and survives bad data', () => {
    expect(socialPlatforms('["https://linktr.ee/x","not a url"]')).toEqual(['other']);
    expect(socialPlatforms('not json')).toEqual([]);
    expect(socialPlatforms(null)).toEqual([]);
  });

  it('writes the facts as prompt lines', () => {
    expect(factsForPrompt(publicLeadFacts({ ...lead, rating: null, review_count: null, social_links: '[]' }))).toBe([
      'Business name: Corner Cafe', 'Category: Cafes', 'City: Coimbatore', 'Google rating: unknown',
      'Social media: none found', 'Website status: unknown',
    ].join('\n'));
  });
});

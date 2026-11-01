import type { Lead, WebsiteStatus } from '../../../shared/types.ts';

// The only lead data that may reach a model: facts the business itself publishes. Phone numbers,
// owner names, notes, addresses and the user's own profile never do. Fields are copied one by one
// from an explicit allowlist, so a column added to `leads` later stays out until it's added here.
export type LeadFactSource = Pick<Lead, 'name' | 'category' | 'city' | 'rating' | 'review_count' | 'social_links' | 'website_status'>;

export interface PublicLeadFacts {
  name: string;
  category: string | null;
  city: string | null;
  rating: number | null;
  reviewCount: number | null;
  // Platform names only; a profile URL or handle can name the owner of a small business
  social: string[];
  websiteStatus: WebsiteStatus;
}

const clean = (value: string | null, max: number) => (value ? value.replace(/\s+/g, ' ').trim().slice(0, max) || null : null);

export function socialPlatforms(socialLinks: string | null): string[] {
  let links: unknown;
  try {
    links = JSON.parse(socialLinks ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(links)) return [];
  const platforms = new Set<string>();
  for (const link of links) {
    try {
      const host = new URL(String(link)).hostname.replace(/^www\./, '');
      if (host.endsWith('instagram.com')) platforms.add('instagram');
      else if (host.endsWith('facebook.com')) platforms.add('facebook');
      else platforms.add('other');
    } catch {
      // Not a URL; nothing safe to say about it
    }
  }
  return [...platforms];
}

export function publicLeadFacts(lead: LeadFactSource): PublicLeadFacts {
  return {
    name: clean(lead.name, 200) ?? '',
    category: clean(lead.category, 60),
    city: clean(lead.city, 100),
    rating: lead.rating,
    reviewCount: lead.review_count,
    social: socialPlatforms(lead.social_links),
    websiteStatus: lead.website_status,
  };
}

// The facts as prompt text, one per line
export function factsForPrompt(facts: PublicLeadFacts): string {
  return [
    `Business name: ${facts.name}`,
    `Category: ${facts.category ?? 'unknown'}`,
    `City: ${facts.city ?? 'unknown'}`,
    `Google rating: ${facts.rating ?? 'unknown'}${facts.reviewCount !== null ? ` (${facts.reviewCount} reviews)` : ''}`,
    `Social media: ${facts.social.length ? facts.social.join(', ') : 'none found'}`,
    `Website status: ${facts.websiteStatus}`,
  ].join('\n');
}

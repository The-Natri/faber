import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../db/migrate.ts';
import { MIGRATIONS } from '../../db/migrations/index.ts';
import type { AiActivity } from '../../../shared/ai.ts';
import { normalizeIndianMobile, whatsAppLink } from '../../../shared/phone.ts';
import { SETTINGS_SCHEMAS } from '../../../shared/settings.ts';
import { leadActivity, logContactAttempt } from '../leads/index.ts';
import { AiError, type ChatRequest } from './gateway.ts';
import { OPENING_STYLES, PITCH_MAX_CHARS, PITCH_PROMPT, checkPitch, cleanPitch, draftPitch, signOff, templatePitch, type PitchGateway } from './pitch.ts';
import { publicLeadFacts } from './facts.ts';

let dir: string;
let db: Database.Database;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faber-pitch-'));
  db = new Database(path.join(dir, 'faber.db'));
  await runMigrations(db, MIGRATIONS, { backupDir: path.join(dir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function addLead(fields: Record<string, unknown> = {}): number {
  const values = {
    osm_id: `node/${Math.random()}`, name: 'Corner Cafe', category: 'Cafes', source: 'osm', city: 'Coimbatore',
    phone: '098765-43210', owner_name: 'Ravi Kumar', notes: 'Owner prefers calls after 6pm', address: '12 Example Street',
    rating: 4.4, review_count: 213, website_status: 'none', website_reason: 'Only Zomato and Maps listings',
    website_checked_at: '2026-11-01 10:00:00', ...fields,
  };
  const columns = Object.keys(values);
  return Number(db.prepare(`INSERT INTO leads (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`).run(values).lastInsertRowid);
}

// The user's own details: none of this may reach a model
const settings = {
  profile: SETTINGS_SCHEMAS.profile.parse({ yourName: 'Owner Person', businessName: 'Studio Example', phone: '+91 91234 56789', email: 'me@studio.example', upiId: 'owner@okbank', address: '9 Private Lane' }),
  outreach: SETTINGS_SCHEMAS.outreach.parse({ pitchOffer: 'I build mobile-friendly websites with WhatsApp ordering. Call me on 91234 56789.' }),
};

function gateway(reply: string | Error, patch: Partial<AiActivity> = {}) {
  const requests: ChatRequest[] = [];
  const g: PitchGateway = {
    status: () => ({ models: { pitch: 'faber-pitch' } }),
    chat: async (request) => {
      requests.push(request);
      if (reply instanceof Error) throw reply;
      return { text: reply, toolCalls: [], activity: { cost_usd: 0.00031, model_served: 'deepseek-ai/DeepSeek-V4-Pro', provider: 'deepinfra', fallback: 0, ...patch } as AiActivity };
    },
  };
  return { g, requests };
}

describe('draftPitch', () => {
  it('sends only public facts, the website verdict and the offer; the sign-off is added by Faber', async () => {
    const id = addLead();
    const { g, requests } = gateway('**Hi Corner Cafe team!** I noticed Corner Cafe in Coimbatore has a 4.4 rating but no website of its own. I build mobile-friendly websites with WhatsApp ordering. Would you be open to a quick chat?');

    const draft = await draftPitch(db, g, id, settings);

    expect(requests[0]).toMatchObject({ feature: 'pitch', model: 'faber-pitch', leadId: id, maxTokens: 350 });
    expect(requests[0].messages[0]).toEqual({ role: 'system', content: PITCH_PROMPT });
    const sent = JSON.stringify(requests);
    for (const secret of ['Owner Person', 'Studio Example', '91234', 'me@studio', 'okbank', 'Private Lane', '98765', 'Ravi', 'Owner prefers', 'Example Street']) {
      expect(sent).not.toContain(secret);
    }
    expect(requests[0].messages[1].content).toContain('Only Zomato and Maps listings');
    expect(requests[0].messages[1].content).toContain('I build mobile-friendly websites with WhatsApp ordering.');
    expect(requests[0].messages[1].content).not.toContain('Call me');

    expect(draft).toMatchObject({
      source: 'ai', issues: [], servedModel: 'deepseek-ai/DeepSeek-V4-Pro', provider: 'deepinfra', fallback: false, costUsd: 0.00031,
      signOff: 'Owner Person, Studio Example\n+91 91234 56789', phone: { e164: '+919876543210', wa: '919876543210' },
    });
    expect(draft.body.startsWith('Hi Corner Cafe team!')).toBe(true);
    expect(draft.body).not.toContain('**');
  });

  it('reports a fallback served by the policy backup', async () => {
    const { g } = gateway('Hi Corner Cafe team, would you be open to a quick chat?', { model_served: 'mistral.mistral-large-3-675b-instruct', provider: 'bedrock', fallback: 1 });
    expect(await draftPitch(db, g, addLead(), settings)).toMatchObject({ source: 'ai', fallback: true, provider: 'bedrock' });
  });

  it('falls back to the template when the guardrail blocks or Otari fails', async () => {
    const id = addLead();
    const blocked = await draftPitch(db, gateway(new AiError('blocked', 'blocked', { cost_usd: null } as AiActivity)).g, id, settings);
    expect(blocked).toMatchObject({ source: 'template', issues: [], servedModel: null, costUsd: 0 });
    expect(blocked.templateReason).toMatch(/guardrail blocked/);
    expect(blocked.body).toContain("I couldn't find a website for Corner Cafe");

    const budget = await draftPitch(db, gateway(new AiError('budget', 'The Otari spend limit has been reached.')).g, id, settings);
    expect(budget.templateReason).toMatch(/spend limit/);
  });

  it("won't draft for a chain or not-a-fit lead", async () => {
    await expect(draftPitch(db, gateway('x').g, addLead({ is_chain: 1, chain_reason: 'blocklist' }), settings)).rejects.toThrow(/chain/);
  });
});

describe('app-side checks', () => {
  const input = 'Business name: Corner Cafe\nGoogle rating: 4.4 (213 reviews)\nThe sender\'s offer: websites from ₹9999';

  it('passes a clean draft, including 24/7 and numbers from the facts', () => {
    expect(checkPitch('Hi Corner Cafe team, your 4.4 rating from 213 reviews deserves a 24/7 website. Open to a chat?', input)).toEqual([]);
  });

  it('flags length, contact details, links, placeholders and invented numbers', () => {
    expect(checkPitch('x'.repeat(PITCH_MAX_CHARS + 1), input)[0]).toMatch(/Too long/);
    expect(checkPitch('Call +91 98765 43210 today', input)).toContain('It contains a phone number.');
    expect(checkPitch('Mail hi@cafe.example', input)).toContain('It contains an email address.');
    expect(checkPitch('See www.cornercafe.com for more', input)[0]).toMatch(/link/);
    expect(checkPitch('Hi [Name], open to a chat?', input)).toContain('It contains a placeholder like [Name].');
    expect(checkPitch('Websites get 40% more customers', input)[0]).toMatch(/number that isn't in the facts: 40/);
    expect(checkPitch('', input)).toEqual(['The draft is empty.']);
  });

  it('cleans markdown, bullets, quotes and a stray sign-off', () => {
    expect(cleanPitch('"**Hi** there,\n\n\n- one line\nBest regards,"')).toBe('Hi there,\n\none line');
  });
});

describe('template, sign-off and WhatsApp', () => {
  it('fits the template under the limit even with a long offer', () => {
    const facts = publicLeadFacts({ name: 'Corner Cafe', category: 'Cafes', city: 'Coimbatore', rating: null, review_count: null, social_links: '[]', website_status: 'outdated' });
    const text = templatePitch(facts, 'word '.repeat(300));
    expect(text.length).toBeLessThanOrEqual(PITCH_MAX_CHARS);
    expect(text).toContain('Your website looks like it could use a refresh');
    expect(text.endsWith('Would you be open to a quick chat this week?')).toBe(true);
  });

  it('builds the sign-off from whatever profile fields are set', () => {
    expect(signOff(SETTINGS_SCHEMAS.profile.parse({ yourName: '', businessName: 'Studio', phone: '' }))).toBe('Studio');
  });

  it('normalises Indian mobiles and rejects landlines', () => {
    for (const raw of ['+91 98765 43210', '919876543210', '09876543210', '98765-43210', '0091 98765 43210']) {
      expect(normalizeIndianMobile(raw)).toEqual({ e164: '+919876543210', wa: '919876543210' });
    }
    for (const raw of ['0422 2345678', '12345', '+44 7700 900123', null]) expect(normalizeIndianMobile(raw)).toBeNull();
  });

  it('prefills the WhatsApp message, encoded', () => {
    expect(whatsAppLink('919876543210', 'Hi team & co?\n— Me')).toBe('https://wa.me/919876543210?text=Hi%20team%20%26%20co%3F%0A%E2%80%94%20Me');
  });
});

describe('logContactAttempt', () => {
  it('records the attempt only when called, and moves a New lead to Contacted', () => {
    const id = addLead();
    const lead = logContactAttempt(db, id, 'whatsapp', 'Pitch sent on WhatsApp');
    expect(lead).toMatchObject({ status: 'contacted' });
    expect(lead.last_contacted_at).not.toBeNull();
    expect(leadActivity(db, id).map((a) => [a.type, a.channel])).toEqual(expect.arrayContaining([['contact_attempt', 'whatsapp'], ['status_change', null]]));

    const later = addLead({ status: 'replied' });
    expect(logContactAttempt(db, later, 'whatsapp', null).status).toBe('replied');
  });
});

describe('pitch polish', () => {
  it('needs an offer and a website verdict before drafting, unless forced', async () => {
    const noOffer = { ...settings, outreach: SETTINGS_SCHEMAS.outreach.parse({}) };
    await expect(draftPitch(db, gateway('x').g, addLead(), noOffer)).rejects.toThrow(/Add your offer/);

    const unknown = addLead({ website_status: 'unknown', website_reason: null });
    await expect(draftPitch(db, gateway('x').g, unknown, settings)).rejects.toThrow(/Check the website first/);
    const { g, requests } = gateway('Would you like a website that works for you? I build mobile-friendly websites with WhatsApp ordering.');
    expect((await draftPitch(db, g, unknown, settings, { force: true })).source).toBe('ai');
    expect(requests).toHaveLength(1);
  });

  it('asks for the chosen opening style and never the "I noticed" opener', async () => {
    const { g, requests } = gateway('Hello there, would you like a site? I build mobile-friendly websites with WhatsApp ordering.');
    await draftPitch(db, g, addLead(), settings, { style: 2 });
    expect(requests[0].messages[1].content).toContain(`Opening style: ${OPENING_STYLES[2]}`);
    expect(PITCH_PROMPT).toContain("don't start with \"Hi {business} team, I noticed\"");
  });

  it('turns em and en dashes into plain punctuation', () => {
    expect(cleanPitch('No site yet—just listings. Open 9–5 daily – ask us.')).toBe('No site yet, just listings. Open 9-5 daily, ask us.');
    expect(checkPitch('A site — today?', 'x')).toContain('It uses an em or en dash.');
  });

  it("flags service features the offer doesn't mention", () => {
    const input = "The sender's offer: I build simple websites for local shops.";
    expect(checkPitch('I can set up Google Maps for you. Open to a chat?', input)).toContain("It describes your service with something your offer doesn't mention: google maps");
    expect(checkPitch('I build simple websites for local shops. Open to a chat?', input)).toEqual([]);
  });
});

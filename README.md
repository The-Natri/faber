# Faber

**A desktop CRM for a freelance web designer who sells websites to small local businesses, with AI help routed through [Otari](https://github.com/mozilla-ai/otari) and open-weight models only.**

Faber (Natri's Faber) is an Electron + React + SQLite app that runs on one Windows machine. It finds local businesses on OpenStreetMap, enriches and scores them, and tracks them through a pipeline from first contact to paid project. This branch adds the AI features. Every model call goes through Otari's hosted EU gateway, and no lead's private data ever reaches a model.

Built for Mozilla's **Developers Wilding: Online** hackathon.

- Hackathon branch: `otari-hackathon`. `main` is the baseline before Otari (`fa15643`).
- First Otari commit: [`f919ca1` feat(ai): integrate Otari gateway](https://github.com/The-Natri/faber/commit/f919ca1d6043c1bc3c57127a554912df6c854d67)
- Otari feedback, written while building: [OTARI_FEEDBACK.md](OTARI_FEEDBACK.md)

## Otari features used

- **Model routing and fallbacks:** routing policies `faber-verify` and `faber-pitch`, each falling back to Mistral Large 3 on Bedrock; fallback headers logged per call ([gateway.ts](electron/services/ai/gateway.ts))
- **MCP integrations:** Google Lighthouse audit through a remote MCP server, on streamed `/messages` ([websiteAudit.ts](electron/services/ai/websiteAudit.ts))
- **Web search:** `otari_web_search` finds a lead's website; only Otari's sources are kept ([websiteCheck.ts](electron/services/ai/websiteCheck.ts), [nameMatch.ts](electron/services/ai/nameMatch.ts))
- **Code execution:** "Ask your pipeline" runs Python on `/responses` with `code_interpreter` ([pipelineQuestion.ts](electron/services/ai/pipelineQuestion.ts))
- **Budgets and spending limits:** Otari budgets and spend ceilings, plus Faber's own monthly cap and spend meter from `usage.cost_usd` ([gateway.ts](electron/services/ai/gateway.ts), [activity.ts](electron/services/ai/activity.ts))
- **Multiple models serving distinct roles:** Model A judges, Model B writes pitches, a separate model screens untrusted text ([shared/settings.ts](shared/settings.ts))
- **Guardrails:** Lakera Guard organization mandate on every request, plus the `gpt-oss-safeguard-20b` screener ([screener.ts](electron/services/ai/screener.ts))
- **Open-weight models:** 4, in distinct roles. See [Models](#models).

## Videos

- Demo video: https://youtu.be/WO3_MgSnZFg
- Feedback: written, see [OTARI_FEEDBACK.md](OTARI_FEEDBACK.md). No video.

## What the AI does

| Feature | What the user sees | Otari features used |
|---|---|---|
| **Website check** | Codex → a lead → *Check website*, or a background batch from the Codex toolbar. Verdict: own working site, outdated, none, or unclear, with the evidence URL and a reason. | Routing policy `faber-verify` with fallback; in-loop `otari_web_search` (sources only); Lakera Guard org mandate; inline `usage.cost_usd` |
| **Name-match helper** | Leads whose Google Maps name differs from the OpenStreetMap name get a *match / no match* suggestion with a reason. Nothing changes until the user confirms. | Same path as the website check |
| **WhatsApp pitch drafts** | Lead view → *Draft pitch*. A short first message built from public facts, the website verdict and the user's own offer. App-side checks flag invented numbers, links or services. If AI fails, a built-in template takes over. Faber never sends anything. | Routing policy `faber-pitch` (DeepSeek V4 Pro → Mistral Large 3 on Bedrock); Lakera |
| **Website audit (MCP)** | Lead view → Website → *Audit site*. A Google Lighthouse run of the business's own site on a phone: four scores, LCP, top issues, a rating (modern / needs work / outdated) and up to three fixes. An "outdated" rating updates the website verdict. | Managed remote MCP server (`mcp_servers`) on streamed `/messages` with `anthropic-beta: mcp-client-2025-11-20`; Lakera |
| **Ask your pipeline** | Atrium → *Ask your pipeline*. A plain-language question gets an answer, a table or bar chart, and the Python that computed it. | Code execution on `/responses` (`code_interpreter`, `Otari-Code-Execution: otari`) |
| **AI Activity and spend meter** | Arcana → AI Activity. One row per Otari call: feature, model asked for, model and provider that answered, fallback, attempts, guardrail result, cost, request ID. This month's spend by feature. Faber's own monthly cap (default $5) refuses calls before they're made. | Response headers `Otari-Model`, `Otari-Provider`, `Otari-Fallback`, `Otari-Attempt-Count`, `Otari-Request-ID`, `Otari-Guardrails`; `usage.cost_usd`; Otari budgets and spend ceilings |
| **Connection settings** | Arcana → Integrations → Otari: key (stored encrypted with the OS keychain), models, *Test connection*. | `GET /models`, workspace key in `Otari-Key` |
| **Recording mode** | Ctrl+Shift+H (or Arcana → Appearance). Hides phone numbers, owner names and the user's own contact details on screen, for demos. Display only. | none |

## How a request flows

Untrusted text means business names from OpenStreetMap, fetched web pages, search results and Lighthouse output. It never reaches a model directly:

1. **Clean.** Faber strips markup, removes phone numbers and email addresses, and caps the length ([screener.ts](electron/services/ai/screener.ts)).
2. **Screen.** `openai/gpt-oss-safeguard-20b` classifies the text against Faber's own policy. The text always travels as the latest user message, so Otari's Lakera Guard mandate screens it too. Either one blocking stops the step.
3. **Model.** Only then does Model A or Model B read it, together with the lead's allowlisted public facts.

The model's own text from tool steps is thrown away. For web search, Faber keeps only the sources Otari reports in `otari_tool_calls`. For MCP, it keeps only the raw `mcp_tool_result` and parses the Lighthouse JSON itself. A run on any address other than the lead's own site is refused.

## Where it lives in the code

| Area | Files |
|---|---|
| Gateway client (OpenAI SDK, `Otari-Key`, no `Authorization` header) | [electron/services/ai/client.ts](electron/services/ai/client.ts) |
| Every call: chat, code runs, MCP runs, headers, cost, errors, Faber's cap | [electron/services/ai/gateway.ts](electron/services/ai/gateway.ts) |
| Public-facts allowlist (the only lead data a model may read) | [electron/services/ai/facts.ts](electron/services/ai/facts.ts) |
| Clean + screen untrusted text | [electron/services/ai/screener.ts](electron/services/ai/screener.ts) |
| Website check and batches | [electron/services/ai/websiteCheck.ts](electron/services/ai/websiteCheck.ts), [websiteRunner.ts](electron/services/ai/websiteRunner.ts) |
| Name-match helper | [electron/services/ai/nameMatch.ts](electron/services/ai/nameMatch.ts) |
| Pitch drafts | [electron/services/ai/pitch.ts](electron/services/ai/pitch.ts) |
| Website audit through MCP | [electron/services/ai/websiteAudit.ts](electron/services/ai/websiteAudit.ts) |
| Ask your pipeline (anonymised dataset + code execution) | [electron/services/ai/pipelineData.ts](electron/services/ai/pipelineData.ts), [pipelineQuestion.ts](electron/services/ai/pipelineQuestion.ts) |
| AI Activity log and monthly spend | [electron/services/ai/activity.ts](electron/services/ai/activity.ts), migrations [010](electron/db/migrations/010_ai_activity.ts), [011](electron/db/migrations/011_website_check.ts), [012](electron/db/migrations/012_website_audit.ts) |
| IPC (every request validated with zod) | [electron/ipc/ai.ts](electron/ipc/ai.ts), [shared/ipc/contract.ts](shared/ipc/contract.ts) |
| Settings (models, base URL, cap, MCP server URL) | [shared/settings.ts](shared/settings.ts) |
| UI | [AskPipeline.tsx](src/views/atrium/AskPipeline.tsx), [LeadDrawer.tsx](src/views/codex/LeadDrawer.tsx), [WebsiteCheckBar.tsx](src/views/codex/WebsiteCheckBar.tsx), [WebsiteBadge.tsx](src/views/codex/WebsiteBadge.tsx), [AiActivitySection.tsx](src/views/arcana/AiActivitySection.tsx), [SecuritySections.tsx](src/views/arcana/SecuritySections.tsx) |
| Probe script used for every finding in the feedback | [scripts/otari-probe.ts](scripts/otari-probe.ts) |
| Tests | `electron/services/ai/*.test.ts` |

## Models

All open-weight. Faber asks for routing policies, not models. The policies are defined in the Otari dashboard (Default workspace).

| Role | Asked for | Main model (provider) | Backup (provider) | Licence |
|---|---|---|---|---|
| Model A: website verdicts, name matches, audit ratings, pipeline questions | policy `faber-verify` | Mistral Small 4, `mistral-small-2603` (Mistral) | Mistral Large 3 (Amazon Bedrock) | Apache 2.0 / Apache 2.0 |
| Model B: pitch drafts | policy `faber-pitch` | DeepSeek V4 Pro (DeepInfra) | Mistral Large 3 (Amazon Bedrock) | MIT / Apache 2.0 |
| Screener | `openai/gpt-oss-safeguard-20b` | gpt-oss-safeguard-20b (Amazon Bedrock) | n/a | Apache 2.0 |

Guardrail: a Lakera Guard organization mandate (`lakera-faber`, block mode, prompt defense and PII) screens every request's latest user message.

## Privacy rules (enforced in code)

- **What a model may read:** business-public facts only. That means name, category, city, rating, review count, social presence and website status. [facts.ts](electron/services/ai/facts.ts) copies them field by field from an allowlist, so a column added to `leads` later stays out until someone adds it there.
- **What never reaches a model:** phone numbers, owner names, addresses, free-text notes and the user's own profile. Pitch sign-offs (name, business, phone) are added by Faber after the model answers.
- **Pipeline questions** see one aggregated row per segment (category × city × website status × stage × score band × chain), with counts and averages. They never see a row about a single lead.
- **The website audit** sends the MCP server only the business's public URL.
- **Spend limits:** paid calls are never retried automatically. Faber's monthly cap is checked before every paid call, and a refusal is logged like any other call.
- **The key** is read from the OS keychain (packaged app) or `OTARI_API_KEY` in a dev env file outside the repo. It is never logged.

## Run it from a fresh clone

Requires Windows, Node 22 or newer, and an Otari workspace key.

```bash
git clone https://github.com/The-Natri/faber.git
cd faber
git checkout otari-hackathon
npm ci
```

Dev runs read secrets from `../faber-private/.env`, next to the project folder and outside the repo. Set `FABER_ENV_PATH` to put the file elsewhere. The file must exist:

```
OTARI_API_KEY=<your Otari workspace key>
```

```bash
npm run dev        # starts the app with its own dev data folder (%APPDATA%\natris-faber-dev)
npx tsc --noEmit   # type-check
npm run lint
npm test
npm run build
```

In the app, create a login, then open Arcana → Integrations → Otari and press *Test connection*. A key pasted there takes priority over the env file. To match this setup, create the two routing policies above in the Otari dashboard, add a Lakera Guard mandate, and turn on Tools → Web search for the workspace. Code execution and the MCP audit need no setup.

## Licence

MIT. See [LICENSE](LICENSE).

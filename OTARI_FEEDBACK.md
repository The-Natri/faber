# Otari feedback

Findings from integrating Otari into Faber, a desktop CRM, for Developers Wilding: Online (2026-10-31 to 2026-11-07). Every entry was hit for real while building. Each one gives what the docs say, what happened, a repro, request IDs where a request was made, and its status on 2026-11-07.

- **Gateway:** hosted EU, `https://eu.api.otari.ai/api/v1`, one workspace API key sent as `Otari-Key`, Default workspace.
- **Docs read** at mozilla-ai/otari `53ed2d5` (2026-10-31). Source re-checked at `84f0ecd` (2026-11-06) where noted.
- **Repro:** `npm run otari:probe -- <command>` ([scripts/otari-probe.ts](scripts/otari-probe.ts)) needs `OTARI_API_KEY` in the dev env file. Keys are redacted in all evidence.

## Summary

| # | Finding | Kind | Status (2026-11-07) |
|---|---|---|---|
| 1 | Management reads answer a workspace key with 401 "Invalid master key" | DX / missing | **Partly fixed:** `GET /key/budget` and `/key/usage/summary` now work ([#2928](https://github.com/mozilla-ai/otari/pull/2928)); the other routes still say "Invalid master key" |
| 2 | `/tools` says web tools are available while the workspace refuses them | Bug | Reported by others as [#2691](https://github.com/mozilla-ai/otari/issues/2691), closed 2026-11-03 |
| 3 | Request-level guardrails can't run on hosted; the 502 is operator-facing | Bug / docs | Open as [#2937](https://github.com/mozilla-ai/otari/issues/2937); the profiles route now explains itself |
| 4 | Reasoning models return empty content when hidden reasoning uses up `max_tokens` | Docs | Open, not filed |
| 5 | The guardrail catalog lists `any_llm`, which a tenant can never define | Bug / missing | Still listed; the open-weight guardrail request is [#2722](https://github.com/mozilla-ai/otari/issues/2722) |
| 6 | A routing policy that isn't found gets `invalid_model`, which never mentions policies | DX | Open, draft issue |
| 7 | **A provider-narrowed spend ceiling refuses the request instead of skipping to the fallback** | **Bug, confirmed** | **Still in source at `84f0ecd`**, draft issue |
| 8 | A $0 budget behaved like "no limit" | Bug, unconfirmed | Observed once, draft issue |
| 9 | "All upstream providers timed out" after the first candidate failed with a 400 | DX | Open, draft issue |
| 10 | Dashboard trace says "a later attempt answered" when the only later attempt failed | Bug (dashboard) | Open, draft issue |
| 11 | Direct `POST /search` has no search tool on hosted, though in-loop search works | Missing | Open, draft issue |
| 12 | A guardrail 403 doesn't say which check fired | DX | Open, draft issue |
| 13 | Lakera blocked a plain instruction to run an MCP tool | Vendor behaviour | Worked around by rewording |
| 14 | MCP results are only visible on streamed `/messages` with a beta header | Missing | Documented; related [#2745](https://github.com/mozilla-ai/otari/issues/2745) |
| 15 | Hosted tool prices aren't published | Docs | Open |

## Findings

### 1. Management reads answer a workspace key with "Invalid master key"
- **Docs** (api-reference.md, Authentication): "Where a tenant needs one of those operations, a separately scoped endpoint serves it to the caller's own organization: `/api/v1/organizations/me/usage`…"
- **Happened (2026-10-31):** with a valid workspace key that serves chat completions, every one of these returned `401 {"detail":"Invalid master key"}`:
  - `/organizations/me/usage/summary`, `/organizations/me/budgets`, `/organizations/me/spend-ceilings`
  - `/organizations/me/routing-policies`, `/organizations/me/guardrails`
  - `/tool-settings`, `/workspaces`, `/usage/summary`

  An app couldn't read its own spend, so Faber rebuilt a spend meter from the inline `usage.cost_usd` of every call.
- **Status (retested 2026-11-07):**
  - **Now working:** `GET /key/budget` returns 200 with the organization ceiling's `remaining_usd` and reset date, and `GET /key/usage/summary` returns 200 with totals and per-model rows. Both came from [#2928](https://github.com/mozilla-ai/otari/pull/2928), merged 2026-11-05, so they arrived after Faber's meter was built.
  - **Still failing:** every route listed above still answers `401 Invalid master key`.
- **Suggestion:** return 403 with "API keys can't call this route; use `/key/budget` or `/key/usage/summary`, or a dashboard session". Point to the `/key/*` routes from the `/organizations/me/*` section of api-reference.md.
- **Repro:** `discover`; `get key/budget`; `get key/usage/summary`.

### 2. `/tools` says web search and fetch are available, but the workspace refuses them
- **Docs** (tools.md): "Unavailable but recognized tools remain in the response with `"available": false`."
- **Happened (2026-10-31):** `GET /tools` listed `otari_web_search` and `otari_web_fetch` with `"available": true`. A request declaring them got `403 {"detail":"web search is not enabled for this workspace"}`. It worked after turning on Tools → Web search in the dashboard.
- **Status:** reported independently as [#2691](https://github.com/mozilla-ai/otari/issues/2691) and closed as completed on 2026-11-03. Not retestable here, since web access is now on for this workspace.
- **Repro:** `discover`, then `search mistralai/mistral-small-4` on a workspace with web access off.

### 3. Request-level guardrails can't run on hosted, and the error is operator-facing
- **Docs** (guardrails.md, "Using a guardrail"): add `"guardrails": [{"profile": "prompt-injection", "mode": "block"}]` to a request.
- **Happened (2026-10-31):** `502 {"detail":"guardrail profile 'prompt-injection' requested but no guardrails service is configured. Set OTARI_GUARDRAILS_URL on the gateway or pass `url` on the guardrail entry."}`. A hosted tenant can't set `OTARI_GUARDRAILS_URL`. In `monitor` mode the request is served with `Otari-Guardrails: [{"valid":null,"score":null}]`, which fails open as documented but reads like "checked and fine".
- **What works:** organization guardrail definitions from `GET /tool-settings/guardrails/catalog`. Faber uses a Lakera Guard mandate.
- **Status:** open as [#2937](https://github.com/mozilla-ai/otari/issues/2937). Improved since: `GET /tool-settings/guardrails/profiles` was 401 on 2026-10-31 and now answers 200 `{"available":false,"reason":"No guardrails service is configured, so its profiles cannot be listed."}`.
- **Repro:** `guardrail mistralai/mistral-small-4`.

### 4. Reasoning models return empty content when hidden reasoning uses up `max_tokens`
- **Happened (2026-10-31):**
  - `alibaba/qwen-3.5-397b-a17b` and `z-ai/glm-5.2` answered HTTP 200 with `content: ""` and `completion_tokens: 400` (equal to `max_tokens`) on a one-sentence prompt.
  - `alibaba/qwen-3.5-35b-a3b` used 652 completion tokens to say "Hello! How can I help you today?".
- **Why it matters:** budget holds reserve the whole `max_tokens` (access-control.md, "Reservations are taken up front"). A reasoning model therefore needs a large `max_tokens`, and that uses up budget headroom. The docs give no way to cap or turn off reasoning on chat completions for these models.
- **Suggestion:** document how `reasoning_effort` (or a per-model equivalent) passes through for open-weight reasoning models, and whether reasoning text is exposed.
- **Repro:** `chat alibaba/qwen-3.5-397b-a17b z-ai/glm-5.2`.

### 5. The guardrail catalog offers `any_llm`, which an organization can never define
- **Docs** (guardrails.md, "Defining a guardrail on an organization"): "`any_llm` is refused outright: it takes no credential of its own…". The dashboard's picker hides it (`NOT_DEFINABLE` in `web/src/features/guardrails/builtInCatalog.ts`).
- **Happened:** `GET /tool-settings/guardrails/catalog`, which a tenant reads through the API, lists `any_llm` with empty `create_parameters` and no flag saying it can't be defined. It's the only entry that looks vendor-free, so a tenant planning from the API builds around it.
- **Net effect on hosted:** every guardrail a tenant can run needs a third-party vendor key. An open-weight judge such as `gpt-oss-safeguard-20b` can't run as an Otari guardrail, so Faber calls it as a normal model and enforces the verdict itself.
- **Status (2026-11-07):** still listed. The open-weight guardrail request is [#2722](https://github.com/mozilla-ai/otari/issues/2722).
- **Suggestion:** add `definable: false` with a reason to catalog rows the store refuses, or leave them out of the tenant read.
- **Repro:** `get tool-settings/guardrails/catalog`.

### 6. A routing policy that isn't found answers `invalid_model`, and the message never mentions policies
- **Happened (2026-10-31):** `model: "faber-verify"` returned `400 {"detail":"Unknown or unsupported model 'faber-verify'. Send a 'provider:model' selector, an alias, or a model id from the catalog (GET /api/v1/models).","code":"invalid_model"}`. The cause was a policy saved under a different name. It was slow to find because the message doesn't mention policies, and the key can't list policies (finding 1).
- **Suggestion:** when nothing matches, add "or the name of a routing policy in this key's workspace (<workspace>)". Let a key list the policy names it can resolve.
- **Repro:** `chat <a policy name that doesn't exist>`.

### 7. CONFIRMED: a provider-narrowed spend ceiling refuses the request instead of skipping to the fallback
- **Setup (dashboard):**
  - Policy `faber-verify`: main Mistral Small 4 on Mistral (`mistral-small-2603`), backup `openai/gpt-oss-120b` on DeepInfra.
  - Budget `force-fallback-test`, limit $0.00001, with a spend ceiling on Default workspace narrowed to **provider instance `mistral`**.
- **Docs** (routing.md, "What is billed and what the caller sees"): "A fallback is skipped when a budget narrowed to its provider has no room, and the next candidate is tried." access-control.md says a scoped budget "can optionally narrow the limit to one provider".
- **Happened (2026-11-01):** `403 budget_exceeded`, and the backup was never tried:
  ```json
  {
    "request": { "method": "POST", "url": "https://eu.api.otari.ai/api/v1/chat/completions",
      "body": { "model": "faber-verify", "max_tokens": 120,
                "messages": [{ "role": "user", "content": "In one sentence, what does a small local bakery gain from having a website?" }] } },
    "response": { "status": 403,
      "headers": { "otari-request-id": "06c2ec9d-846e-42db-aee4-f82f6500c093", "otari-error-code": "budget_exceeded", "otari-budget-scope": "workspace" },
      "body": { "detail": "Workspace has $0.00001 of budget remaining, less than this request's estimated cost of $0.000076. The estimate assumes 120 output tokens; a lower output token limit on the request may let it fit", "code": "budget_exceeded" } }
  }
  ```
  The response had no `Otari-Fallback`, `Otari-Model`, `Otari-Provider` or `Otari-Attempt-Count` header, so no candidate was called. Not charged.
- **Cause, from the source:** the up-front hold is taken on the plan's head candidate before any attempt runs. At `84f0ecd` (2026-11-06), `src/gateway/api/routes/_pipeline.py` lines ~3163–3190:
  - `reserve_budget(..., scope=BudgetScopeRequest(provider_instance=gate_instance))`, with `gate_instance = plan.head.instance`.
  - A refusal moves on to the next offering only when `plan.automatic` is set (catalog-id routing), via `if plan is None or plan.automatic is None or ...: raise`.

  So for a routing policy, a provider-only ceiling on the **first** candidate refuses the whole request. The documented skip only reaches later candidates (`move_reservation_for_attempt`).
- **Also:** the refusal says "Workspace has $0.00001 of budget remaining" without naming the provider the ceiling is narrowed to.
- **Suggestion:** give routing-policy plans the same skip on a head refusal that automatic plans already have. Name the provider in a provider-narrowed refusal.
- **Evidence:** `forced-fallback-2026-11-01.json` (Faber's private evidence folder; redacted copy above).
- **Repro:** create the ceiling above, then `chat faber-verify --evidence=<file>`.

### 8. A $0 budget behaved like "no limit" (observed once; the source says it should refuse)
- **Happened (2026-11-01):** the ceiling was the same as in finding 7, but on a budget saved with a **$0** limit. The request was served on Mistral as if there were no ceiling: HTTP 200, `Otari-Request-ID: 6fc37305-8bcc-4c69-9340-2c25275ddfe5`, `Otari-Provider: mistral`, `Otari-Fallback: false`, `cost_usd: "0.000026"`. Changing **only** the limit to $0.00001 made the next identical request return finding 7's 403.
- **Source (`53ed2d5`) says $0 should refuse:**
  - The dashboard sends `0` (`OrganizationBudgetDialog.tsx`).
  - The API accepts it (`ge=0`).
  - The hold SQL admits only `cap IS NULL OR (committed < cap AND committed + held <= cap)`, which is false for a cap of 0.

  Either the hosted build differed, or the $0 was stored as "no limit". Not confirmed which.
- **Why it matters:** "$0" reads as a kill switch, and here it allowed spending.
- **Suggestion:** treat 0 as a hard stop everywhere (or refuse 0 in the form with "leave blank for no limit"), and show the saved cap on the ceiling's row.

### 9. "All upstream providers timed out" when the first candidate failed with a 400
- **Docs** (routing.md, "Selection and failure are separate"): `on_failure` is tried "whatever the provider's error: an outage, a rate limit, or a request it refuses as invalid (400)".
- **Trigger:** the OpenAI-standard `seed` field. Mistral's SDK has `random_seed`, not `seed`, so the Mistral attempt fails with a 400.
- **Happened (2026-11-01, twice):** `504 {"detail":"All upstream providers timed out"}`, request IDs `1ff48ef4-82ff-4891-ab57-9dbf121f7568` (5.27 s) and `4c0dce3a-b459-4bdd-b5e3-ae1a42f5c2fb` (8.19 s). Not charged. The dashboard trace shows routing worked as documented: #1 `mistral` failed **400** after 102 ms, then #2 `gpt-oss-120b` on DeepInfra failed **504**.
- **DX problem:** the message says every provider timed out, but the first one refused the request. Something like "The last candidate timed out (1 earlier candidate refused the request with a 400)" would point at both failures.
- **Resolved for Faber:** the backup moved to Mistral Large 3 on Bedrock. The same request now falls back and is served (see "What worked well").
- **Repro:** `chat faber-verify --max=200 --extra={"seed":7}`, with a DeepInfra `gpt-oss-120b` backup.

### 10. The dashboard trace says "a later attempt answered" when the only later attempt failed
- **Where:** dashboard → Overview → Sessions → the trace for `4c0dce3a-b459-4bdd-b5e3-ae1a42f5c2fb`.
- **Happened:** the routing plan on the trace shows #1 failed 400 and #2 failed 504, and the request ended in 504. The "Where the gateway stepped in" panel beside it still says **"a later attempt answered"**.
- **Suggestion:** word the panel from the final outcome, for example "fell back; the fallback also failed (504)".

### 11. Direct search (`POST /search`) has no search tool on hosted, though in-loop search works
- **Docs** (api-reference.md, "Search"; tools.md, "Direct search"): `POST /api/v1/search` runs a configured search tool directly.
- **Happened (2026-11-01):** with web search enabled (in-loop `otari_web_search` works), `POST /api/v1/search` answered `400 {"detail":"No search tools are configured. Add one on the dashboard's Tools & Guardrails page (or POST /api/v1/search-tools), or declare one under 'search_tools' in your config file, supplied directly or through OTARI_CONFIG_YAML / OTARI_CONFIG_B64."}`. Request ID: `04af0a15-4f4f-4510-ae27-62dfe9fb9f08`. Not charged.
- **Why it matters:**
  - Direct search is the way to get results *without* a model reading them first. That's exactly what an app that screens untrusted text wants.
  - On hosted, the only way in is a vendor search key on the workspace.
  - The message points a tenant at config files and environment variables they can't set.
- **Faber's workaround:** one small model call with `otari_web_search` (`max_uses: 1`). Its text is thrown away; only the `sources` from `otari_tool_calls` are kept, then cleaned and screened. This costs about $0.0102 per lookup, where a direct search would cost $0.01 with no model in the loop.
- **Suggestion:** let direct search use the hosted in-loop backend at the same price, or document that it needs a workspace search key, and word the 400 for tenants.
- **Repro:** `dsearch Mozilla.ai official website`.

### 12. A mandated guardrail's 403 doesn't say which check fired
- **Happened (2026-11-01):** the org's Lakera mandate (prompt defense and PII on) blocked a screening request. The latest user message was the cleaned text of an ordinary bakery's home page, with phone numbers and emails already removed. Response: `403 {"detail":{"message":"Request blocked by guardrail policy.","code":"guardrail_violation","guardrails":[{"profile":"lakera-faber","explanation":null,"score":1}]}}`. Request ID: `caaaf70b-dac8-497c-9775-5d4c7889b32f`. The same flow passed other business pages.
- **Why it matters:** with `explanation: null` and no detector name, a tenant can't tell a prompt-injection hit from a PII hit. So they can't decide whether to tune the vendor policy or their own text cleaning.
- **Suggestion:** pass the triggered category (for example `prompt_attack`, `pii/phone_number`) through in `guardrails[].explanation` or a new field, without the vendor's raw message.

### 13. Lakera blocked a plain instruction to run an MCP tool
- **Happened (2026-11-07):** a streamed `/messages` request with the Lighthouse MCP server was blocked with 403 `guardrail_violation` before any model ran ($0). Request ID: `a53756fb-4d47-4db1-be49-df598cbc720f`. The user message read: "Call run_lighthouse exactly once … then reply with the single word: done".
- **Rewording fixed it:** "Please run a mobile Lighthouse audit of the website <url>." passes, and has on every audit since (`a10bf5a9-54e1-40c6-985d-bc765f7547b1`).
- **Why it matters:** an app's *own* instruction-like wording reads as prompt injection to the vendor model. Since the 403 carries no category (finding 12), the only way to learn this is trial and error.
- **Suggestion:** same as 12. Docs could also note that a mandate screens the app's own prompt text, not only third-party content.

### 14. MCP results are only visible on streamed `/messages` with a beta header
- **Docs** (mcp.md, "Messages streaming activity"; tools.md, "What clients receive"): Chat Completions and Responses "continue to hide this activity". Only streamed `/messages` with `anthropic-beta: mcp-client-2025-11-20` emits `mcp_tool_use` and `mcp_tool_result` blocks.
- **Happened:** as documented. Faber is built on the OpenAI SDK, so the website audit needed a hand-written SSE client for `/api/v1/messages` just to read the tool's raw result. Without it, Faber couldn't check which URL the model audited or keep the model from paraphrasing the numbers.
- **Suggestion:** report MCP calls (name, input, result) in `otari_tool_calls` on Chat Completions, as search and fetch already are, and in non-streamed `/messages`. Related: [#2745](https://github.com/mozilla-ai/otari/issues/2745).

### 15. Hosted tool prices aren't published
- **Measured on hosted EU:**
  - Each web search, web fetch or code-execution run is a flat **$0.01** on top of model tokens. A search also feeds about 3.6k tokens of results back as input.
  - An "Ask your pipeline" answer cost $0.011006 in total (`041323b4-7b25-4a89-b5e9-2d34ba023ae0`).
  - A gateway-run **MCP call carried no per-call charge**: a full Lighthouse audit cost $0.0006–0.0009 in tokens.
- **Why it matters:** tools.md explains how rates are set, but the hosted rates aren't listed anywhere, and the inline `usage` gives only a total.
- **Suggestion:** publish the hosted tool rates, and add a per-tool line to the inline `usage`.

## What worked well

- **Routing-policy fallback is real and visible.** Policy `faber-verify` with the `seed` trick: Mistral refused with a 400, and Mistral Large 3 on Bedrock answered. The response had `Otari-Fallback: true`, `Otari-Attempt-Count: 2`, `Otari-Provider: bedrock`, `Otari-Model: mistral.mistral-large-3-675b-instruct`, request `22f7fa2d-26a3-445b-a7b9-e3909111b5f2`, $0.000073. Without `seed`, the main model answers (`e374ef67-293c-4c55-bb27-530bbd404f9f`). Faber shows these headers per call in its AI Activity view.
- **Catalog-id fallback with no setup.** `model: "openai/gpt-oss-120b"` moved from a failing offering to OVHcloud by itself (`a1cd3678-465b-4731-8751-6b2c765ea6e7`).
- **Response headers and inline cost.** `Otari-Model`, `Otari-Provider`, `Otari-Fallback`, `Otari-Attempt-Count`, `Otari-Request-ID`, `Otari-Guardrails` and `usage.cost_usd` were enough to build a per-call log and a monthly spend meter without any other API.
- **Lakera Guard as an org mandate.** One dashboard setting screens every request from every key, with no code in the app. It blocked a real injection test (`24ed516c-db77-4ea9-87bb-d67d05866abf`), and the block costs nothing.
- **Code execution on `/responses`.** Python ran on an anonymised CSV and returned the code and its stdout as `code_interpreter_call` items, so Faber can show the user exactly what was computed. The answers matched SQL. [#2719](https://github.com/mozilla-ai/otari/issues/2719) (402 on hosted) is fixed.
- **Managed MCP with an inline public server.** One `mcp_servers` entry, no registration, and Otari ran a remote Lighthouse server for the cost of the tokens.
- **The `Otari-Key` header works with the OpenAI Node SDK.** Setting `Authorization: null` in `defaultHeaders` is the only change needed.
- **Error messages that teach.** `GET /v1/models` answers 404 "Otari serves its API under /api/v1, not /v1". Budget refusals give the estimate and suggest a lower `max_tokens`.
- **Responsive upstream.** A key budget and usage read was asked for by another participant, and it shipped within the week ([#2928](https://github.com/mozilla-ai/otari/pull/2928)).

## What's missing

- **A way to force a routing-policy fallback for testing** without request-parameter tricks. On `faber-pitch`, DeepInfra accepted every parameter Faber tried (`logit_bias` with an out-of-vocabulary token, `stream_options` without streaming), so its fallback couldn't be shown. Requests: `725e07d9-e517-4ebc-a4be-8066c5e20775`, `4e281a13-8ea5-4161-91f2-bbe499bad59d`. A header like `Otari-Skip-Candidate: 1` on test keys would make fallbacks demonstrable.
- **An open-weight guardrail on hosted** ([#2722](https://github.com/mozilla-ai/otari/issues/2722)). Faber runs `gpt-oss-safeguard-20b` as a second screen itself, because no keyless guardrail exists.
- **Output guardrails.** Mandates are input-only (guardrails.md), so model output is checked by app code (Faber's pitch checks).
- **Tool results on Chat Completions** for MCP and code execution (finding 14).
- **Direct search on hosted** (finding 11).
- **A detector category on guardrail blocks** (findings 12 and 13).
- **Published hosted tool prices** and a per-tool cost line (finding 15).

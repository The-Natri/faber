# Otari feedback log

Running log of mismatches between the Otari docs and the hosted gateway, found while integrating Otari into Faber for Developers Wilding: Online. Each entry: date, what the docs say, what happened, repro. Cleaned into a write-up in Phase 7.

- Gateway: hosted EU, `https://eu.api.otari.ai/api/v1`, workspace API key sent as `Otari-Key`.
- Docs read at mozilla-ai/otari `53ed2d5` (2026-10-31).
- Repro for every entry: `npm run otari:probe -- <command>` (`scripts/otari-probe.ts`).

## Live mismatches

### 1. 2026-10-31 · Management reads answer a workspace key with "Invalid master key"
- **Docs** (api-reference.md, Authentication): "Where a tenant needs one of those operations, a separately scoped endpoint serves it to the caller's own organization: `/api/v1/organizations/me/usage`…"
- **Happened:** with a valid workspace API key (the same key serves chat completions fine), every one of these returns `401 {"detail":"Invalid master key"}`: `/organizations/me/usage/summary`, `/organizations/me/budgets`, `/organizations/me/spend-ceilings`, `/organizations/me/routing-policies`, `/organizations/me/guardrails`, `/tool-settings`, `/workspaces`, `/usage/summary`.
- **Why it matters:** the key is valid but lacks the authority. The message points at a master key the tenant doesn't have, and the docs don't say whether these `me` routes accept API keys or only dashboard sessions. An app can't read its own spend through the API, so a spend meter has to be rebuilt from the inline `usage.cost_usd`.
- **Suggestion:** return 403 with a reason like "this route needs a dashboard session or an owner/admin identity; API keys cannot call it", and state it in the docs. Ideally, let a key read its own usage and its own budget's remaining amount.
- **Repro:** `discover`.

### 2. 2026-10-31 · `/tools` says web search and fetch are available, but the workspace refuses them
- **Docs** (tools.md): "Unavailable but recognized tools remain in the response with `"available": false`."
- **Happened:** `GET /tools` lists `otari_web_search` and `otari_web_fetch` with `"available": true`. A request declaring them gets `403 {"detail":"web search is not enabled for this workspace"}` (search) or `403 {"detail":"web access is not enabled for this workspace"}` (fetch). The hosted deployment apparently runs `web_search_workspace_default: false`, which the docs give as defaulting to `true`, and nothing tells a hosted tenant about it.
- **Suggestion:** have `/tools` reflect the caller's workspace policy (`available: false, reason: "disabled for this workspace"`). In the hosted getting-started text, mention that web access starts off and is switched on under Tools → Web search.
- **Retest 2026-10-31, after enabling Tools → Web search in the dashboard:** search and fetch both work (one call each, `otari_tool_calls` lists the query and sources). The `/tools` mismatch still stands for anyone who hasn't enabled web access yet.
- **Repro:** `discover`, then `search mistralai/mistral-small-4`.

### 3. 2026-10-31 · Request-level guardrails can't run on hosted, and the error is operator-facing
- **Docs** (guardrails.md, "Using a guardrail"): add `"guardrails": [{"profile": "prompt-injection", "mode": "block"}]` to a request.
- **Happened:** `502 {"detail":"guardrail profile 'prompt-injection' requested but no guardrails service is configured. Set OTARI_GUARDRAILS_URL on the gateway or pass `url` on the guardrail entry."}`. The hosted gateway has no guardrails service, and a tenant can't set `OTARI_GUARDRAILS_URL`. In `monitor` mode the request is served with `Otari-Guardrails: [{"valid":null,"score":null}]`, which fails open as documented but is easy to mistake for "checked and fine". `GET /tool-settings/guardrails/profiles` is 401 for the key, so a tenant can't discover that no profiles exist.
- **What works instead:** `GET /tool-settings/guardrails/catalog` lists guardrails Otari runs itself: alinia, any_llm, azure_content_safety, azure_prompt_shields, bedrock_guardrails, lakera_guard, openai_moderation, patronus, watsonx_guardian. These are set up as organization definitions and mandates in the dashboard.
- **Suggestion:** say on guardrails.md that hosted tenants use organization definitions from the catalog, not request-level profiles. Word the 502 for tenants.
- **Repro:** `guardrail mistralai/mistral-small-4`.

### 4. 2026-10-31 · Reasoning models return empty content when hidden reasoning uses up `max_tokens`
- **Happened:** `alibaba/qwen-3.5-397b-a17b` and `z-ai/glm-5.2` answered HTTP 200 with `content: ""` and `completion_tokens: 400` (= `max_tokens`) on a one-sentence prompt. `alibaba/qwen-3.5-35b-a3b` used 652 completion tokens to say "Hello! How can I help you today?".
- **Why it matters:** budget holds reserve the whole `max_tokens` (access-control.md, "Reservations are taken up front"), so reasoning models need a large `max_tokens`, and that eats budget headroom. The docs give no way to turn reasoning off or cap it on chat completions for these models, or to see the reasoning text.
- **Suggestion:** document how `reasoning_effort` (or a per-model equivalent) passes through for open-weight reasoning models, and whether reasoning tokens are exposed.
- **Repro:** `chat alibaba/qwen-3.5-397b-a17b z-ai/glm-5.2`.

### 5. 2026-10-31 · The guardrail catalog offers `any_llm`, which an organization can never define
- **Docs** (guardrails.md, "Defining a guardrail on an organization"): "`any_llm` is refused outright: it takes no credential of its own…". The dashboard's own picker hides it (`web/src/features/guardrails/builtInCatalog.ts`, `NOT_DEFINABLE`).
- **Happened:** `GET /tool-settings/guardrails/catalog`, which the docs call "the picker" a tenant reads, lists `any_llm` (vendor Mozilla AI, licence apache-2.0, category `general_judge`) with an empty `create_parameters` and no flag saying it can't be defined. It's also the only entry that looks vendor-free, so a tenant reading the API (not the dashboard) plans around it and only finds the refusal in prose.
- **Net effect on hosted:** every inference guardrail a tenant can actually run needs a third-party vendor key (Alinia, Azure, Bedrock, Lakera, OpenAI moderation, Patronus, watsonx). There's no way to run an open-weight judge such as `gpt-oss-safeguard-20b` as an Otari guardrail.
- **Suggestion:** add `definable: false` (with the reason) to catalog rows the store refuses, or leave them out of the tenant read as the dashboard does. A metered `any_llm` that judges with a model from the tenant's own catalog, billed like any request, would make an open-weight guardrail possible on hosted.
- **Repro:** `get tool-settings/guardrails/catalog`.

### 6. 2026-10-31 · A dashboard routing policy answers `400 invalid_model`, and the message never mentions policies
- **Happened:** policy `faber-verify` (main `mistralai/mistral-small-4`, backup `openai/gpt-oss-120b`) was created in the dashboard. `POST /chat/completions` with `model: "faber-verify"` returned `400 {"detail":"Unknown or unsupported model 'faber-verify'. Send a 'provider:model' selector, an alias, or a model id from the catalog (GET /api/v1/models).","code":"invalid_model"}`.
- **Cause (confirmed 2026-11-01):** the policy had been saved as `faber-probe-fallback`, not `faber-verify`; key and policy were both in Default workspace. After renaming it, `faber-verify` resolves. An easy mistake that was slow to find because of the next point.
- **Why it matters:** the error lists selectors, aliases and catalog ids but not routing policies, and doesn't say policies are per workspace. The key can't list policies to check (`401 Invalid master key`, entry 1).
- **Suggestion:** when the name matches no selector, add "or a routing policy stored in this key's workspace (<workspace name>)". Let a key read the policy names it can resolve.
- **Repro:** `chat faber-verify`.

### 7. 2026-11-01 · CONFIRMED: a provider-narrowed spend ceiling refuses the request instead of skipping to the fallback
- **Setup (dashboard):** routing policy `faber-verify` in Default workspace, main `mistralai/mistral-small-4` (Mistral, `mistral-small-2603`), backup `openai/gpt-oss-120b` (DeepInfra). A budget `force-fallback-test` with a $0.00001 spend limit, and a spend ceiling on it capping Default workspace with **Provider instance `mistral`** (confirmed in the dashboard).
- **Docs** (routing.md, "What is billed and what the caller sees"): "A fallback is skipped when a budget narrowed to its provider has no room, and the next candidate is tried." `Otari-Fallback` is `true` "whether the first failed or was skipped". access-control.md: a scoped budget "can optionally narrow the limit to one provider".
- **Happened:** `403 budget_exceeded`. The backup was never tried. Full redacted exchange:
  ```json
  {
    "request": {
      "method": "POST", "url": "https://eu.api.otari.ai/api/v1/chat/completions",
      "headers": { "Otari-Key": "[REDACTED]", "Content-Type": "application/json" },
      "body": { "model": "faber-verify", "max_tokens": 120,
                "messages": [{ "role": "user", "content": "In one sentence, what does a small local bakery gain from having a website?" }] }
    },
    "response": {
      "status": 403,
      "headers": { "otari-request-id": "06c2ec9d-846e-42db-aee4-f82f6500c093", "otari-error-code": "budget_exceeded", "otari-budget-scope": "workspace" },
      "body": { "detail": "Workspace has $0.00001 of budget remaining, less than this request's estimated cost of $0.000076. The estimate assumes 120 output tokens; a lower output token limit on the request may let it fit", "code": "budget_exceeded" }
    }
  }
  ```
  No `Otari-Fallback`, `Otari-Model`, `Otari-Provider` or `Otari-Attempt-Count` headers: no candidate was called. Not charged.
- **Why, from the source** (`53ed2d5`, `api/routes/_pipeline.py`): before any candidate runs, the pipeline takes the up-front hold against `plan.head` (`reserve_budget(..., scope=BudgetScopeRequest(provider_instance=gate_instance))` with `gate_instance = head.instance`) and re-raises a refusal as the response. The documented skip exists only in `move_reservation_for_attempt`, which runs per attempt *after* that hold. A provider-only ceiling with no room therefore refuses the whole request when it binds the **first** candidate; only later candidates can be skipped.
- **Also:** the refusal says "Workspace has $0.00001 of budget remaining" without naming the provider the ceiling is narrowed to, so a caller can't tell a provider-only cap from a workspace-wide one.
- **Suggestion:** take the up-front hold only on ceilings that bind every candidate (or on the first candidate that has room), so a provider-only ceiling on the head skips it like any other candidate. Name the provider in a provider-narrowed refusal.
- **Repro:** create the ceiling above, then `chat faber-verify --evidence=<file>`.

### 8. 2026-11-01 · A $0 budget behaved like "no limit" (observed; the source says it should refuse)
- **Happened:** with the same ceiling (Default workspace, provider instance `mistral`) on a budget saved with a **$0** spend limit, the request was served on Mistral as if no ceiling existed: `HTTP 200`, `Otari-Request-ID: 6fc37305-8bcc-4c69-9340-2c25275ddfe5`, `Otari-Provider: mistral`, `Otari-Model: mistral-small-2603`, `Otari-Fallback: false`, `Otari-Attempt-Count: 1`, `cost_usd: "0.000026"`. Changing **only** the limit to $0.00001 made the next identical request return the 403 in entry 7.
- **Source** (`53ed2d5`) says $0 should refuse: the dashboard sends `0` (`OrganizationBudgetDialog.tsx`, `parseLimit` keeps 0 and `amount ?? null` keeps it), the API accepts it (`max_budget: ... ge=0`), `to_usd_or_none` stores it, and the hold SQL admits only `cap IS NULL OR (committed < cap AND committed + held <= cap)`, which is false for a cap of 0.
- **So either** the hosted build differs from `53ed2d5`, or the $0 was stored as "no limit" somewhere the source doesn't show. Not confirmed which.
- **Why it matters:** "$0" reads as "nothing may be spent" (a kill switch), and it silently allowed spending.
- **Suggestion:** treat 0 as a hard stop everywhere (or refuse 0 in the form with "leave blank for no limit"), and show the saved cap on the ceiling's row.

### 9. 2026-11-01 · Fallback fires on a 400, but the backup (DeepInfra `gpt-oss-120b`) times out, and the 504 says "All upstream providers timed out"
- **Docs** (routing.md, "Selection and failure are separate"): `on_failure` is tried "whatever the provider's error: an outage, a rate limit, or a request it refuses as invalid (400) all move on".
- **Trigger:** the OpenAI-standard `seed` field. any-llm 1.41.0's Mistral adapter forwards every `CompletionParams` field to `mistralai` 3.1.0's `chat.complete_async`, which has `random_seed` but no `seed` and no `**kwargs`. So the Mistral attempt fails with "unexpected keyword argument 'seed'", which Otari maps to a 400 (`_pipeline.py`, `_rejected_param`).
- **Happened, twice:** `HTTP 504 {"detail":"All upstream providers timed out"}`, `Otari-Error-Retryable: true` (`Otari-Request-ID` `1ff48ef4-82ff-4891-ab57-9dbf121f7568`, 5.27 s; `4c0dce3a-b459-4bdd-b5e3-ae1a42f5c2fb`, 8.19 s). No cost.
- **The dashboard's own trace confirms the fallback fired:** routing plan `faber-verify`: #1 `mistral` (the policy's default target) failed **400** after 102 ms, then fell back; #2 `openai/gpt-oss-120b` on **DeepInfra** failed **504** after 8.19 s. No tokens and no charge recorded on either attempt. So routing behaves as documented; the backup provider is what failed.
- **Same backup, direct:** `model: "openai/gpt-oss-120b"` (catalog id, which tries the model's offerings in turn) answered `HTTP 200` with `Otari-Provider: ovhcloud`, `Otari-Model: gpt-oss-120b`, `Otari-Fallback: true`, `Otari-Attempt-Count: 2`, `Otari-Response-Duration-Ms: 7938` (`Otari-Request-ID: a1cd3678-465b-4731-8751-6b2c765ea6e7`, `cost_usd: "0.000042"`, 0 reasoning tokens). The first offering failed again; the cheapest offering, DeepInfra, comes first in catalog order.
- **Timeouts:** configuration.md documents no per-attempt timeout near these figures: `provider_request_timeout_seconds` defaults to 600, with **connecting capped at 5 s** for OpenAI-compatible providers (DeepInfra among them). The 5.27 s attempt fits that connect cap; 8.19 s may be the cap plus a retry. Not confirmable from outside, since the hosted settings aren't visible.
- **DX note:** the 504 reads "All upstream providers timed out" although the first candidate failed with a 400, not a timeout. Something like "The last candidate timed out (1 earlier candidate was refused)" would point at the real failure without reading the trace.
- **Request** (key redacted): `POST /api/v1/chat/completions`, body `{"model":"faber-verify","max_tokens":200,"messages":[{"role":"user","content":"In one sentence, what does a small local bakery gain from having a website?"}],"seed":7}`.
- **Resolved for Faber (2026-11-01):** the backup was moved to Mistral Large 3 on Bedrock, and the same forced fallback is served there (see "Confirmed working").
- **Repro:** `chat faber-verify --max=200 --extra={"seed":7} --evidence=<file>` (with the DeepInfra backup); `chat openai/gpt-oss-120b --max=200`.

### 10. 2026-11-01 · The trace's "Where the gateway stepped in" says "a later attempt answered" when the only later attempt failed
- **Where:** dashboard → Overview → Sessions → trace for `4c0dce3a-b459-4bdd-b5e3-ae1a42f5c2fb`.
- **Happened:** the routing plan on the same trace shows #1 `mistral` failed 400 and #2 `openai/gpt-oss-120b` (DeepInfra) failed 504, and the request ended in 504 "All upstream providers timed out". The "Where the gateway stepped in" panel still says **"a later attempt answered"**.
- **Why it matters:** the panel contradicts the routing plan beside it, and tells a reader a fallback rescued a request that failed. dashboard.md says the panel shows "where the gateway stepped in"; it should only say a later attempt answered when one did.
- **Suggestion:** word the step-in from the final outcome ("fell back; the fallback also failed (504)").

### 11. 2026-11-01 · Direct search (`POST /search`) has no search tool on hosted, though in-loop search works
- **Docs** (api-reference.md, "Search"; tools.md, "Direct search"): `POST /api/v1/search` runs a configured search tool directly; "a SearXNG search tool can reuse `web_search_url`, so model-initiated and direct search can share one backend".
- **Happened:** with web search enabled for the workspace (in-loop `otari_web_search` works and costs $0.01), `POST /api/v1/search` `{"query":"Mozilla.ai official website","max_results":5,"max_tokens_per_page":120}` answers `400 {"detail":"No search tools are configured. Add one on the dashboard's Tools & Guardrails page (or POST /api/v1/search-tools), or declare one under 'search_tools' in your config file, supplied directly or through OTARI_CONFIG_YAML / OTARI_CONFIG_B64."}` (`Otari-Request-ID: 04af0a15-4f4f-4510-ae27-62dfe9fb9f08`, not charged).
- **Why it matters:** direct search is the way to get results *without* a model reading them first, which is what an app that screens untrusted text before any model sees it wants. On hosted, the only way in is a vendor search key (Tavily, Brave, Exa) on the workspace. The message also points a hosted tenant at a config file and environment variables they can't set.
- **Faber's workaround:** one small model call with `otari_web_search` (`max_uses: 1`) whose text is thrown away; only the `sources` Otari reports in `otari_tool_calls` are kept, then screened before Model A reads them.
- **Suggestion:** let direct search use the same hosted backend as the in-loop tool (priced the same), or say on the hosted docs that direct search needs a workspace search key, and word the 400 for tenants.
- **Repro:** `dsearch Mozilla.ai official website`.

### 12. 2026-11-01 · A mandated guardrail's 403 doesn't say which check fired, so a false positive can't be told apart
- **Happened:** the org's Lakera mandate (prompt defense and PII on; name, link and moderation detectors off) blocked a screening request whose latest user message was the cleaned text of an ordinary bakery shop's home page (phone numbers and emails already redacted): `403 {"detail":{"message":"Request blocked by guardrail policy.","code":"guardrail_violation","guardrails":[{"profile":"lakera-faber","explanation":null,"score":1}]}}`. The same flow passed nine other business pages and listings.
- **Why it matters:** with `explanation: null` and no detector name, a tenant can't tell a prompt-injection hit from a PII hit, or decide whether to tune the Lakera policy or their own text cleaning. guardrails.md keeps the vendor's words out of the response on purpose; the detector *category* would be enough.
- **Suggestion:** pass the triggered category (for example `prompt_attack`, `pii/phone_number`) through in `guardrails[].explanation` or a new field, without the vendor's raw message.

## Prices measured (hosted EU, 2026-10-31; not found in the docs)
- Every gateway tool call is a flat **$0.01** on top of model tokens: web search $0.010000 (total $0.010568 = 3,597 input + 47 output tokens on `mistral-small-4` + $0.01), web fetch $0.010000 (total $0.010182), code execution ≈ $0.01 (total $0.010156). tools.md explains how rates are set ("dollars per call") but the hosted price list isn't published. A tenant can only find it by spending.
- A web search also feeds ~3.6k tokens of results back as model input.
- Faber's website check, measured on 10 leads (2026-11-01): $0.0105 per lead on average (search step $0.0102, screen $0.0001, decision $0.0002); re-checking a lead whose site is known, without a search, $0.00015.
- **Suggestion:** publish the hosted tool rates, and return a per-tool line in `usage` (tools.md describes a "pricing breakdown" on the usage row, but the inline `usage` carries only the total).

## Confirmed working (and known issues retested)
- **Routing policy fallback, proven (2026-11-01).** Policy `faber-verify` in Default workspace: main `mistral-small-2603` (Mistral), backup Mistral Large 3 pinned to **Amazon Bedrock**. The OpenAI-standard `seed` field makes the Mistral attempt fail with a 400 (Mistral SDK has `random_seed`, not `seed`); Bedrock ignores the field; the policy moves on as routing.md documents. Full redacted exchange:
  ```json
  {
    "at": "2026-11-01T03:54:54.084Z",
    "request": {
      "method": "POST",
      "url": "https://eu.api.otari.ai/api/v1/chat/completions",
      "headers": {
        "Otari-Key": "[REDACTED]",
        "Content-Type": "application/json"
      },
      "body": {
        "model": "faber-verify",
        "max_tokens": 60,
        "messages": [
          {
            "role": "user",
            "content": "In one sentence, what does a small local bakery gain from having a website?"
          }
        ],
        "seed": 7
      }
    },
    "response": {
      "status": 200,
      "headers": {
        "otari-request-id": "22f7fa2d-26a3-445b-a7b9-e3909111b5f2",
        "otari-provider": "bedrock",
        "otari-model": "mistral.mistral-large-3-675b-instruct",
        "otari-fallback": "true",
        "otari-attempt-count": "2",
        "otari-response-duration-ms": "1777"
      },
      "body": {
        "id": "",
        "choices": [
          {
            "finish_reason": "stop",
            "index": 0,
            "message": {
              "content": "A small local bakery gains **increased visibility, customer convenience, and sales opportunities** by showcasing its products, sharing location/hours, and enabling online orders or pre-orders through a website.",
              "role": "assistant",
              "refusal": null
            },
            "logprobs": null
          }
        ],
        "created": 0,
        "model": "faber-verify",
        "object": "chat.completion",
        "usage": {
          "completion_tokens": 42,
          "prompt_tokens": 20,
          "total_tokens": 62,
          "cost_usd": "0.000073",
          "pricing_source": "deployment"
        }
      }
    }
  }
  ```
  The same policy without `seed` is served by the main model: `Otari-Provider: mistral`, `Otari-Model: mistral-small-2603`, `Otari-Fallback: false`, `Otari-Attempt-Count: 1`, `cost_usd: "0.000017"` (request `e374ef67-293c-4c55-bb27-530bbd404f9f`). Repro: `chat faber-verify --max=60 --extra={"seed":7} --evidence=<file>`.
- **#2705, base path:** `GET https://eu.api.otari.ai/v1/models` returns `404 {"detail":"Otari serves its API under /api/v1, not /v1. Use /api/v1/models instead."}`. The current docs (api-reference.md) document `/api/v1` correctly; the excellent error message makes the old path self-correcting.
- **#2705, models list omits callable models:** `deepseek/deepseek-v4-pro-0813` now appears in `/models` (117 models). Not reproducible on 2026-10-31.
- **#2719, code execution 402 on hosted:** fixed. `otari_code_execution` on chat completions and `code_interpreter` on `/responses` (`Otari-Code-Execution: otari`) both ran. `/responses` returned the executed code and its output.
- **`Otari-Key` header** works with the OpenAI Node SDK. The SDK's `Authorization` header is removed by setting it to `null` in `defaultHeaders`.
- **Response headers** `Otari-Provider`, `Otari-Model`, `Otari-Fallback` and `Otari-Attempt-Count`, plus inline `usage.cost_usd`, arrive as documented.
- **Automatic cross-provider fallback on a catalog id:** `model: "openai/gpt-oss-120b"` with its first offering failing was served by the next one (`Otari-Provider: ovhcloud`, `Otari-Fallback: true`, `Otari-Attempt-Count: 2`) with no policy configured (request `a1cd3678-465b-4731-8751-6b2c765ea6e7`, 2026-11-01).
- **Inline `mcp_servers`** with a public streamable-HTTP server (DeepWiki) works with a workspace key.
- **Web search and fetch** work once enabled in the dashboard, with sources reported in `otari_tool_calls`.
- **Catalog rows carry `usage_30d.spend_usd` per offering**, readable with a workspace key. It's the only spend figure a key can read (the usage API is closed to it, entry 1). Model tokens only; tool charges aren't on these rows.

## Notes from reading the docs (not bugs, possible DX feedback)
- **Code execution is invisible on Chat Completions** (tools.md, "What clients receive"): code runs and MCP calls are not reported in `otari_tool_calls`; only the final message returns. Showing the code needs `/responses` or `/messages`. Suggestion: report code runs in `otari_tool_calls` too, as search and fetch already are.
- **Guardrails are input-only** (guardrails.md): checks run before the provider is called, and policy mandates are "only input checks". Suggestion: say so in the page's first paragraph.

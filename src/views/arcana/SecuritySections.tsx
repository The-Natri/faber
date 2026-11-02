import { useState, type FormEvent } from 'react';
import { KeyRound, PlugZap, ScrollText, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { useLoad } from '../../lib/useLoad.ts';
import { cn, usd } from '../../lib/format.ts';
import { useSettings } from '../../lib/settings.ts';
import { Badge, Button, Dialog, Field, Input, Select, useToast } from '../../ui/index.ts';
import type { AiConnectionTest } from '../../../shared/ai.ts';
import { FormError, NewPasswordFields, RecoveryCodePanel, newPasswordProblem } from '../../app/auth/parts.tsx';
import type { SecretName } from '../../../shared/settings.ts';
import { SaveBar, SectionPanel, useSectionDraft } from './common.tsx';

const AUTO_LOCK = [0, 5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: m === 0 ? 'Off' : `After ${m} minutes idle` }));

export function SecuritySection() {
  return (
    <div className="flex flex-col gap-5">
      <ChangePassword />
      <RecoveryCode />
      <AutoLock />
    </div>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = newPasswordProblem(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await call('auth:changePassword', { currentPassword: current, newPassword: password });
      setCurrent('');
      setPassword('');
      setConfirm('');
      toast({ title: 'Password changed', tone: 'success' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPanel title="Change password" medallion={<ShieldCheck className="size-5" />}>
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
        <Field label="Current password" htmlFor="cp-current">
          <Input id="cp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <FormError message={error} />
        <Button type="submit" variant="primary" className="self-start" loading={busy} disabled={!current}>Change password</Button>
      </form>
    </SectionPanel>
  );
}

function RecoveryCode() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
    setCode(null);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCode((await call('auth:regenerateRecovery', { password })).recoveryCode);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPanel title="Recovery code" subtitle="Lets you reset a forgotten password. Making a new one retires the old code." medallion={<ScrollText className="size-5" />}>
      <Button className="self-start" icon={<KeyRound className="size-4" />} onClick={() => setOpen(true)}>Make a new recovery code</Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()} title="New recovery code" dismissable={!code}>
        {code ? (
          <RecoveryCodePanel code={code} onDone={close} doneLabel="Done" />
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Confirm with your password" htmlFor="rc-password">
              <Input id="rc-password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!password}>Make new code</Button>
            </div>
          </form>
        )}
      </Dialog>
    </SectionPanel>
  );
}

function AutoLock() {
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('security');
  return (
    <SectionPanel title="Auto-lock" subtitle="Locks Faber after a period without keyboard or mouse use. Ctrl+L locks at any time." medallion={<Timer className="size-5" />} footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}>
      <Field label="Lock" className="max-w-xs">
        <Select value={String(draft.autoLockMinutes)} onChange={(v) => set({ autoLockMinutes: Number(v) })} options={AUTO_LOCK} label="Auto-lock" />
      </Field>
    </SectionPanel>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────

export function IntegrationsSection() {
  const { view } = useSettings();
  const { draft, set, save, saving, dirty, reset } = useSectionDraft('integrations');
  const secrets = view!.secrets;
  return (
    <div className="flex flex-col gap-5">
      {!view!.secretStorageAvailable && (
        <p className="rounded-md border px-4 py-3 text-sm text-st-contacted" style={{ borderColor: 'var(--hue-contacted)' }}>
          Windows secure storage is not available, so keys and tokens cannot be saved on this machine.
        </p>
      )}
      <SectionPanel
        title="Otari (AI gateway)"
        subtitle="Optional. AI checks and drafts go through Mozilla.ai's Otari gateway, using open-weight models only. Without a key, Faber falls back to templates."
        medallion={<Sparkles className="size-5" />}
        footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}
      >
        <SecretField name="otariApiKey" label="Otari API key" placeholder="Paste the key from your Otari workspace" secret={secrets.otariApiKey} />
        <Field label="Gateway URL" htmlFor="int-otari-url" hint="Hosted EU region by default" className="max-w-xl">
          <Input id="int-otari-url" className="font-mono text-xs" value={draft.otariBaseUrl} onChange={(e) => set({ otariBaseUrl: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Model A · checks" htmlFor="int-model-a" hint="Otari routing policy">
            <Input id="int-model-a" className="font-mono text-xs" value={draft.modelVerify} onChange={(e) => set({ modelVerify: e.target.value })} />
          </Field>
          <Field label="Model B · pitches" htmlFor="int-model-b">
            <Input id="int-model-b" className="font-mono text-xs" value={draft.modelPitch} onChange={(e) => set({ modelPitch: e.target.value })} />
          </Field>
          <Field label="Screener" htmlFor="int-model-s" hint="Checks untrusted text first">
            <Input id="int-model-s" className="font-mono text-xs" value={draft.modelScreener} onChange={(e) => set({ modelScreener: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Website checks per batch" htmlFor="int-batch" hint="1–20; about $0.011 each">
            <Input id="int-batch" type="number" min={1} max={20} className="tabular" value={draft.websiteBatchSize}
              onChange={(e) => set({ websiteBatchSize: Number(e.target.value) })} />
          </Field>
          <Field label="Pause between leads" htmlFor="int-delay" hint="Seconds">
            <Input id="int-delay" type="number" min={0} max={60} className="tabular" value={draft.websiteDelaySeconds}
              onChange={(e) => set({ websiteDelaySeconds: Number(e.target.value) })} />
          </Field>
          <Field label="Faber's monthly AI cap (USD)" htmlFor="int-cap" hint="Faber's own limit, checked before each paid call. 0 pauses AI. Otari's ceilings are separate, in the Otari dashboard.">
            <Input id="int-cap" type="number" min={0} max={1000} step={0.5} className="tabular" value={draft.monthlyCapUsd}
              onChange={(e) => set({ monthlyCapUsd: Number(e.target.value) })} />
          </Field>
        </div>
        <OtariConnection keySaved={secrets.otariApiKey.set} />
      </SectionPanel>
      <SectionPanel title="Telegram (daily digest)" subtitle="Optional. A bot that sends your morning summary to your phone.">
        <SecretField name="telegramBotToken" label="Bot token" placeholder="123456:ABC…" secret={secrets.telegramBotToken} />
        <Field label="Chat id" htmlFor="int-chat" className="max-w-sm">
          <div className="flex gap-2">
            <Input id="int-chat" className="tabular" value={draft.telegramChatId} onChange={(e) => set({ telegramChatId: e.target.value })} />
            <Button disabled={!dirty} loading={saving} onClick={() => void save()}>Save</Button>
          </div>
        </Field>
      </SectionPanel>
    </div>
  );
}

const KEY_SOURCE = {
  settings: 'Using the key saved here.',
  dev_env: 'Dev run: using OTARI_API_KEY from the dev env file. A key saved here takes over.',
  none: 'No key yet, so AI features use templates.',
} as const;

const GUARDRAIL_LABEL = { passed: 'passed', blocked: 'blocked', not_reported: 'not reported' } as const;

// Test connection: a free model list, then one 8-token call through Model A (a fraction of a cent).
// The result names the model and provider that served it, so a fallback shows up here too.
function OtariConnection({ keySaved }: { keySaved: boolean }) {
  const status = useLoad(() => call('ai:status'), keySaved);
  const [result, setResult] = useState<AiConnectionTest | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    try {
      setResult(await call('ai:testConnection'));
    } catch (err) {
      setResult({ ok: false, message: errorText(err), modelCount: null, served: null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{status.data ? KEY_SOURCE[status.data.keySource] : ' '}</p>
        <Button icon={<PlugZap className="size-4" />} loading={busy} disabled={!status.data?.configured} onClick={() => void test()}>Test connection</Button>
      </div>
      {result && (
        <div role="status" className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <p className={cn('font-medium', result.ok ? 'text-st-won' : 'text-st-lost')}>{result.message}</p>
          {result.served && (
            <div className="flex flex-wrap gap-1.5">
              <Badge>Served by {result.served.model ?? 'unknown'}</Badge>
              <Badge>on {result.served.provider ?? 'unknown'}</Badge>
              <Badge>{result.served.fallback ? 'Fallback used' : 'No fallback'}</Badge>
              <Badge>Guardrail {GUARDRAIL_LABEL[result.served.guardrail]}</Badge>
              <Badge>{usd(result.served.costUsd)}</Badge>
              <Badge>{result.served.latencyMs} ms</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Write-only: the saved value is never sent back, only a masked hint
function SecretField({ name, label, placeholder, secret }: { name: SecretName; label: string; placeholder: string; secret: { set: boolean; masked: string } }) {
  const { setSecret } = useSettings();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const store = async (next: string | null) => {
    setBusy(true);
    try {
      await setSecret(name, next);
      setValue('');
      toast({ title: next ? `${label} saved` : `${label} removed`, tone: 'success' });
    } catch (err) {
      toast({ title: `Could not save ${label.toLowerCase()}`, description: errorText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label} htmlFor={`secret-${name}`} hint={secret.set ? `Saved: ${secret.masked}` : 'Not set'}>
      <div className="flex max-w-xl gap-2">
        <Input id={`secret-${name}`} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={secret.set ? 'Enter a new value to replace it' : placeholder} />
        <Button loading={busy} disabled={!value.trim()} onClick={() => void store(value)}>Save</Button>
        {secret.set && <Button variant="ghost" disabled={busy} onClick={() => void store(null)}>Remove</Button>}
      </div>
    </Field>
  );
}

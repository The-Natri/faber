import { useState, type FormEvent } from 'react';
import { KeyRound, ScrollText, ShieldCheck, Timer } from 'lucide-react';
import { call, errorText } from '../../lib/ipc.ts';
import { useSettings } from '../../lib/settings.ts';
import { Button, Dialog, Field, Input, Select, useToast } from '../../ui/index.ts';
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
      <SectionPanel title="Claude (AI drafts)" subtitle="Optional. Pitches fall back to your templates without a key." footer={<SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />}>
        <SecretField name="claudeApiKey" label="API key" placeholder="sk-ant-…" secret={secrets.claudeApiKey} />
        <Field label="Model" htmlFor="int-model" className="max-w-sm"><Input id="int-model" value={draft.claudeModel} onChange={(e) => set({ claudeModel: e.target.value })} /></Field>
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

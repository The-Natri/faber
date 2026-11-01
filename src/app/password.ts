import { PASSWORD_MIN_LENGTH } from '../../shared/ipc/contract.ts';

export { PASSWORD_MIN_LENGTH };

export interface Strength {
  score: 0 | 1 | 2 | 3;
  label: string;
  hint: string;
}

// A gentle hint, not a rule: the only hard requirement is the minimum length
export function passwordStrength(password: string): Strength {
  if (password.length === 0) return { score: 0, label: '', hint: `At least ${PASSWORD_MIN_LENGTH} characters` };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { score: 0, label: 'Too short', hint: `${PASSWORD_MIN_LENGTH - password.length} more character(s) needed` };
  }
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  const points = (password.length >= 14 ? 2 : password.length >= 12 ? 1 : 0) + (variety >= 3 ? 2 : variety === 2 ? 1 : 0);
  if (points >= 3) return { score: 3, label: 'Strong', hint: 'Good — a long passphrase is hard to guess' };
  if (points >= 2) return { score: 2, label: 'Fair', hint: 'Longer, or a mix of words and numbers, would be stronger' };
  return { score: 1, label: 'Weak', hint: 'Try a few unrelated words, or add numbers and symbols' };
}

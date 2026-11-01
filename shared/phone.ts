// Indian mobile numbers for WhatsApp: "+91 98765 43210", "098765-43210", "9876543210" all become
// +919876543210. Landlines and anything else return null, since wa.me needs a mobile number.
export function normalizeIndianMobile(raw: string | null | undefined): { e164: string; wa: string } | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0091')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return { e164: `+91${digits}`, wa: `91${digits}` };
}

// Opens WhatsApp with the message typed in; the user presses send. Faber never sends anything itself.
export function whatsAppLink(wa: string, text: string): string {
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

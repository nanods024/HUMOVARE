/**
 * The admin password rules, mirrored from the server so the form can show
 * progress as the operator types. The server re-checks every one of them —
 * this is guidance, not the gate.
 */
export const PASSWORD_RULES: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: 'length', label: 'At least 12 characters', test: (v) => v.length >= 12 && v.length <= 72 },
  { id: 'lower', label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'number', label: 'A number', test: (v) => /[0-9]/.test(v) },
  { id: 'symbol', label: 'A symbol, such as ! @ # $', test: (v) => /[^A-Za-z0-9]/.test(v) },
  {
    id: 'common',
    label: 'No common words or the store name',
    test: (v) => v.length > 0 && !/(password|passw0rd|qwerty|letmein|welcome|admin|123456|iloveyou|humovare)/i.test(v),
  },
];

export const passwordMeetsPolicy = (value: string) => PASSWORD_RULES.every((rule) => rule.test(value));

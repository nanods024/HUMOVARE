import { Check, Circle } from 'lucide-react';

import { PASSWORD_RULES } from '@/lib/passwordPolicy';
import { cn } from '@/utils/cn';

/** Live checklist of the admin password rules under a "new password" field. */
export function PasswordChecklist({ value, className }: { value: string; className?: string }) {
  return (
    <ul className={cn('grid gap-1 sm:grid-cols-2', className)} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn('flex items-center gap-1.5 text-xs transition-colors', ok ? 'text-success' : 'text-ink-subtle')}
          >
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Circle className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <span>{rule.label}</span>
            <span className="sr-only">{ok ? '(done)' : '(not yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default PasswordChecklist;

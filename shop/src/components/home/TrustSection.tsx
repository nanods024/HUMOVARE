import { ShieldCheck, Truck, RotateCcw, Award, Headphones } from 'lucide-react';
import { useStoreSettings, fillCopy } from '@/hooks/useStoreSettings';

const ITEMS = [
  { icon: ShieldCheck, title: 'Secure payments', copy: 'Encrypted checkout, trusted providers.' },
  { icon: RotateCcw, title: 'Easy returns', copy: '{returnDays} returns on unworn pieces.' },
  { icon: Award, title: 'Premium quality', copy: 'Heavyweight fabric, checked by hand.' },
  { icon: Truck, title: 'Fast shipping', copy: 'Dispatched within {dispatch}.' },
  { icon: Headphones, title: 'Real support', copy: 'Humans, replying within a day.' },
];

export interface TrustItem {
  title?: string;
  copy?: string;
  icon?: string;
}

/** Icons stay code-side; only the copy is admin-managed. */
export function TrustSection({ items }: { items?: TrustItem[] } = {}) {
  const store = useStoreSettings();
  const entries = (items?.length
    ? items.map((item, index) => ({
        icon: ITEMS[index]?.icon ?? ShieldCheck,
        title: item.title ?? '',
        copy: item.copy ?? '',
      }))
    : ITEMS
  ).map((item) => ({ ...item, copy: fillCopy(item.copy, store) }));

  return (
    <section aria-label="Why shop with HUMOVARE" className="border-y border-line bg-surface">
      <ul className="container-page grid grid-cols-2 gap-x-6 gap-y-8 py-12 md:grid-cols-5 md:py-14">
        {entries.map((item) => (
          <li key={item.title} className="flex flex-col items-start gap-2">
            <item.icon className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="text-[0.6875rem] font-bold uppercase tracking-wider">{item.title}</h3>
            <p className="text-xs leading-relaxed text-ink-muted">{item.copy}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TrustSection;

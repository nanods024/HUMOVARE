import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface QuantityStepperProps {
  value: number;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  label?: string;
  className?: string;
}

export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  label = 'Quantity',
  className,
}: QuantityStepperProps) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider">{label}</span>

      <div className="inline-flex items-center border border-line overflow-hidden rounded-xl" role="group" aria-label={label}>
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label="Decrease quantity"
          className="grid h-10 w-10 place-items-center transition-colors hover:bg-surface disabled:opacity-35"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label="Increase quantity"
          className="grid h-10 w-10 place-items-center transition-colors hover:bg-surface disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default QuantityStepper;

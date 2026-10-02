'use client';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** Labelled range input with a live value readout. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  hint,
  disabled,
  onChange,
}: SliderProps) {
  return (
    <div>
      <label className="field-label" htmlFor={`slider-${label}`}>
        <span>{label}</span>
        <span className="font-mono text-[11px] normal-case tracking-normal text-accent-soft">
          {value}
          {suffix}
        </span>
      </label>
      <input
        id={`slider-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  hint?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** Labelled `<select>` with an optional helper line. */
export function Select<T extends string>({
  label,
  value,
  options,
  hint,
  disabled,
  onChange,
}: SelectProps<T>) {
  const id = `select-${label}`;
  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Accessible on/off switch. */
export function Toggle({ label, checked, disabled, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-ink-600 bg-ink-800 px-3 py-2
        text-sm transition hover:border-ink-500 disabled:opacity-45"
    >
      <span className="text-slate-200">{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-accent' : 'bg-ink-600'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? 'left-[1.15rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

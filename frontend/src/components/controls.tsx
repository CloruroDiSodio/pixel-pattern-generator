'use client';

/**
 * `label` is used verbatim in the visible text but must not leak into an id:
 * `"Grid width"` would produce `id="slider-Grid width"`. HTML ids may not
 * contain spaces, and assistive technology matching `htmlFor` against `id` is
 * only reliable when the value is a clean token.
 */
function toFieldId(prefix: string, label: string): string {
  return `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

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
  const id = toFieldId('slider', label);
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        <span>{label}</span>
        <span className="font-mono text-[11px] normal-case tracking-normal text-accent-soft">
          {value}
          {suffix}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        aria-valuetext={`${value}${suffix}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-[11px] text-slate-400">
          {hint}
        </p>
      ) : null}
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
  const id = toFieldId('select', label);
  const hintId = hint ? `${id}-hint` : undefined;

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
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="mt-1 text-[11px] text-slate-400">
          {hint}
        </p>
      ) : null}
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

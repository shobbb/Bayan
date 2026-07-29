import { useEffect, useState } from 'react';
import type { ConfigValue } from '@/config/overrides';
import type { ConfigField } from './configFields';

export interface ConfigFieldRowProps {
  field: ConfigField;
  /** Value currently in force — the override if set, otherwise the default. */
  value: ConfigValue;
  /** Compiled-in default, shown alongside so an edit is always reversible by eye. */
  defaultValue: ConfigValue;
  overridden: boolean;
  onChange: (value: ConfigValue) => void;
  onReset: () => void;
}

function format(value: ConfigValue): string {
  return typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value);
}

/**
 * One editable config value (§13: current setting, its default alongside, and a
 * per-value reset).
 *
 * Numbers and text are edited through a local draft rather than written on
 * every keystroke: committing directly would renormalise the field mid-typing,
 * so clearing it to retype would snap it back to the last valid number and
 * deleting a leading digit would be undone as fast as it was done. The draft is
 * committed on blur and on Enter.
 */
export function ConfigFieldRow({
  field,
  value,
  defaultValue,
  overridden,
  onChange,
  onReset,
}: ConfigFieldRowProps) {
  const [draft, setDraft] = useState(String(value));

  // Follow the stored value when it changes from outside — a reset, or
  // "restore defaults" — without fighting the user mid-edit.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    if (field.spec.kind === 'number') {
      const parsed = Number(draft);
      if (!Number.isFinite(parsed)) {
        setDraft(String(value));
        return;
      }
      // Clamp rather than reject: a value outside the offered range is a
      // mistake worth correcting, not worth discarding what was typed.
      const clamped = Math.min(field.spec.max, Math.max(field.spec.min, parsed));
      setDraft(String(clamped));
      if (clamped !== value) onChange(clamped);
      return;
    }

    const trimmed = draft.trim();
    if (trimmed === '') {
      setDraft(String(value));
      return;
    }
    if (trimmed !== value) onChange(trimmed);
  }

  return (
    <div className="config-field">
      <div className="config-field__head">
        <label className="config-field__label" htmlFor={field.id}>
          {field.label}
        </label>
        {overridden && (
          <button type="button" className="config-field__reset" onClick={onReset}>
            Reset
          </button>
        )}
      </div>

      {field.spec.kind === 'boolean' ? (
        <label className="config-field__toggle">
          <input
            id={field.id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{value === true ? 'On' : 'Off'}</span>
        </label>
      ) : (
        <input
          id={field.id}
          className="config-field__input"
          type={field.spec.kind === 'number' ? 'number' : 'text'}
          inputMode={field.spec.kind === 'number' ? 'decimal' : undefined}
          min={field.spec.kind === 'number' ? field.spec.min : undefined}
          max={field.spec.kind === 'number' ? field.spec.max : undefined}
          step={field.spec.kind === 'number' ? field.spec.step : undefined}
          placeholder={field.spec.kind === 'text' ? field.spec.placeholder : undefined}
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      )}

      <p className="config-field__help">{field.help}</p>
      <p className="config-field__default">
        Default {format(defaultValue)}
        {overridden ? ' · changed' : ''}
      </p>
    </div>
  );
}

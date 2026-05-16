import { TIME_ZONE_OPTIONS } from '../lib/time-zone.ts';

export function TimeZonePicker(props: {
  label: string;
  value: string;
  onChange: (timeZone: string) => void;
}) {
  return (
    <label className="timezone-picker">
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
        {TIME_ZONE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} · {option.region}
          </option>
        ))}
      </select>
    </label>
  );
}

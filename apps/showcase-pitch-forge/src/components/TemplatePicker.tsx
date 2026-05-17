import { BUILTIN_TEMPLATES, type PitchTemplate, type PitchType } from '../lib/templates.ts';

export interface TemplatePickerProps {
  selected: PitchType;
  onSelect: (type: PitchType) => void;
}

export function TemplatePicker({ selected, onSelect }: TemplatePickerProps) {
  return (
    <ul className="template-grid">
      {BUILTIN_TEMPLATES.map((t) => (
        <TemplateCard
          key={t.type}
          template={t}
          active={t.type === selected}
          onSelect={() => onSelect(t.type)}
        />
      ))}
    </ul>
  );
}

function TemplateCard({
  template,
  active,
  onSelect,
}: {
  template: PitchTemplate;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li className={`template-card ${active ? 'active' : ''}`}>
      <button type="button" className="template-button" onClick={onSelect}>
        <h3 className="template-name">{template.name}</h3>
        <p className="template-desc">{template.description}</p>
        <p className="template-sections">
          {template.sections.map((s) => s.title).join(' · ')}
        </p>
      </button>
    </li>
  );
}

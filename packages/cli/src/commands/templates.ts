/**
 * `shippie templates` — list Shippie's blessed starter patterns.
 */
import { getTemplate, listTemplates } from '@shippie/core';

export function templatesCommand(id: string | undefined, opts: { json?: boolean }): void {
  const templates = id ? [getTemplate(id)].filter(isPresent) : listTemplates();

  if (opts.json) {
    console.log(JSON.stringify({ templates }, null, 2));
    return;
  }

  if (id && templates.length === 0) {
    console.error(`Unknown template: ${id}`);
    process.exit(1);
  }

  console.log('');
  console.log(id ? `Template: ${id}` : 'Shippie templates');
  console.log('-----------------');
  for (const template of templates) {
    console.log(`${template.id} - ${template.name}`);
    console.log(`  ${template.description}`);
    console.log(`  proves: ${template.proves.capability}`);
    const intents = [
      template.intents?.provides?.length ? `provides ${template.intents.provides.join(', ')}` : null,
      template.intents?.consumes?.length ? `consumes ${template.intents.consumes.join(', ')}` : null,
    ].filter(Boolean);
    if (intents.length > 0) console.log(`  intents: ${intents.join(' - ')}`);
  }
  console.log('');
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

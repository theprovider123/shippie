import { showcaseCatalog, type AppTemplate } from '@shippie/templates';

export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  shippieCategory: string;
  themeColor: string;
  proves: {
    capability: string;
    assertion: string;
  };
  intents?: {
    provides?: readonly string[];
    consumes?: readonly string[];
  };
}

export function listTemplates(): TemplateListItem[] {
  return showcaseCatalog.map(templateToListItem);
}

export function getTemplate(id: string): TemplateListItem | null {
  return listTemplates().find((template) => template.id === id) ?? null;
}

function templateToListItem(template: AppTemplate): TemplateListItem {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    shippieCategory: template.shippieCategory,
    themeColor: template.themeColor,
    proves: {
      capability: template.proves.capability,
      assertion: template.proves.assertion,
    },
    ...(template.intents ? { intents: template.intents } : {}),
  };
}

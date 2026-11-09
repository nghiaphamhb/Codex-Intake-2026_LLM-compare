export interface Model {
  id: string;
  name: string;
  provider: string;
}

export const configuredModels: readonly Model[] = [];

export function validateModels(models: readonly Model[]): void {
  if (!Array.isArray(models)) {
    throw new Error('Invalid models configuration: models must be an array');
  }

  const seenIds = new Set<string>();

  for (const model of models) {
    if (typeof model !== 'object' || model === null) {
      throw new Error('Invalid models configuration: invalid model item');
    }

    const fields: (keyof Model)[] = ['id', 'name', 'provider'];
    for (const field of fields) {
      const val = model[field];
      if (typeof val !== 'string' || val.length === 0) {
        throw new Error(`Invalid models configuration: invalid or empty field '${field}'`);
      }
      if (val.trim() !== val) {
        throw new Error(`Invalid models configuration: field '${field}' has leading or trailing whitespace`);
      }
    }

    if (seenIds.has(model.id)) {
      throw new Error('Invalid models configuration: duplicate model id');
    }
    seenIds.add(model.id);
  }
}


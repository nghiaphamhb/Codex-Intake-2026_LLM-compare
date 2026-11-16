export interface ModelPricing {
  input: number;
  output: number;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  pricing?: ModelPricing;
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

    const fields: ('id' | 'name' | 'provider')[] = ['id', 'name', 'provider'];
    for (const field of fields) {
      const val = model[field];
      if (typeof val !== 'string' || val.length === 0) {
        throw new Error(`Invalid models configuration: invalid or empty field '${field}'`);
      }
      if (val.trim() !== val) {
        throw new Error(
          `Invalid models configuration: field '${field}' has leading or trailing whitespace`,
        );
      }
    }

    if (
      model.pricing !== undefined &&
      (model.pricing === null ||
        Array.isArray(model.pricing) ||
        typeof model.pricing !== 'object' ||
        !Number.isFinite(model.pricing.input) ||
        model.pricing.input < 0 ||
        !Number.isFinite(model.pricing.output) ||
        model.pricing.output < 0)
    ) {
      throw new Error('Invalid models configuration: invalid pricing');
    }
    if (seenIds.has(model.id)) {
      throw new Error('Invalid models configuration: duplicate model id');
    }
    seenIds.add(model.id);
  }
}

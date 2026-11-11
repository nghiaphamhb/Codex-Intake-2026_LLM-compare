import { desktopModels } from './desktopFixtures';
import type { CompareModel, ResultAnswer } from './types';

export const mockModelCatalog: readonly CompareModel[] = [
  ...desktopModels,
  {
    id: 'demo-alpha',
    name: 'Демо Альфа',
    provider: 'Демо',
  },
  {
    id: 'demo-beta',
    name: 'Демо Бета',
    provider: 'Демо',
  },
  {
    id: 'demo-gamma',
    name: 'Демо Гамма',
    provider: 'Демо',
  },
];

export function createMockAnswer(model: CompareModel): Extract<ResultAnswer, { state: 'success' }> {
  return {
    state: 'success',
    markdown: `Демонстрационный ответ модели **${model.name}**.`,
    durationLabel: '0,0 с',
    costLabel: '$0,0000',
  };
}

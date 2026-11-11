import { describe, expect, it } from 'vitest';
import { desktopModels } from './desktopFixtures';
import { createMockAnswer, mockModelCatalog } from './mockComparison';

describe('mockComparison', () => {
  describe('mockModelCatalog', () => {
    it('contains six models, starting with the three desktop models followed by three demo models', () => {
      expect(mockModelCatalog).toHaveLength(6);
      expect(mockModelCatalog.slice(0, 3)).toEqual(desktopModels);
      expect(mockModelCatalog.slice(3)).toEqual([
        { id: 'demo-alpha', name: 'Демо Альфа', provider: 'Демо' },
        { id: 'demo-beta', name: 'Демо Бета', provider: 'Демо' },
        { id: 'demo-gamma', name: 'Демо Гамма', provider: 'Демо' },
      ]);
    });

    it('has unique model IDs across the catalog', () => {
      const ids = mockModelCatalog.map((m) => m.id);
      expect(new Set(ids).size).toBe(6);
    });
  });

  describe('createMockAnswer', () => {
    it('creates distinct answer content identifying the target model', () => {
      const answerAlpha = createMockAnswer(mockModelCatalog[3]);
      const answerBeta = createMockAnswer(mockModelCatalog[4]);

      expect(answerAlpha.state).toBe('success');
      expect(answerBeta.state).toBe('success');
      expect(answerAlpha.markdown).toContain('Демо Альфа');
      expect(answerBeta.markdown).toContain('Демо Бета');
      expect(answerAlpha.markdown).not.toEqual(answerBeta.markdown);
    });

    it('returns a new independent object reference on each invocation', () => {
      const model = mockModelCatalog[0];
      const answer1 = createMockAnswer(model);
      const answer2 = createMockAnswer(model);

      expect(answer1).toEqual(answer2);
      expect(answer1).not.toBe(answer2);
    });

    it('sets standard mock metadata labels', () => {
      const answer = createMockAnswer(mockModelCatalog[0]);

      expect(answer.durationLabel).toBe('0,0 с');
      expect(answer.costLabel).toBe('$0,0000');
    });
  });
});

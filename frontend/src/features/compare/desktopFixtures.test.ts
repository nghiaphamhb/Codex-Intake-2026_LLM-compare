import { describe, it, expect } from 'vitest';
import { desktopModels, desktopTurns } from './desktopFixtures';

describe('desktopFixtures', () => {
  describe('desktopModels', () => {
    it('contains exactly 3 models in the specified order with unique IDs', () => {
      expect(desktopModels).toHaveLength(3);

      expect(desktopModels[0]).toEqual({
        id: 'claude-demo',
        name: 'Claude Haiku 5.5',
        provider: 'Anthropic',
      });

      expect(desktopModels[1]).toEqual({
        id: 'yandex-demo',
        name: 'YandexGPT 5 Lite',
        provider: 'Яндекс',
      });

      expect(desktopModels[2]).toEqual({
        id: 'giga-demo',
        name: 'GigaChat 2',
        provider: 'Сбер',
      });

      const ids = desktopModels.map((m) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('desktopTurns', () => {
    it('contains exactly 2 turns with unique IDs and expected questions', () => {
      expect(desktopTurns).toHaveLength(2);

      const [turn1, turn2] = desktopTurns;
      expect(turn1.id).toBe('turn-1');
      expect(turn2.id).toBe('turn-2');

      expect(turn1.question).toBe(
        'Что ты знаешь о редакторе Editor.js? Кто его разработал и чем он отличается от аналогов?'
      );
      expect(turn2.question).toBe(
        'Покажи минимальный пример, как подключить Editor.js на страницу'
      );
    });

    it('turn-1 has correct answers and states for all 3 models', () => {
      const turn1 = desktopTurns[0];

      // Claude
      const claude = turn1.answers['claude-demo'];
      expect(claude).toBeDefined();
      expect(claude?.state).toBe('success');
      if (claude?.state === 'success') {
        expect(claude.durationLabel).toBe('2,1 с');
        expect(claude.costLabel).toBe('$0,0021');
        expect(claude.thought).toBeDefined();
        expect(claude.thought?.durationSeconds).toBe(4);
        expect(claude.thought?.text).toBeTruthy();
        expect(claude.markdown).toContain('**Editor.js**');
        expect(claude.markdown).toContain('**CodeX**');
        expect(claude.markdown).toContain('### Чем отличается от аналогов');
        expect(claude.markdown).toContain('| Редактор | Формат данных |');
        expect(claude.markdown).toContain('| Editor.js | JSON-блоки |');
        expect(claude.markdown).toContain('| TinyMCE | HTML |');
        expect(claude.markdown).toContain('| Quill | Delta (JSON) |');
        expect(claude.markdown).toContain('Каждый тип блока — отдельный плагин');
      }

      // Yandex
      const yandex = turn1.answers['yandex-demo'];
      expect(yandex).toBeDefined();
      expect(yandex?.state).toBe('success');
      if (yandex?.state === 'success') {
        expect(yandex.durationLabel).toBe('1,4 с');
        expect(yandex.costLabel).toBe('$0,0009');
        expect(yandex.markdown).toContain('Editor.js — бесплатный веб-редактор от команды CodeX');
        expect(yandex.markdown).toContain('### Пример данных');
        expect(yandex.markdown).toContain('"blocks": [');
        expect(yandex.markdown).toContain('"type": "header"');
        expect(yandex.markdown).toContain('"text": "Привет"');
        expect(yandex.markdown).toContain('@editorjs/editorjs');
      }

      // GigaChat (error state)
      const giga = turn1.answers['giga-demo'];
      expect(giga).toBeDefined();
      expect(giga?.state).toBe('error');
      if (giga?.state === 'error') {
        expect(giga.message).toBe('Модель не ответила за 60 секунд');
        expect(giga.description).toBe(
          'Остальные ответы сохранены. Можно повторить запрос только к этой модели.'
        );
        // Error state should not have success metadata
        expect((giga as Record<string, unknown>).durationLabel).toBeUndefined();
        expect((giga as Record<string, unknown>).costLabel).toBeUndefined();
      }
    });

    it('turn-2 has correct answers and metadata for all 3 models', () => {
      const turn2 = desktopTurns[1];

      // Claude
      const claude = turn2.answers['claude-demo'];
      expect(claude).toBeDefined();
      expect(claude?.state).toBe('success');
      if (claude?.state === 'success') {
        expect(claude.durationLabel).toBe('1,8 с');
        expect(claude.costLabel).toBe('$0,0016');
        expect(claude.markdown).toContain('Установите сам редактор и плагин заголовков');
        expect(claude.markdown).toContain("import EditorJS from '@editorjs/editorjs';");
        expect(claude.markdown).toContain("import Header from '@editorjs/header';");
        expect(claude.markdown).toContain('editor.save()');
      }

      // Yandex
      const yandex = turn2.answers['yandex-demo'];
      expect(yandex).toBeDefined();
      expect(yandex?.state).toBe('success');
      if (yandex?.state === 'success') {
        expect(yandex.durationLabel).toBe('1,1 с');
        expect(yandex.costLabel).toBe('$0,0006');
        expect(yandex.markdown).toContain('Достаточно двух шагов:');
        expect(yandex.markdown).toContain('@editorjs/editorjs');
        expect(yandex.markdown).toContain("const editor = new EditorJS('editor');");
      }

      // GigaChat
      const giga = turn2.answers['giga-demo'];
      expect(giga).toBeDefined();
      expect(giga?.state).toBe('success');
      if (giga?.state === 'success') {
        expect(giga.durationLabel).toBe('3,4 с');
        expect(giga.costLabel).toBe('$0,0011');
        expect(giga.markdown).toContain("new EditorJS({ holder: 'editor' })");
        expect(giga.markdown).toContain('Без плагинов будет доступен только блок с текстом');
      }
    });
  });
});


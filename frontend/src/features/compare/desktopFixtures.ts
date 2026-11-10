import type { CompareModel, CompareTurn } from './types';

export const desktopModels: readonly CompareModel[] = [
  {
    id: 'claude-demo',
    name: 'Claude Haiku 5.5',
    provider: 'Anthropic',
  },
  {
    id: 'yandex-demo',
    name: 'YandexGPT 5 Lite',
    provider: 'Яндекс',
  },
  {
    id: 'giga-demo',
    name: 'GigaChat 2',
    provider: 'Сбер',
  },
] as const;

export const desktopTurns: readonly CompareTurn[] = [
  {
    id: 'turn-1',
    question:
      'Что ты знаешь о редакторе Editor.js? Кто его разработал и чем он отличается от аналогов?',
    answers: {
      'claude-demo': {
        state: 'success',
        durationLabel: '2,1 с',
        costLabel: '$0,0021',
        thought: {
          text: 'Пользователь спрашивает об Editor.js, его разработчиках и отличиях от аналогов. Кратко представлю редактор и команду CodeX, сравню формат сохранения HTML и JSON, приведу сравнительную таблицу и поясню компонентную плагинную архитектуру.',
          durationSeconds: 4,
        },
        markdown: `**Editor.js** — блочный редактор с открытым исходным кодом. Его разрабатывает команда **CodeX**.

### Чем отличается от аналогов

Классические редакторы хранят результат как HTML. Editor.js сохраняет каждый блок отдельным объектом в \`JSON\`.

| Редактор | Формат данных |
|---|---|
| Editor.js | JSON-блоки |
| TinyMCE | HTML |
| Quill | Delta (JSON) |

Каждый тип блока — отдельный плагин: заголовок, список, изображение, код.`,
      },
      'yandex-demo': {
        state: 'success',
        durationLabel: '1,4 с',
        costLabel: '$0,0009',
        markdown: `Editor.js — бесплатный веб-редактор от команды CodeX. Контент в нём состоит из блоков, а на выходе получается чистый JSON, который удобно хранить и выводить где угодно.

### Пример данных

\`\`\`json
{
  "blocks": [{
    "type": "header",
    "data": { "text": "Привет", "level": 2 }
  }]
}
\`\`\`

- Ставится npm-пакетом \`@editorjs/editorjs\`
- Расширяется плагинами для новых типов блоков`,
      },
      'giga-demo': {
        state: 'error',
        message: 'Модель не ответила за 60 секунд',
        description:
          'Остальные ответы сохранены. Можно повторить запрос только к этой модели.',
      },
    },
  },
  {
    id: 'turn-2',
    question: 'Покажи минимальный пример, как подключить Editor.js на страницу',
    answers: {
      'claude-demo': {
        state: 'success',
        durationLabel: '1,8 с',
        costLabel: '$0,0016',
        markdown: `Установите сам редактор и плагин заголовков, затем создайте экземпляр:

\`\`\`js
import EditorJS from '@editorjs/editorjs';
import Header from '@editorjs/header';

const editor = new EditorJS({
  holder: 'editor',
  tools: { header: Header }
});
\`\`\`

Данные забирайте через \`editor.save()\` — метод вернёт JSON с блоками.`,
      },
      'yandex-demo': {
        state: 'success',
        durationLabel: '1,1 с',
        costLabel: '$0,0006',
        markdown: `Достаточно двух шагов:

1. Установите пакет \`@editorjs/editorjs\`.
2. Создайте редактор в элементе с id \`editor\`:

\`\`\`js
const editor = new EditorJS('editor');
\`\`\``,
      },
      'giga-demo': {
        state: 'success',
        durationLabel: '3,4 с',
        costLabel: '$0,0011',
        markdown: `Подключите редактор через npm и создайте экземпляр, указав id контейнера на странице: \`new EditorJS({ holder: 'editor' })\`.

Без плагинов будет доступен только блок с текстом. Заголовки, списки и картинки подключаются отдельными пакетами.`,
      },
    },
  },
] as const;

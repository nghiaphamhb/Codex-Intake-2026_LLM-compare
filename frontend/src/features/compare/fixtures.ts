export const sampleShortQuestion =
  'Как реализовать алгоритм быстрой сортировки (Quicksort) на TypeScript?';

export const sampleLongQuestion =
  'Объясните подробно различия между синхронными и асинхронными вызовами в Node.js, включая работу Event Loop, микротаски, макротаски, а также приведите примеры использования worker_threads для CPU-bound задач при высокой нагрузке на сервер.';

export const sampleThoughtText =
  'Анализирую входящий запрос пользователя...\n1. Определяю язык программирования: TypeScript.\n2. Выбираю понятную и строго типизированную реализацию Quicksort.\n3. Формирую сравнительную таблицу вычислительной сложности по времени и памяти.';

export const sampleMarkdownAnswer = `Алгоритм **быстрой сортировки (Quicksort)** — это один из самых эффективных алгоритмов сортировки, использующий парадигму «разделяй и властвуй».

### Сравнительная таблица сложности

| Случай | Сложность по времени | Затраты памяти | Примечание |
|:---|:---|:---|:---|
| Лучший | $O(n \\log n)$ | $O(\\log n)$ | Опорный элемент делит массив пополам |
| Средний | $O(n \\log n)$ | $O(\\log n)$ | Типичное распределение на случайных данных |
| Худший | $O(n^2)$ | $O(n)$ | Неудачный выбор крайнего элемента |

### Пример реализации на TypeScript

\`\`\`typescript
export function quickSort(arr: number[]): number[] {
  if (arr.length <= 1) {
    return arr;
  }

  const pivot = arr[arr.length - 1];
  const left: number[] = [];
  const right: number[] = [];

  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] < pivot) {
      left.push(arr[i]);
    } else {
      right.push(arr[i]);
    }
  }

  return [...quickSort(left), pivot, ...quickSort(right)];
}
\`\`\`

### Пример конфигурации JSON

\`\`\`json
{
  "algorithm": "quicksort",
  "inPlace": false,
  "stable": false,
  "complexity": {
    "average": "O(n log n)",
    "worst": "O(n^2)"
  }
}
\`\`\`

- Рекурсивный подход нагляден и прост для понимания.
- Для больших объёмов данных в production рекомендуется in-place вариант.
`;

export const sampleModels = [
  { name: 'GPT-4o mini', provider: 'OpenAI' },
  { name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  {
    name: 'Очень длинное название модели с большим количеством параметров для проверки обрезки многоточием (Ellipsis)',
    provider: 'Кастомный провайдер с длинным названием компании и региона',
  },
];


import { useState } from 'react';
import styles from './App.module.css';

import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { TextInput } from '../components/ui/TextInput';

import { ModelHeader } from '../features/compare/components/ModelHeader';
import { QuestionBubble } from '../features/compare/components/QuestionBubble';
import { CodeBlock } from '../features/compare/components/CodeBlock';
import { AnswerContent } from '../features/compare/components/AnswerContent';
import { ThoughtStatus } from '../features/compare/components/ThoughtStatus';
import { AnswerStatus } from '../features/compare/components/AnswerStatus';
import { AnswerError } from '../features/compare/components/AnswerError';
import { PromptForm } from '../features/compare/components/PromptForm';

import {
  sampleShortQuestion,
  sampleLongQuestion,
  sampleThoughtText,
  sampleMarkdownAnswer,
  sampleModels,
} from '../features/compare/fixtures';

export function App() {
  // Demo states for interactive feedback
  const [uiFeedback, setUiFeedback] = useState<string>('Готов к взаимодействию');
  const [textInputValue, setTextInputValue] = useState<string>('');
  const [promptValue, setPromptValue] = useState<string>(sampleShortQuestion);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [lastSentPrompt, setLastSentPrompt] = useState<string>('');

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <img src="/assets/icons/logo.svg" alt="" />
        <h1 className={styles.title}>LLM Compare — Витрина компонентов (FE003)</h1>
      </header>
      <p className={styles.description}>
        Интерактивная демонстрация компонентов интерфейса · Inter · JetBrains Mono
      </p>

      {/* 1. Основа интерфейса (Шаг 2) */}
      <section className={styles.panel} aria-labelledby="foundation-heading">
        <div className={styles.sectionHeader}>
          <h2 id="foundation-heading" className={styles.sectionTitle}>
            1. Основа интерфейса (Цвета, токены и иконки)
          </h2>
          <span className={styles.sectionSubtitle}>Токены дизайна из Figma tUMuB5lsAJ9gBPuQ6bJIQB</span>
        </div>

        <h3 className={styles.heading}>Цвета и поверхности</h3>
        <div className={styles.swatches}>
          {(['primary', 'secondary', 'third', 'accent'] as const).map((name) => (
            <div key={name} className={styles.swatch}>
              <div className={`${styles.sample} ${styles[name]}`} />
              <span>{name}</span>
            </div>
          ))}
        </div>

        <h3 className={styles.heading}>Векторные иконки Figma</h3>
        <div className={styles.icons} aria-label="Иконки">
          {[
            'plus',
            'close',
            'link',
            'copy',
            'search',
            'chevron-down',
            'clock',
            'alert',
            'retry',
            'send',
            'stop',
          ].map((name) => (
            <img key={name} src={`/assets/icons/${name}.svg`} alt={name} />
          ))}
        </div>

        <p>Типографика: Текст ответа · 14px / 22px</p>
        <pre className={styles.code}>
          <code>const compare = ['Claude', 'YandexGPT', 'GigaChat'];</code>
        </pre>
      </section>

      {/* 2. TASK-002: Базовые элементы управления */}
      <section className={styles.panel} aria-labelledby="ui-controls-heading">
        <div className={styles.sectionHeader}>
          <h2 id="ui-controls-heading" className={styles.sectionTitle}>
            2. Базовые элементы управления (TASK-002)
          </h2>
          <span className={styles.sectionSubtitle}>
            Button (primary/secondary), IconButton и доступный TextInput
          </span>
        </div>

        <div className={styles.feedbackBanner}>Статус: {uiFeedback}</div>

        <h3 className={styles.heading}>Кнопки (Button)</h3>
        <div className={styles.componentRow}>
          <Button variant="primary" onClick={() => setUiFeedback('Нажата Primary кнопка')}>
            Primary Button
          </Button>
          <Button variant="secondary" onClick={() => setUiFeedback('Нажата Secondary кнопка')}>
            Secondary Button
          </Button>
          <Button disabled onClick={() => setUiFeedback('Не должно сработать')}>
            Disabled Button
          </Button>
        </div>

        <h3 className={styles.heading}>Кнопки с иконками (IconButton)</h3>
        <div className={styles.componentRow}>
          <IconButton
            label="Добавить модель"
            iconSrc="/assets/icons/plus.svg"
            onClick={() => setUiFeedback('Нажата кнопка: Добавить модель')}
          />
          <IconButton
            label="Скопировать"
            iconSrc="/assets/icons/copy.svg"
            onClick={() => setUiFeedback('Нажата кнопка: Скопировать')}
          />
          <IconButton
            label="Поиск"
            iconSrc="/assets/icons/search.svg"
            onClick={() => setUiFeedback('Нажата кнопка: Поиск')}
          />
          <IconButton
            disabled
            label="Отключенная кнопка"
            iconSrc="/assets/icons/close.svg"
            onClick={() => setUiFeedback('Не должно сработать')}
          />
        </div>

        <h3 className={styles.heading}>Текстовое поле (TextInput)</h3>
        <div className={styles.narrowBox}>
          <TextInput
            label="Поиск или ввод модели"
            placeholder="Введите название модели..."
            value={textInputValue}
            onChange={(e) => {
              setTextInputValue(e.target.value);
              setUiFeedback(`Ввод в поле: "${e.target.value}"`);
            }}
          />
        </div>
      </section>

      {/* 3. TASK-003: ModelHeader и QuestionBubble */}
      <section className={styles.panel} aria-labelledby="model-bubble-heading">
        <div className={styles.sectionHeader}>
          <h2 id="model-bubble-heading" className={styles.sectionTitle}>
            3. Заголовки моделей и Вопрос (TASK-003)
          </h2>
          <span className={styles.sectionSubtitle}>
            ModelHeader (с кнопкой удаления и обрезкой текста) и QuestionBubble
          </span>
        </div>

        <h3 className={styles.heading}>Заголовки моделей (ModelHeader)</h3>
        <div className={styles.componentColumn}>
          <div className={styles.narrowBox}>
            <ModelHeader
              name={sampleModels[0].name}
              provider={sampleModels[0].provider}
              onRemove={() => setUiFeedback(`Удалена модель: ${sampleModels[0].name}`)}
            />
          </div>
          <div className={styles.narrowBox}>
            <ModelHeader
              name={sampleModels[1].name}
              provider={sampleModels[1].provider}
            />
          </div>
          <div className={styles.narrowBox}>
            <ModelHeader
              name={sampleModels[2].name}
              provider={sampleModels[2].provider}
              onRemove={() => setUiFeedback('Удалена модель с длинным названием')}
            />
          </div>
        </div>

        <h3 className={styles.heading}>Вопрос пользователя (QuestionBubble)</h3>
        <div className={styles.componentColumn}>
          <QuestionBubble text={sampleShortQuestion} />
          <QuestionBubble text={sampleLongQuestion} />
        </div>
      </section>

      {/* 4. TASK-004: CodeBlock và AnswerContent */}
      <section className={styles.panel} aria-labelledby="content-code-heading">
        <div className={styles.sectionHeader}>
          <h2 id="content-code-heading" className={styles.sectionTitle}>
            4. Форматированный ответ и Блоки кода (TASK-004)
          </h2>
          <span className={styles.sectionSubtitle}>
            Markdown-рендер (Gfm, таблицы, ссылки) и CodeBlock с подсветкой и копированием
          </span>
        </div>

        <h3 className={styles.heading}>Автономный CodeBlock (TypeScript & JSON)</h3>
        <CodeBlock
          language="typescript"
          code={`interface ModelBenchmark {\n  id: string;\n  tokensPerSecond: number;\n  cost: number;\n}`}
        />

        <h3 className={styles.heading}>Полный ответ модели (AnswerContent)</h3>
        <AnswerContent markdown={sampleMarkdownAnswer} />
      </section>

      {/* 5. TASK-005: ThoughtStatus, AnswerStatus, AnswerError */}
      <section className={styles.panel} aria-labelledby="status-error-heading">
        <div className={styles.sectionHeader}>
          <h2 id="status-error-heading" className={styles.sectionTitle}>
            5. Статусы мышления, прогресса и ошибок (TASK-005)
          </h2>
          <span className={styles.sectionSubtitle}>
            ThoughtStatus (раскрывающийся лог), AnswerStatus (скелетон) и AnswerError (повтор)
          </span>
        </div>

        <h3 className={styles.heading}>Статус рассуждения модели (ThoughtStatus)</h3>
        <div className={styles.componentColumn}>
          <ThoughtStatus state="thinking" />
          <ThoughtStatus state="thinking" text={sampleThoughtText} />
          <ThoughtStatus state="done" durationSeconds={4} text={sampleThoughtText} />
          <ThoughtStatus state="done" />
        </div>

        <h3 className={styles.heading}>Индикаторы генерации (AnswerStatus)</h3>
        <div className={styles.componentColumn}>
          <AnswerStatus state="waiting" />
          <AnswerStatus state="generating" />
        </div>

        <h3 className={styles.heading}>Блок ошибки (AnswerError)</h3>
        <div className={styles.componentColumn}>
          <AnswerError
            message="Ошибка соединения с upstream-моделью"
            description="Превышено максимальное время ожидания ответа (таймаут 60000 мс)."
            onRetry={() => setUiFeedback('Запущен повторный запрос к модели (Retry)')}
          />
          <AnswerError
            message="Превышен лимит токенов"
            description="Запрос заблокирован политикой rate limit. Повторная отправка временно заблокирована."
            retryDisabled={true}
            onRetry={() => {}}
          />
        </div>
      </section>

      {/* 6. TASK-006: PromptForm */}
      <section className={styles.panel} aria-labelledby="prompt-form-heading">
        <div className={styles.sectionHeader}>
          <h2 id="prompt-form-heading" className={styles.sectionTitle}>
            6. Форма ввода вопроса (TASK-006)
          </h2>
          <span className={styles.sectionSubtitle}>
            Controlled textarea с авто-высотой до 160px, кнопками Send / Stop и поддержкой IME
          </span>
        </div>

        <div className={styles.controlsBar}>
          <Button
            variant="secondary"
            onClick={() => {
              setIsBusy(!isBusy);
              setUiFeedback(`Режим переключен: busy = ${!isBusy}`);
            }}
          >
            {isBusy ? 'Снять режим busy' : 'Включить режим busy'}
          </Button>
          <span className={styles.feedbackBanner}>
            Текущий статус: {isBusy ? 'Генерация активна (Busy)' : 'Ожидание ввода'}
          </span>
        </div>

        {lastSentPrompt && (
          <div className={styles.feedbackBanner}>
            Последний отправленный запрос: <strong>{lastSentPrompt}</strong>
          </div>
        )}

        <PromptForm
          value={promptValue}
          onValueChange={(val) => setPromptValue(val)}
          busy={isBusy}
          onSend={(sentText) => {
            setLastSentPrompt(sentText);
            setUiFeedback(`Вопрос отправлен: "${sentText.slice(0, 30)}..."`);
          }}
          onStop={() => {
            setIsBusy(false);
            setUiFeedback('Генерация остановлена пользователем');
          }}
        />
      </section>
    </main>
  );
}

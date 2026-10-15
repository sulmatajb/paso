import { useRef, useState } from 'react';
import { ArrowRight, Check, CornerDownLeft, RotateCcw } from 'lucide-react';
import type { Answer } from '../engine';
import type { Exercise } from '../content/schema';
import { languageNames } from '../content/catalog';
import { useI18n } from '../i18n';
type Props = {
  exercise: Exercise;
  disabled: boolean;
  answer: Answer;
  onChange: (answer: Answer) => void;
  targetLanguage: string;
  sourceLanguage: string;
};
export function isReady(exercise: Exercise, answer: Answer) {
  if (
    exercise.type === 'write' ||
    exercise.type === 'listen' ||
    exercise.type === 'choice' ||
    exercise.type === 'dialogue' ||
    exercise.type === 'speak'
  )
    return typeof answer === 'string' && answer.trim().length > 0;
  if (exercise.type === 'order')
    return Array.isArray(answer) && answer.length === exercise.tokens.length;
  return (
    typeof answer === 'object' &&
    !Array.isArray(answer) &&
    Object.keys(answer).length === exercise.pairs.length
  );
}
export function initialAnswer(exercise: Exercise): Answer {
  return exercise.type === 'match' ? {} : exercise.type === 'order' ? [] : '';
}
export function ExerciseInput(props: Props) {
  const { exercise, disabled, answer, onChange, targetLanguage, sourceLanguage } = props;
  const { t } = useI18n();
  if (exercise.type === 'choice' || exercise.type === 'dialogue')
    return (
      <div className="choices" role="group" aria-label={t.answerChoices}>
        {exercise.options.map((option, i) => (
          <button
            type="button"
            key={option}
            aria-pressed={answer === option}
            disabled={disabled}
            className={`choice ${answer === option ? 'selected' : ''}`}
            onClick={() => onChange(option)}
          >
            <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
            <span>{option}</span>
            <span className="choice-indicator">
              {answer === option && <Check size={17} strokeWidth={3} />}
            </span>
          </button>
        ))}
      </div>
    );
  if (exercise.type === 'write' || exercise.type === 'listen' || exercise.type === 'speak')
    return <WrittenInput {...props} />;
  if (exercise.type === 'order') {
    const words = Array.isArray(answer) ? answer : [];
    return (
      <div className="word-builder">
        <div
          className={`answer-line ${words.length ? 'has-words' : ''}`}
          aria-label={t.yourSentence}
          lang={targetLanguage}
        >
          {!words.length && <span>{t.tapWords}</span>}
          {words.map((word, i) => (
            <button
              type="button"
              className="word selected"
              disabled={disabled}
              key={`${word}-${i}`}
              onClick={() => onChange(words.filter((_, index) => index !== i))}
              aria-label={`${t.remove} ${word}`}
            >
              {word}
            </button>
          ))}
        </div>
        <div className="word-bank" aria-label={t.availableWords} lang={targetLanguage}>
          {exercise.tokens.map((word, i) => {
            const occurrence = exercise.tokens.slice(0, i + 1).filter((w) => w === word).length;
            return (
              <button
                type="button"
                className="word"
                key={`${i}-${word}`}
                disabled={disabled || words.filter((w) => w === word).length >= occurrence}
                onClick={() => onChange([...words, word])}
              >
                {word}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="text-button reset-words"
          disabled={disabled || !words.length}
          onClick={() => onChange([])}
        >
          <RotateCcw size={14} />
          {t.startOver}
        </button>
      </div>
    );
  }
  return (
    <MatchingInput
      exercise={exercise}
      disabled={disabled}
      answer={answer}
      onChange={onChange}
      targetLanguage={targetLanguage}
      sourceLanguage={sourceLanguage}
    />
  );
}
function WrittenInput({ disabled, answer, onChange, targetLanguage }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLTextAreaElement>(null);
  const text = typeof answer === 'string' ? answer : '';
  const accents: Record<string, string[]> = {
    es: ['á', 'é', 'í', 'ó', 'ú', 'ü', 'ñ'],
    fr: ['à', 'â', 'ç', 'é', 'è', 'ê', 'î', 'ô', 'ù', 'œ'],
  };
  function insert(char: string) {
    const start = input.current?.selectionStart ?? text.length,
      end = input.current?.selectionEnd ?? text.length;
    onChange(text.slice(0, start) + char + text.slice(end));
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(start + char.length, start + char.length);
    });
  }
  return (
    <div className="write-answer">
      <label htmlFor="written-answer">
        {t.answer} · {languageNames[targetLanguage] ?? targetLanguage}
      </label>
      <textarea
        ref={input}
        id="written-answer"
        rows={2}
        lang={targetLanguage}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck={false}
        placeholder={t.typeHere}
        value={text}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {accents[targetLanguage] && (
        <div className="accent-keys" aria-label="Accent characters">
          {accents[targetLanguage].map((char) => (
            <button
              key={char}
              type="button"
              disabled={disabled}
              onClick={() => insert(char)}
              aria-label={`${char}`}
            >
              {char}
            </button>
          ))}
        </div>
      )}
      <span className="input-help">
        <CornerDownLeft size={14} />
        {t.enterCheck}
      </span>
    </div>
  );
}
function MatchingInput({
  exercise,
  disabled,
  answer,
  onChange,
  targetLanguage,
  sourceLanguage,
}: Props & { exercise: Extract<Exercise, { type: 'match' }> }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const pairs = typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  const rights = [...exercise.pairs.slice(2), ...exercise.pairs.slice(0, 2)];
  const connect = (right: string) => {
    if (selected) {
      onChange({ ...pairs, [selected]: right });
      setSelected(null);
    }
  };
  const remove = (left: string) => {
    const remaining = { ...pairs };
    delete remaining[left];
    onChange(remaining);
    setSelected(left);
  };
  return (
    <div className="matching">
      <div className="match-columns">
        <div>
          <span className="match-label">{languageNames[targetLanguage]}</span>
          {exercise.pairs.map((pair, i) => (
            <button
              type="button"
              className={`match-option ${selected === pair.left ? 'selected' : ''} ${pairs[pair.left] ? 'paired' : ''}`}
              key={pair.left}
              disabled={disabled}
              aria-pressed={selected === pair.left}
              onClick={() => (pairs[pair.left] ? remove(pair.left) : setSelected(pair.left))}
            >
              <span lang={targetLanguage}>{pair.left}</span>
              {pairs[pair.left] && <span className="pair-number">{i + 1}</span>}
            </button>
          ))}
        </div>
        <span className="match-arrow">
          <ArrowRight size={18} />
        </span>
        <div>
          <span className="match-label">{languageNames[sourceLanguage]}</span>
          {rights.map((pair) => {
            const left = Object.keys(pairs).find((key) => pairs[key] === pair.right),
              index = exercise.pairs.findIndex((p) => p.left === left);
            return (
              <button
                type="button"
                className={`match-option ${left ? 'paired' : ''}`}
                key={pair.right}
                disabled={disabled || (!selected && !left)}
                onClick={() => (left ? remove(left) : connect(pair.right))}
              >
                <span lang={sourceLanguage}>{pair.right}</span>
                {left && <span className="pair-number">{index + 1}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="match-help" aria-live="polite">
        {Object.keys(pairs).length}/{exercise.pairs.length} ·{' '}
        {selected ? `${selected} → ?` : t.pairHelp}
      </p>
    </div>
  );
}

'use client';

import { Check, CheckCircle2, HelpCircle, Send } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ClarifyingQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface AskUserCardProps {
  toolCallId?: string;
  title?: string;
  questions: ClarifyingQuestion[];
  allowOther?: boolean;
  submittedAnswers?: Record<string, string[]>;
  onSubmit: (answers: Record<string, string[]>, formattedSummary: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AskUserCard({
  title = 'Quick Clarification',
  questions,
  allowOther = true,
  submittedAnswers,
  onSubmit,
  disabled = false,
  className,
}: AskUserCardProps) {
  const [selections, setSelections] = React.useState<Record<string, string[]>>(
    submittedAnswers ?? {},
  );
  const [otherInputs, setOtherInputs] = React.useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = React.useState<boolean>(Boolean(submittedAnswers));
  const headingId = React.useId();

  React.useEffect(() => {
    if (submittedAnswers) {
      setSelections(submittedAnswers);
      setIsSubmitted(true);
    }
  }, [submittedAnswers]);

  const toggleOption = (question: ClarifyingQuestion, optionLabel: string) => {
    if (disabled || isSubmitted) return;
    setSelections((prev) => {
      const current = prev[question.id] ?? [];
      if (question.multiSelect) {
        const exists = current.includes(optionLabel);
        return {
          ...prev,
          [question.id]: exists
            ? current.filter((v) => v !== optionLabel)
            : [...current, optionLabel],
        };
      }
      return {
        ...prev,
        [question.id]: [optionLabel],
      };
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isSubmitted) return;

    const finalAnswers: Record<string, string[]> = {};
    const summaryLines: string[] = [];

    for (const q of questions) {
      const picked = [...(selections[q.id] ?? [])];
      const custom = otherInputs[q.id]?.trim();
      if (custom) {
        picked.push(custom);
      }
      finalAnswers[q.id] = picked;
      if (picked.length > 0) {
        summaryLines.push(`${q.prompt}: ${picked.join(', ')}`);
      }
    }

    const formatted =
      summaryLines.length > 0 ? summaryLines.join('\n') : 'Proceed with recommended defaults.';

    setIsSubmitted(true);
    onSubmit(finalAnswers, formatted);
  };

  const hasAnySelection = questions.some(
    (q) => (selections[q.id]?.length ?? 0) > 0 || Boolean(otherInputs[q.id]?.trim()),
  );

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={headingId}
      data-slot="ask-user-card"
      className={cn(
        'my-2.5 overflow-hidden rounded-[var(--radius-container)] border border-[var(--border-subtle)]',
        'bg-[var(--bg-surface)] shadow-[var(--shadow-med)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-[var(--radius-inner)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <HelpCircle className="size-4" aria-hidden="true" />
          </div>
          <h4 id={headingId} className="text-sm font-semibold text-[var(--fg-primary)]">
            {title}
          </h4>
        </div>
        {isSubmitted && (
          <Badge variant="success">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            Answered
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        {questions.map((question) => {
          const picked = selections[question.id] ?? [];
          const otherId = `ask-other-${question.id}`;
          return (
            <fieldset key={question.id} className="flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 text-xs font-semibold text-[var(--fg-primary)]">
                {question.prompt}
                {question.multiSelect && (
                  <span className="ml-1.5 font-normal text-[var(--fg-muted)]">
                    (Select all that apply)
                  </span>
                )}
              </legend>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {question.options.map((opt) => {
                  const selected = picked.includes(opt.label);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled || isSubmitted}
                      aria-pressed={selected}
                      onClick={() => toggleOption(question, opt.label)}
                      className={cn(
                        'flex cursor-pointer items-start justify-between gap-2 rounded-[var(--radius-element)]',
                        'border p-3 text-left transition-[border-color,box-shadow] duration-[var(--duration-fast)]',
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-inset-selected)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--overlay-hover)]',
                        (disabled || isSubmitted) && 'cursor-default opacity-80',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[var(--fg-primary)]">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--fg-secondary)]">
                            {opt.description}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[var(--radius-full)] border',
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                            : 'border-[var(--border-strong)] bg-[var(--bg-surface)]',
                        )}
                      >
                        {selected && <Check className="size-2.5" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {allowOther && !isSubmitted && (
                <div className="mt-1">
                  <label htmlFor={otherId} className="visually-hidden">
                    Other response for {question.prompt}
                  </label>
                  <Input
                    id={otherId}
                    name={otherId}
                    value={otherInputs[question.id] ?? ''}
                    onChange={(e) =>
                      setOtherInputs((prev) => ({
                        ...prev,
                        [question.id]: e.target.value,
                      }))
                    }
                    placeholder="Or type a custom answer…"
                    disabled={disabled}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </fieldset>
          );
        })}
      </div>

      {!isSubmitted && (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5">
          <span className="text-[11px] text-[var(--fg-muted)]">
            Your selection feeds directly into the next step.
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={disabled || !hasAnySelection}>
            <Send className="size-3.5" aria-hidden="true" />
            Continue
          </Button>
        </div>
      )}
    </form>
  );
}

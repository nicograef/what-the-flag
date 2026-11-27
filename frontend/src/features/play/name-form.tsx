import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startRun } from "@/features/play/api";
import { messages, playError } from "@/features/play/messages";
import { ApiError, useApiClient } from "@/lib/api";
import { useLocale, type Locale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";
import { readItem, writeItem } from "@/lib/storage";

const nameKey = "wtf.name";

/** Starts a run: on a fresh quiz, or with `quizId` on that quiz. `errorText` words a failed start. */
export function NameForm({
  quizId,
  errorText = playError,
}: {
  quizId?: string;
  errorText?: (err: unknown, locale: Locale) => string;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const [name, setName] = useState(() => readItem(nameKey) ?? "");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const start = useMutation({
    mutationFn: (body: { name: string; quizId?: string }) =>
      startRun(api, body),
    onSuccess: async ({ runId }, { name: started }) => {
      writeItem(nameKey, started);
      await navigate(`/play/${runId}`);
    },
  });

  const fieldError =
    start.error instanceof ApiError && start.error.field === "name";

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    start.mutate(quizId ? { name, quizId } : { name });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t.nameLabel}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          name="name"
          autoComplete="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={fieldError}
          aria-describedby={fieldError ? `${errorId} ${hintId}` : hintId}
          className="h-10"
        />
        <Button
          type="submit"
          size="lg"
          disabled={start.isPending}
          className="h-10 px-4"
        >
          {start.isPending ? t.starting : t.start}
        </Button>
      </div>
      {start.isError && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {errorText(start.error, locale)}
        </p>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {t.namePublic}
      </p>
    </form>
  );
}

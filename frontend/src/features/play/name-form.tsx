import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { HoldButton, useCoarsePointer } from "@/components/ui/hold-button";
import { meKey, startRun, type Me } from "@/features/play/api";
import { messages, playError } from "@/features/play/messages";
import { ApiError, useApiClient } from "@/lib/api";
import { useLocale, type Locale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** The start: a hold to start a fresh run, a hold to accept a challenge, or a plain Play button. */
export type StartAction = "start" | "accept" | "play";

/**
 * Starts a run: on a fresh quiz, or with `quizId` on that quiz. `errorText` words a failed start.
 * A known `lastName` stands as "as {name} · Change name"; otherwise, and after Change name, a field asks.
 */
export function NameForm({
  quizId,
  lastName,
  action,
  label,
  blockedLabel,
  errorText = playError,
}: {
  quizId?: string;
  /** The player's last name from `/api/me`; null asks for one. */
  lastName: string | null;
  action: StartAction;
  /** The field's label in place of "Dein Name". */
  label?: string;
  /** Set while no run can start: the start button reads it, `aria-disabled`. */
  blockedLabel?: string;
  errorText?: (err: unknown, locale: Locale) => string;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const coarse = useCoarsePointer();
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? lastName ?? "";
  const asking = lastName === null || editing;
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const holdHintId = useId();
  const start = useMutation({
    mutationFn: (body: { name: string; quizId?: string }) =>
      startRun(api, body),
    onSuccess: async ({ runId }, { name: started }) => {
      // The cached name stands in until the refetch, so the home page never shows the previous one.
      queryClient.setQueryData<Me>(
        meKey,
        (old) => old && { ...old, lastName: started },
      );
      void queryClient.invalidateQueries({
        queryKey: meKey,
        refetchType: "none",
      });
      await navigate(`/play/${runId}`);
    },
  });

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const fieldError =
    start.error instanceof ApiError && start.error.field === "name";
  const holdHint = action === "start" && coarse;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (start.isPending || blockedLabel !== undefined) return;
    start.mutate(quizId ? { name, quizId } : { name });
  }

  const error = start.isError && (
    <p id={errorId} role="alert" className="text-[15px] text-danger">
      {errorText(start.error, locale)}
    </p>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      {asking && (
        <>
          <label htmlFor={inputId} className="text-[15px] font-bold">
            {label ?? t.nameLabel}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="name"
            autoComplete="nickname"
            placeholder={t.namePlaceholder}
            value={name}
            onChange={(e) => setTyped(e.target.value)}
            aria-invalid={fieldError}
            aria-describedby={fieldError ? `${errorId} ${hintId}` : hintId}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={cn(
              "h-14 w-full min-w-0 rounded-option border-2 border-border-strong bg-surface px-4 text-[19px] font-semibold placeholder:text-foreground-muted",
              "aria-invalid:border-danger",
            )}
          />
          <p id={hintId} className="text-[13px] text-foreground-muted">
            {t.namePublic}
          </p>
          {error}
        </>
      )}
      {action === "play" ? (
        <Button
          type="submit"
          guarded={start.isPending || blockedLabel !== undefined}
          className="mt-2 min-h-[72px] w-full text-[26px]"
        >
          <Play aria-hidden="true" className="fill-current" />
          {t.play}
        </Button>
      ) : (
        <HoldButton
          label={blockedLabel ?? (action === "accept" ? t.accept : t.start)}
          holdLabel={
            blockedLabel ??
            (action === "accept" ? t.holdToAccept : t.holdToStart)
          }
          guarded={start.isPending || blockedLabel !== undefined}
          aria-describedby={holdHint ? holdHintId : undefined}
          className="mt-2 min-h-[72px] w-full"
          onCommit={(button) => button.form?.requestSubmit()}
        />
      )}
      {holdHint && (
        <p
          id={holdHintId}
          className="text-center text-[13px] text-foreground-muted"
        >
          {t.holdHintStart}
        </p>
      )}
      {!asking && lastName !== null && (
        <>
          {error}
          <p className="flex items-center justify-center gap-1 text-[15px] text-foreground-muted">
            <span>{t.playingAs(lastName)}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="min-h-11 rounded-chip px-2 font-semibold text-accent underline underline-offset-2"
              onClick={() => setEditing(true)}
            >
              {t.changeName}
            </button>
          </p>
        </>
      )}
    </form>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { HoldButton } from "@/components/ui/hold-button";
import { Input } from "@/components/ui/input";
import { meKey, meQuery, startRun, type Me } from "@/features/play/api";
import { messages, playError } from "@/features/play/messages";
import { ApiError, useApiClient } from "@/lib/api";
import { useLocale, type Locale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";
/**
 * Starts a run: on a fresh quiz, or with `quizId` on that quiz. `errorText` words a failed start.
 * The field shows the player's last name until it is edited; a failed `/api/me` leaves it empty.
 */
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
  const queryClient = useQueryClient();
  const me = useQuery(meQuery(api));
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? me.data?.lastName ?? "";
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
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

  const fieldError =
    start.error instanceof ApiError && start.error.field === "name";

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    start.mutate(quizId ? { name, quizId } : { name });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium">
        {t.nameLabel}
      </label>
      <Input
        id={inputId}
        name="name"
        autoComplete="nickname"
        value={name}
        onChange={(e) => setTyped(e.target.value)}
        aria-invalid={fieldError}
        aria-describedby={fieldError ? `${errorId} ${hintId}` : hintId}
        maxLength={20}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
      />
      <p id={hintId} className="text-sm text-foreground-muted">
        {t.namePublic}
      </p>
      {start.isError && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {errorText(start.error, locale)}
        </p>
      )}
      <HoldButton
        label={quizId ? t.accept : t.start}
        holdLabel={quizId ? t.holdToAccept : t.holdToStart}
        guarded={start.isPending}
        className="mt-2 w-full"
        onCommit={(button) => button.form?.requestSubmit()}
      />
    </form>
  );
}

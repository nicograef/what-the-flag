import {
  queryOptions,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  answerQuestion,
  getRun,
  type Outcome,
  type RunState,
} from "@/features/play/api";
import { useApiClient, type ApiClient } from "@/lib/api";

/** A run state with the `performance.now()` instant it arrived, the base of the countdown. */
interface LoadedRun {
  state: RunState;
  receivedAt: number;
}

const revealMs = 800;

function runQueryOptions(api: ApiClient, runId: string, enabled: boolean) {
  return queryOptions({
    queryKey: ["run", runId],
    queryFn: async (): Promise<LoadedRun> => {
      const state = await getRun(api, runId);
      return { state, receivedAt: performance.now() };
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled,
  });
}

interface UseRun {
  query: UseQueryResult<LoadedRun>;
  /** The outcome of the last answer while it shows; the query is disabled meanwhile. */
  reveal: Outcome | null;
  /** True while an answer is in flight or its outcome shows; the question takes no answer meanwhile. */
  busy: boolean;
  answerError: Error | null;
  answer: (option: number | null) => void;
}

export function useRun(runId: string): UseRun {
  const api = useApiClient();
  const [reveal, setReveal] = useState<Outcome | null>(null);
  const query = useQuery(runQueryOptions(api, runId, reveal === null));
  const { refetch } = query;
  const mutation = useMutation({
    mutationFn: (body: { position: number; option: number | null }) =>
      answerQuestion(api, runId, body),
    onSuccess: setReveal,
    // A 409 means another tab answered first; the fresh state shows what happened.
    onError: () => void refetch(),
  });

  useEffect(() => {
    if (!reveal) return;
    const delay = reveal.correct && !reveal.finished ? revealMs : 0;
    const timer = setTimeout(() => {
      void refetch().finally(() => setReveal(null));
    }, delay);
    return () => clearTimeout(timer);
  }, [reveal, refetch]);

  const question = query.data?.state.question;
  const busy = reveal !== null || mutation.isPending;
  const { mutate } = mutation;
  const answer = useCallback(
    (option: number | null) => {
      if (!question || busy) return;
      mutate({ position: question.position, option });
    },
    [question, busy, mutate],
  );

  return {
    query,
    reveal,
    busy,
    // An error belongs to the question it answered; a refetch that moves on drops it.
    answerError:
      mutation.variables?.position === question?.position
        ? mutation.error
        : null,
    answer,
  };
}

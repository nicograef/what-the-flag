import {
  queryOptions,
  useMutation,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
  /** Answers the current question; only the first answer per position goes out. */
  answer: (option: number) => void;
  /** The clock reached 0: answers nothing, unless a hold runs, which then decides. */
  expire: () => void;
  /** A hold on an option started or ended. */
  holdChange: (holding: boolean) => void;
}

/**
 * One run. `revealDelay` says how long an answer's outcome shows before the next state loads;
 * it is read when the outcome arrives.
 */
export function useRun(
  runId: string,
  revealDelay: (outcome: Outcome) => number,
): UseRun {
  const api = useApiClient();
  const [reveal, setReveal] = useState<Outcome | null>(null);
  const query = useQuery(runQueryOptions(api, runId, reveal === null));
  const { refetch } = query;
  /** The position an answer went out for: a hold, a click, a key and the expiry share it. */
  const latch = useRef<number | null>(null);
  const holding = useRef(false);
  /** The clock reached 0 during a hold; a hold that ends without a commit then sends the timeout. */
  const expiredInHold = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: { position: number; option: number | null }) =>
      answerQuestion(api, runId, body),
    onSuccess: setReveal,
    onError: (_err, { position }) => {
      // The answer did not count, so the question takes another one.
      if (latch.current === position) latch.current = null;
      // A 409 means another tab answered first; the fresh state shows what happened.
      void refetch();
    },
  });

  const delayOf = useRef(revealDelay);
  useLayoutEffect(() => {
    delayOf.current = revealDelay;
  });

  useEffect(() => {
    if (!reveal) return;
    const delay = delayOf.current(reveal);
    const timer = setTimeout(() => {
      void refetch().finally(() => setReveal(null));
    }, delay);
    return () => clearTimeout(timer);
  }, [reveal, refetch]);

  const question = query.data?.state.question;
  const position = useRef<number | null>(null);
  useLayoutEffect(() => {
    position.current = question?.position ?? null;
  });
  const busy = reveal !== null || mutation.isPending;
  const { mutate } = mutation;

  const send = useCallback(
    (option: number | null) => {
      const at = position.current;
      if (at === null || latch.current === at) return;
      latch.current = at;
      expiredInHold.current = false;
      mutate({ position: at, option });
    },
    [mutate],
  );

  const expire = useCallback(() => {
    if (holding.current) {
      expiredInHold.current = true;
      return;
    }
    send(null);
  }, [send]);

  const holdChange = useCallback(
    (active: boolean) => {
      holding.current = active;
      if (!active && expiredInHold.current) send(null);
    },
    [send],
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
    answer: send,
    expire,
    holdChange,
  };
}

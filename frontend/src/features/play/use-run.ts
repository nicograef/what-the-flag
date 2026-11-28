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
import { ApiError, useApiClient, type ApiClient } from "@/lib/api";

/** A run state with the `performance.now()` instant it arrived, the base of the countdown. */
interface LoadedRun {
  state: RunState;
  receivedAt: number;
}

/** How long past the deadline the server still accepts an answer. */
const graceMs = 2000;
/** The waits between retries of an answer lost to the network. */
const backoffMs = [500, 1000, 2000];

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

function isNetwork(err: unknown): boolean {
  return err instanceof ApiError && err.code === "network";
}

/** The question a reload landed on, with its whole seconds left at arrival. */
interface Resumed {
  position: number;
  secondsLeft: number;
}

interface UseRun {
  query: UseQueryResult<LoadedRun>;
  /** The outcome of the last answer while it shows; the query is disabled meanwhile. */
  reveal: Outcome | null;
  /** True while an answer is in flight or its outcome shows; the question takes no answer meanwhile. */
  busy: boolean;
  /** The option on its way to the server; null when nothing is sent. */
  sending: number | null;
  /** True while a lost answer waits for its next try. */
  isRetrying: boolean;
  /** Ends the current wait, so the lost answer goes out now. */
  retryNow: () => void;
  /** Set when the first state after mount served a question whose clock had already run. */
  resumed: Resumed | null;
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
 * it is read when the outcome arrives. An answer lost to the network retries with back-off until
 * the deadline plus the server's grace.
 */
export function useRun(
  runId: string,
  revealDelay: (outcome: Outcome) => number,
): UseRun {
  const api = useApiClient();
  const [reveal, setReveal] = useState<Outcome | null>(null);
  const [isRetrying, setRetrying] = useState(false);
  const query = useQuery(runQueryOptions(api, runId, reveal === null));
  const { refetch } = query;
  /** The position an answer went out for: a hold, a click, a key and the expiry share it. */
  const latch = useRef<number | null>(null);
  const holding = useRef(false);
  /** The clock reached 0 during a hold; a hold that ends without a commit then sends the timeout. */
  const expiredInHold = useRef(false);
  /** The `performance.now()` instant after which the server takes no answer to this question. */
  const cutoff = useRef(Infinity);
  /** Ends the running back-off wait early. */
  const wake = useRef<(() => void) | null>(null);
  /** Set once the run screen unmounts: a lost answer then stops retrying. */
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      wake.current?.();
    };
  }, []);

  const mutation = useMutation({
    // Offline, an answer fails and retries here instead of pausing until the browser is online.
    networkMode: "always",
    mutationFn: async (body: { position: number; option: number | null }) => {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            return await answerQuestion(api, runId, body);
          } catch (err) {
            if (
              !isNetwork(err) ||
              unmounted.current ||
              performance.now() >= cutoff.current
            ) {
              throw err;
            }
          }
          setRetrying(true);
          await new Promise<void>((resolve) => {
            const timer = setTimeout(
              resolve,
              backoffMs[Math.min(attempt, backoffMs.length - 1)],
            );
            wake.current = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          wake.current = null;
          if (unmounted.current) throw new Error("the run screen closed");
        }
      } finally {
        setRetrying(false);
      }
    },
    onSuccess: setReveal,
    onError: (_err, { position }) => {
      // The answer did not count, so the question takes another one.
      if (latch.current === position) latch.current = null;
      // A 409 means the server has an answer already: a lost response or another tab. The fresh state shows it.
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
    const data = query.data;
    if (!data || !question) return;
    cutoff.current =
      data.receivedAt +
      Date.parse(question.deadline) -
      Date.parse(data.state.serverNow) +
      graceMs;
  });

  // The first state after mount tells whether this mount resumed a question whose clock ran.
  const [first, setFirst] = useState<LoadedRun | null>(null);
  if (first === null && query.data) setFirst(query.data);
  const served = first?.state.question;
  let resumed: Resumed | null = null;
  if (first && served) {
    const leftMs =
      Date.parse(served.deadline) - Date.parse(first.state.serverNow);
    if (leftMs < served.limitMs) {
      resumed = {
        position: served.position,
        secondsLeft: Math.max(0, Math.ceil(leftMs / 1000)),
      };
    }
  }

  // A question the server already answered takes nothing more, also when the refetch after its reveal failed.
  const answered =
    mutation.isSuccess && mutation.variables.position === question?.position;
  const busy = reveal !== null || mutation.isPending || answered;
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

  const retryNow = useCallback(() => wake.current?.(), []);

  const { error, variables } = mutation;
  return {
    query,
    reveal,
    busy,
    sending: mutation.isPending ? (variables?.option ?? null) : null,
    isRetrying,
    retryNow,
    resumed,
    // An error belongs to the question it answered; a refetch that moves on drops it. A 409
    // only says the server has an answer, which the refetch shows.
    answerError:
      variables?.position === question?.position &&
      !(error instanceof ApiError && error.code === "not_current_question")
        ? error
        : null,
    answer: send,
    expire,
    holdChange,
  };
}

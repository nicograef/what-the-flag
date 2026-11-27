import { useEffect, useRef, useState, type ReactNode } from "react";
import { Progress } from "@/components/ui/progress";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

const limitMs = 15_000;
const tickMs = 100;

/**
 * The milliseconds left until `deadline`. It counts from the server's clock at arrival and the
 * monotonic `performance.now()` since, so a wrong device clock changes nothing.
 */
function remainingMs(
  deadline: string,
  serverNow: string,
  receivedAt: number,
): number {
  const atArrival = Date.parse(deadline) - Date.parse(serverNow);
  return Math.max(0, atArrival - (performance.now() - receivedAt));
}

export function Countdown({
  deadline,
  serverNow,
  receivedAt,
  paused,
  onExpire,
}: {
  deadline: string;
  serverNow: string;
  receivedAt: number;
  paused: boolean;
  onExpire: () => void;
}): ReactNode {
  const t = useMessages(messages);
  const [remaining, setRemaining] = useState(() =>
    remainingMs(deadline, serverNow, receivedAt),
  );
  const expired = useRef(false);

  useEffect(() => {
    expired.current = false;
    const update = (): void =>
      setRemaining(remainingMs(deadline, serverNow, receivedAt));
    update();
    const timer = setInterval(update, tickMs);
    return () => clearInterval(timer);
  }, [deadline, serverNow, receivedAt]);

  useEffect(() => {
    if (remaining > 0 || paused || expired.current) return;
    expired.current = true;
    onExpire();
  }, [remaining, paused, onExpire]);

  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className="flex items-center gap-3">
      <Progress
        aria-label={t.timeLeft}
        getValueLabel={() => t.seconds(seconds)}
        value={(remaining / limitMs) * 100}
        className="h-2"
      />
      <span
        aria-hidden="true"
        className="w-10 text-right text-sm tabular-nums text-muted-foreground"
      >
        {seconds} s
      </span>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Progress } from "@/components/ui/progress";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

const tickMs = 100;

const toneClasses = {
  normal: { bar: "bg-primary", text: "text-foreground" },
  warning: { bar: "bg-warning", text: "text-warning" },
  danger: {
    bar: "bg-destructive",
    text: "text-destructive motion-safe:animate-pulse",
  },
};

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
  limitMs,
  serverNow,
  receivedAt,
  paused,
  onExpire,
}: {
  deadline: string;
  limitMs: number;
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
  const tone = seconds <= 3 ? "danger" : seconds <= 5 ? "warning" : "normal";
  return (
    <div className="mt-3 flex items-center gap-3">
      <Progress
        aria-label={t.timeLeft}
        getValueLabel={() => t.seconds(seconds)}
        value={(remaining / limitMs) * 100}
        className="h-2.5"
        indicatorClassName={toneClasses[tone].bar}
      />
      <span
        aria-hidden="true"
        className={cn(
          "w-10 text-right text-base font-bold tabular-nums",
          toneClasses[tone].text,
        )}
      >
        {t.secondsShort(seconds)}
      </span>
    </div>
  );
}

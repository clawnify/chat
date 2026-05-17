import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Ban, Check, Loader2 } from "lucide-react";
import type { PendingApproval } from "@/lib/protocol";
import { cn } from "@/lib/utils";

type Decision = "allow-once" | "allow-always" | "deny";
const DECISIONS: readonly Decision[] = ["allow-once", "allow-always", "deny"] as const;

export function ApprovalCard({
  approval,
  onResolve,
}: {
  approval: PendingApproval;
  onResolve: (approvalId: string, decision: Decision) => void;
}) {
  const [resolving, setResolving] = useState<Decision | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [, setTick] = useState(0);
  const approveRef = useRef<HTMLButtonElement>(null);

  const isExpired =
    approval.status === "expired" ||
    (approval.expiresAt != null && Date.now() > approval.expiresAt);
  const isPending = approval.status === "pending" && !isExpired;

  useEffect(() => {
    if (isPending) approveRef.current?.focus();
  }, [isPending]);

  useEffect(() => {
    if (!isPending || !approval.expiresAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [isPending, approval.expiresAt]);

  function click(decision: Decision) {
    setResolving(decision);
    onResolve(approval.approvalId, decision);
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!isPending || resolving) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(selectedIdx + 1, DECISIONS.length - 1);
      setSelectedIdx(next);
      (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(selectedIdx - 1, 0);
      setSelectedIdx(prev);
      (e.currentTarget.parentElement?.children[prev] as HTMLElement | undefined)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      click(DECISIONS[selectedIdx]);
    }
  }

  const isPlugin = approval.kind === "plugin";
  const command = approval.command ?? "";
  const commandDisplay = command.length > 240 ? command.slice(0, 240) + "..." : command;
  const description = approval.description ?? "";
  const descriptionDisplay =
    description.length > 240 ? description.slice(0, 240) + "..." : description;

  return (
    <div
      className={cn(
        "rounded-xl border bg-muted/30 px-4 py-3 flex flex-col gap-2.5 text-sm",
        isExpired && "opacity-60",
      )}
    >
      {isPlugin ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-sm font-medium leading-snug">
            {approval.title ?? approval.toolName ?? "Approval required"}
          </div>
          {descriptionDisplay && (
            <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {descriptionDisplay}
            </div>
          )}
        </div>
      ) : (
        <div className="font-mono text-xs text-muted-foreground break-all">
          <span className="opacity-50 select-none">$ </span>
          {commandDisplay}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isExpired ? (
          <Pill>
            <Ban size={12} /> Expired
          </Pill>
        ) : isPending ? (
          <>
            <PillButton
              ref={approveRef}
              disabled={resolving !== null}
              onClick={() => click("allow-once")}
              onKeyDown={onKey}
              onFocus={() => setSelectedIdx(0)}
            >
              {resolving === "allow-once" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              Approve
            </PillButton>
            <PillButton
              disabled={resolving !== null}
              onClick={() => click("allow-always")}
              onKeyDown={onKey}
              onFocus={() => setSelectedIdx(1)}
            >
              {resolving === "allow-always" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              Always
            </PillButton>
            <PillButton
              disabled={resolving !== null}
              onClick={() => click("deny")}
              onKeyDown={onKey}
              onFocus={() => setSelectedIdx(2)}
            >
              {resolving === "deny" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Ban size={12} />
              )}
              Deny
            </PillButton>
            {approval.expiresAt && (
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {Math.max(0, Math.ceil((approval.expiresAt - Date.now()) / 60_000))}m
              </span>
            )}
          </>
        ) : (
          <Pill>
            {approval.status === "deny" ? (
              <>
                <Ban size={12} /> Denied
              </>
            ) : (
              <>
                <Check size={12} />{" "}
                {approval.status === "allow-always" ? "Always" : "Approved"}
              </>
            )}
          </Pill>
        )}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-muted/50 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

const PillButton = function PillButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  },
) {
  const { className, ref, ...rest } = props;
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border bg-muted/50 text-xs font-medium text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground hover:border-foreground/30 cursor-pointer",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    />
  );
};

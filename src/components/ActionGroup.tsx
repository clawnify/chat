import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { Message } from "../lib/protocol";
import { ActionIcon, actionLabel } from "../lib/actions";

/**
 * Collapsible pill summarizing a run of consecutive tool actions.
 *
 * Click to expand → shows one mini-pill per action, each with the tool icon
 * and a `title` attribute carrying the full label (native browser tooltip;
 * no shadcn Tooltip dep).
 */
export function ActionGroup({
  actions,
  anyPending,
}: {
  actions: Message[];
  anyPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = actions[actions.length - 1];
  const hasError = actions.some((a) => a.toolError);

  return (
    <div className="actiongroup">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`actiongroup-pill${hasError ? " has-error" : ""}${
          anyPending ? " is-pending" : ""
        }`}
      >
        <ActionIcon toolName={latest.toolName ?? "tool"} args={latest.content} />
        {anyPending && <Loader2 size={10} className="spin" />}
        <span className="actiongroup-count">{actions.length}</span>
        <ChevronRight
          size={12}
          className={`actiongroup-chev${expanded ? " is-open" : ""}`}
        />
      </button>

      {expanded && (
        <div className="actiongroup-list">
          {actions.map((a, j) => (
            <div
              key={j}
              className={`actiongroup-item${a.toolError ? " has-error" : ""}`}
              title={actionLabel(a.toolName ?? "tool", a.content)}
            >
              <ActionIcon toolName={a.toolName ?? "tool"} args={a.content} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

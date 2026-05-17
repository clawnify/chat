/**
 * Icons + labels for action messages. Lucide-react drives the iconography
 * (browser sub-actions, exec, web search, etc.).
 *
 * The Clawnify-specific `serviceIconForCommand` (renders integration logos for
 * exec commands like `npx slack-cli`) is intentionally not ported — that's
 * Clawnify chrome.
 */

import {
  Brain,
  Camera,
  Compass,
  Eye,
  FileEdit,
  Globe,
  Keyboard,
  MousePointerClick,
  Pencil,
  Search,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";

/** True for tools that operate on a single file, rendered as filename pills. */
export function isFileAction(toolName?: string): boolean {
  return (
    toolName === "read" ||
    toolName === "write" ||
    toolName === "edit" ||
    toolName === "multiedit"
  );
}

/** Filename to display in a file pill — for read/write/edit the summarized
 *  arg is the path. Returns null for non-file actions. */
export function fileActionPath(content: string): string {
  return content;
}

const ICON_SIZE = 12;

/** Icon (or icon pair) representing a tool call. */
export function ActionIcon({
  toolName,
  args,
  size = ICON_SIZE,
}: {
  toolName: string;
  args: string;
  size?: number;
}): ReactNode {
  if (toolName === "browser") {
    const sub = args.split(/\s/)[0];
    const chrome = <Compass key="c" size={size} />;
    switch (sub) {
      case "act":
      case "click":
        return (
          <>
            {chrome}
            <MousePointerClick key="a" size={size} />
          </>
        );
      case "snapshot":
        return (
          <>
            {chrome}
            <Eye key="a" size={size} />
          </>
        );
      case "screenshot":
        return (
          <>
            {chrome}
            <Camera key="a" size={size} />
          </>
        );
      case "navigate":
        return (
          <>
            {chrome}
            <Globe key="a" size={size} />
          </>
        );
      case "fill":
      case "type":
      case "press":
        return (
          <>
            {chrome}
            <Keyboard key="a" size={size} />
          </>
        );
      default:
        return chrome;
    }
  }
  if (toolName === "exec") return <Terminal size={size} />;
  if (toolName === "web_search") return <Search size={size} />;
  if (toolName === "web_fetch") return <Globe size={size} />;
  if (toolName === "memory_search") return <Brain size={size} />;
  if (toolName === "read") return <Eye size={size} />;
  if (toolName === "write") return <Pencil size={size} />;
  if (toolName === "edit" || toolName === "multiedit") return <FileEdit size={size} />;
  return <span className="font-mono text-[10px] font-medium leading-none">{toolName}</span>;
}

/** Concise label for an action. Used in expand-list and tooltips. */
export function actionLabel(toolName: string, args: string): string {
  if (toolName === "browser") {
    const sub = args.split(/\s/)[0];
    return `browser ${sub}`;
  }
  if (toolName === "exec") {
    return args.length > 60 ? args.slice(0, 60) + "..." : args;
  }
  return `${toolName}: ${args.length > 60 ? args.slice(0, 60) + "..." : args}`;
}

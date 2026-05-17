/**
 * Text-only action labels. Stage 1 of the rich port renders action messages
 * as inline text pills; the iconified ActionGroup component lands in Stage 2.
 */

/** Concise label for a single tool action. */
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

import { SLASH_COMMANDS, type SlashCommand } from "../lib/protocol";

/**
 * Typeahead menu shown above the composer when the input starts with "/".
 * Caller drives the selected index + completion callback to keep keyboard
 * handling colocated with the textarea.
 */
export function SlashMenu({
  filter,
  selectedIdx,
  onSelect,
}: {
  filter: string;
  selectedIdx: number;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const filtered = filterCommands(filter);
  if (filtered.length === 0) return null;
  return (
    <div className="slash-menu">
      {filtered.map((cmd, i) => (
        <button
          key={cmd.name}
          type="button"
          className={`slash-item${i === selectedIdx ? " is-selected" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(cmd);
          }}
        >
          <span className="slash-name">{cmd.name}</span>
          <span className="slash-desc">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

export function filterCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const q = input.slice(1).toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(q));
}

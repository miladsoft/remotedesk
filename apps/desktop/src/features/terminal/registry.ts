/** Lets UI outside a TerminalPane (snippets, the dock) act on a live
 *  terminal without reaching into its xterm instance directly. Each pane
 *  registers itself on mount, keyed by session id. */
export interface TerminalHandle {
  /** Types `text` at the prompt (bracketed paste aware) without running it. */
  insert: (text: string) => void;
  /** Types `text` and presses Enter. */
  run: (text: string) => void;
  focus: () => void;
}

const handles = new Map<string, TerminalHandle>();

export function registerTerminal(sessionId: string, handle: TerminalHandle): () => void {
  handles.set(sessionId, handle);
  return () => {
    if (handles.get(sessionId) === handle) handles.delete(sessionId);
  };
}

export function getTerminal(sessionId: string): TerminalHandle | undefined {
  return handles.get(sessionId);
}

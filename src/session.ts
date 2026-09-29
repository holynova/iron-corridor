import type { RunState } from './systems/RunState';

export interface SessionHooks {
  launch: (run: RunState) => void;
  menu: () => void;
}

const fallback: SessionHooks = {
  launch: () => console.warn('[iron-corridor] session hooks not installed yet'),
  menu: () => console.warn('[iron-corridor] session hooks not installed yet'),
};

export const session: SessionHooks = fallback;

export function installSession(hooks: SessionHooks): void {
  session.launch = hooks.launch;
  session.menu = hooks.menu;
}

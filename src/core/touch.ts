/**
 * Shared touch-control state, written by the DOM overlay in index.html and
 * read by the game (Player movement/dash, GameScene fire + aim).
 *
 * The overlay only exists on coarse pointers and only while a run is active
 * (GameScene toggles the `in-game` body class); on desktop this object stays
 * at its zero state and costs nothing.
 */
export interface TouchState {
  /** Analog stick vector, -1..1 on each axis, dead-zoned. */
  mx: number;
  my: number;
  /** Fire button held. */
  firing: boolean;
  /** Wired by GameScene.create, cleared on shutdown. */
  dash: (() => void) | null;
  pause: (() => void) | null;
}

export const touchState: TouchState = {
  mx: 0,
  my: 0,
  firing: false,
  dash: null,
  pause: null,
};

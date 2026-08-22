/**
 * lib/contextMenuPosition.ts
 *
 * Viewport-aware context menu positioning utility.
 *
 * Given the cursor coordinates, measured menu dimensions, and viewport boundaries:
 * - Horizontal: defaults to placing to the right of cursor; flips left if it would overflow right edge.
 * - Vertical: defaults to placing below cursor; flips above if it would overflow bottom edge (e.g. above player bar).
 * - Ensures a small visual gap from the cursor and clamps strictly inside the visible viewport.
 */

export interface ContextMenuPositionOptions {
  cursorX: number;
  cursorY: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  horizontalGap?: number;
  verticalGap?: number;
  viewportPadding?: number;
  bottomBoundary?: number;
  topBoundary?: number;
  leftBoundary?: number;
  rightBoundary?: number;
}

export interface ContextMenuCalculatedPosition {
  x: number;
  y: number;
  placedAbove: boolean;
  placedLeft: boolean;
}

export function calculateContextMenuPosition(opts: ContextMenuPositionOptions): ContextMenuCalculatedPosition {
  const {
    cursorX,
    cursorY,
    menuWidth,
    menuHeight,
    viewportWidth,
    viewportHeight,
    horizontalGap = 4,
    verticalGap = 4,
    viewportPadding = 8,
    bottomBoundary = viewportHeight,
    topBoundary = 0,
    leftBoundary = 0,
    rightBoundary = viewportWidth,
  } = opts;

  const effectiveMaxBottom = Math.min(viewportHeight - viewportPadding, bottomBoundary - viewportPadding);
  const effectiveMinTop = Math.max(viewportPadding, topBoundary + viewportPadding);
  const effectiveMaxRight = Math.min(viewportWidth - viewportPadding, rightBoundary - viewportPadding);
  const effectiveMinLeft = Math.max(viewportPadding, leftBoundary + viewportPadding);

  // ── Horizontal calculation ──────────────────────────────────────────────────
  // Default: place to the right of cursor
  // If overflowing right edge: place to the left of cursor
  let placedLeft = false;
  let x = cursorX + horizontalGap;

  if (x + menuWidth > effectiveMaxRight) {
    const candidateLeft = cursorX - menuWidth - horizontalGap;
    if (candidateLeft >= effectiveMinLeft || (effectiveMaxRight - cursorX) < (cursorX - effectiveMinLeft)) {
      x = candidateLeft;
      placedLeft = true;
    }
  }

  // Clamp inside horizontal bounds
  x = Math.max(effectiveMinLeft, Math.min(x, effectiveMaxRight - menuWidth));

  // ── Vertical calculation ────────────────────────────────────────────────────
  // Default: place below cursor
  // If overflowing bottom edge (or player bar): place above cursor
  let placedAbove = false;
  let y = cursorY + verticalGap;

  if (y + menuHeight > effectiveMaxBottom) {
    const candidateAbove = cursorY - menuHeight - verticalGap;
    if (candidateAbove >= effectiveMinTop || (effectiveMaxBottom - cursorY) < (cursorY - effectiveMinTop)) {
      y = candidateAbove;
      placedAbove = true;
    }
  }

  // Clamp inside vertical bounds
  y = Math.max(effectiveMinTop, Math.min(y, effectiveMaxBottom - menuHeight));

  return { x, y, placedAbove, placedLeft };
}

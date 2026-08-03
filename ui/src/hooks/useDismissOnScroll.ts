import { useEffect } from 'react';

/**
 * Close a viewport-positioned popover on anything that moves its anchor out
 * from under it — scrolling the grid, resizing the window — rather than
 * leaving it pointing at the wrong row. Capture phase, because a scroll inside
 * an inner scroll box (like `.grid-wrap`) doesn't bubble.
 */
export function useDismissOnScroll(onClose: () => void): void {
  useEffect(() => {
    const bail = () => onClose();
    window.addEventListener('scroll', bail, true);
    window.addEventListener('resize', bail);
    return () => {
      window.removeEventListener('scroll', bail, true);
      window.removeEventListener('resize', bail);
    };
  }, [onClose]);
}

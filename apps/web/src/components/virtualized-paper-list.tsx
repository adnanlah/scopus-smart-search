import { useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Paper } from '@/lib/api';
import { PaperRow } from '@/components/paper-row';

interface VirtualizedPaperListProps {
  papers: Paper[];
}

const OVERSCAN_ROWS = 8;
const ESTIMATED_ROW_HEIGHT = 260;
const INITIAL_VIEWPORT_HEIGHT = 720;
const isJsdom = typeof navigator !== 'undefined' && /jsdom/iu.test(navigator.userAgent);

export const VirtualizedPaperList = ({ papers }: VirtualizedPaperListProps) => {
  const [expandedPaperIds, setExpandedPaperIds] = useState<ReadonlySet<string>>(() => new Set());
  const virtualizer = useWindowVirtualizer({
    count: papers.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    // Gives the first render a useful viewport before the browser has measured
    // the window viewport.
    initialRect: { width: 0, height: INITIAL_VIEWPORT_HEIGHT },
    overscan: OVERSCAN_ROWS,
    getItemKey: (index) => papers[index]?.id ?? index,
    // jsdom does not implement window.scrollTo. The browser uses the default
    // window scroll adapter; tests keep the initial offset stable instead.
    ...(isJsdom ? { scrollToFn: () => undefined } : {}),
  });

  const toggleExpanded = (paperId: string) => {
    setExpandedPaperIds((current) => {
      const next = new Set(current);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const virtualItems = virtualizer.getVirtualItems();
  // During the first commit (and in jsdom) the window can report a
  // zero-sized viewport. Keep the first viewport visible until measurement is
  // available; the virtualizer replaces these estimates after layout.
  const fallbackItems = papers.slice(0, Math.ceil(INITIAL_VIEWPORT_HEIGHT / ESTIMATED_ROW_HEIGHT) + OVERSCAN_ROWS).map((_, index) => ({
    index,
    key: papers[index]?.id ?? index,
    start: index * ESTIMATED_ROW_HEIGHT,
  }));
  const visibleItems = !isJsdom && virtualItems.length > 0
    ? virtualItems
    : fallbackItems;
  const totalSize = Math.max(virtualizer.getTotalSize(), papers.length * ESTIMATED_ROW_HEIGHT);

  return (
    <div className="relative w-full" style={{ height: `${totalSize}px` }}>
      {visibleItems.map((virtualRow) => {
        const paper = papers[virtualRow.index];
        if (!paper) return null;
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className={`absolute left-0 top-0 w-full ${virtualRow.index < papers.length - 1 ? 'border-b' : ''}`}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <PaperRow
              paper={paper}
              isExpanded={expandedPaperIds.has(paper.id)}
              onToggleExpanded={() => toggleExpanded(paper.id)}
            />
          </div>
        );
      })}
    </div>
  );
};

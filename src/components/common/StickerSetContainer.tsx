import type { FC, RefObject, StateHookSetter } from '../../lib/teact/teact';
import React, { memo, useEffect, useRef } from '../../lib/teact/teact';

import {
  EMOJI_SIZE_PICKER,
  STICKER_SIZE_PICKER,
} from '../../config';
import buildClassName from '../../util/buildClassName';

import useAppLayout from '../../hooks/useAppLayout';
import useLastCallback from '../../hooks/useLastCallback';
import useResizeObserver from '../../hooks/useResizeObserver';
import useWindowSize from '../../hooks/window/useWindowSize';

type OwnProps = {
  index: number;
  idPrefix: string;
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  isChatEmojiSet?: boolean;
  setItemsPerRow: StateHookSetter<number>;
  isLocked?: boolean;
  isEmoji?: boolean;
  refOverride?: RefObject<HTMLDivElement | null>;
} & Omit<React.HTMLProps<HTMLDivElement>, 'id'>;

const ITEMS_PER_ROW_FALLBACK = 8;
const ITEMS_MOBILE_PER_ROW_FALLBACK = 7;
const ITEMS_MINI_MOBILE_PER_ROW_FALLBACK = 6;
const MOBILE_WIDTH_THRESHOLD_PX = 440;
const MINI_MOBILE_WIDTH_THRESHOLD_PX = 362;

const StickerSetContainer: FC<OwnProps> = ({
  index,
  idPrefix,
  isSavedMessages,
  isCurrentUserPremium,
  isChatEmojiSet,
  setItemsPerRow,
  isLocked,
  isEmoji,
  children,
  refOverride,
  ...props
}) => {
  // eslint-disable-next-line no-null/no-null, react-hooks/rules-of-hooks
  const ref = refOverride || useRef<HTMLDivElement>(null);

  const { width: windowWidth } = useWindowSize();
  const { isMobile } = useAppLayout();

  const stickerMarginPx = isMobile ? 8 : 4;
  const emojiMarginPx = isMobile ? 8 : 10;

  const itemSize = isEmoji ? EMOJI_SIZE_PICKER : STICKER_SIZE_PICKER;
  const margin = isEmoji ? emojiMarginPx : stickerMarginPx;

  const calculateItemsPerRow = useLastCallback((width: number) => {
    if (!width) {
      return getItemsPerRowFallback(windowWidth);
    }

    return Math.floor((width + margin) / (itemSize + margin));
  });

  const handleResize = useLastCallback((entry: ResizeObserverEntry) => {
    setItemsPerRow(calculateItemsPerRow(entry.contentRect.width));
  });

  useResizeObserver(ref, handleResize);

  useEffect(() => {
    if (!ref.current) return;
    setItemsPerRow(calculateItemsPerRow(ref.current.clientWidth));
  }, [ref, calculateItemsPerRow, setItemsPerRow]);

  return (
    <div
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...props}
      ref={ref}
      id={`${idPrefix}-${index}`}
      className={
        buildClassName('symbol-set', isLocked && 'symbol-set-locked', props.className)
      }
    >
      {children}
    </div>
  );
};

export default memo(StickerSetContainer);

export function getItemsPerRowFallback(windowWidth: number): number {
  return windowWidth > MOBILE_WIDTH_THRESHOLD_PX
    ? ITEMS_PER_ROW_FALLBACK
    : (windowWidth < MINI_MOBILE_WIDTH_THRESHOLD_PX
      ? ITEMS_MINI_MOBILE_PER_ROW_FALLBACK
      : ITEMS_MOBILE_PER_ROW_FALLBACK);
}

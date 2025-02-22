import type { RefObject } from 'react';
import { useEffect } from '../../../../lib/teact/teact';
import { getActions } from '../../../../global';

import type { ApiSticker } from '../../../../api/types';
import type { Signal } from '../../../../util/signals';

import { EMOJI_IMG_REGEX } from '../../../../config';
import { requestNextMutation } from '../../../../lib/fasterdom/fasterdom';
import twemojiRegex from '../../../../lib/twemojiRegex';
import focusEditableElement from '../../../../util/focusEditableElement';
import { getHtmlBeforeSelection } from '../../../../util/selection';
import { IS_EMOJI_SUPPORTED } from '../../../../util/windowEnvironment';
import { buildCustomEmojiHtml } from '../helpers/customEmoji';

import { useThrottledResolver } from '../../../../hooks/useAsyncResolvers';
import useDerivedSignal from '../../../../hooks/useDerivedSignal';
import useDerivedState from '../../../../hooks/useDerivedState';
import useFlag from '../../../../hooks/useFlag';
import useLastCallback from '../../../../hooks/useLastCallback';

const THROTTLE = 300;
const RE_ENDS_ON_EMOJI = new RegExp(`(${twemojiRegex.source})$`, 'g');
const RE_ENDS_ON_EMOJI_IMG = new RegExp(`${EMOJI_IMG_REGEX.source}$`, 'g');

export default function useCustomEmojiTooltip(
  isEnabled: boolean,
  getHtml: Signal<string>,
  getSelectionRange: Signal<Range | undefined>,
  inputRef: RefObject<HTMLDivElement>,
  customEmojis?: ApiSticker[],
) {
  const { loadCustomEmojiForEmoji, clearCustomEmojiForEmoji } = getActions();

  const [isManuallyClosed, markManuallyClosed, unmarkManuallyClosed] = useFlag(false);

  const extractLastEmojiThrottled = useThrottledResolver(() => {
    const html = getHtml();
    if (!isEnabled || !html || !getSelectionRange()?.collapsed) return undefined;

    const hasEmoji = html.match(IS_EMOJI_SUPPORTED ? twemojiRegex : EMOJI_IMG_REGEX);
    if (!hasEmoji) return undefined;

    const htmlBeforeSelection = getHtmlBeforeSelection(inputRef.current!);

    return htmlBeforeSelection.match(IS_EMOJI_SUPPORTED ? RE_ENDS_ON_EMOJI : RE_ENDS_ON_EMOJI_IMG)?.[0];
  }, [getHtml, getSelectionRange, inputRef, isEnabled], THROTTLE);

  const getLastEmoji = useDerivedSignal(
    extractLastEmojiThrottled, [extractLastEmojiThrottled, getHtml, getSelectionRange], true,
  );

  const isActive = useDerivedState(() => Boolean(getLastEmoji()), [getLastEmoji]);
  const hasCustomEmojis = Boolean(customEmojis?.length);

  useEffect(() => {
    if (!isEnabled || !isActive) return;

    const lastEmoji = getLastEmoji();
    if (lastEmoji) {
      if (!hasCustomEmojis) {
        loadCustomEmojiForEmoji({
          emoji: IS_EMOJI_SUPPORTED ? lastEmoji : lastEmoji.match(/.+alt="(.+)"/)?.[1]!,
        });
      }
    } else {
      clearCustomEmojiForEmoji();
    }
  }, [isEnabled, isActive, getLastEmoji, hasCustomEmojis, clearCustomEmojiForEmoji, loadCustomEmojiForEmoji]);

  const insertCustomEmoji = useLastCallback((emoji: ApiSticker) => {
    const lastEmoji = getLastEmoji();
    if (!isEnabled || !lastEmoji) return;

    const inputEl = inputRef.current!;
    const htmlBeforeSelection = getHtmlBeforeSelection(inputEl);
    const regexText = IS_EMOJI_SUPPORTED
      ? lastEmoji
      // Escape regexp special chars
      : lastEmoji.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${regexText})\\1*$`, '');
    const matched = htmlBeforeSelection.match(regex)![0];
    const count = matched.length / lastEmoji.length;

    const selection = window.getSelection()!;
    for (let i = 0; i < count; ++i) {
      selection.modify('extend', 'backward', 'character');
    }
    document.execCommand('insertHTML', false, buildCustomEmojiHtml(emoji).repeat(count));

    requestNextMutation(() => {
      focusEditableElement(inputEl, true, true);
    });
  });

  useEffect(unmarkManuallyClosed, [unmarkManuallyClosed, getHtml]);

  return {
    isCustomEmojiTooltipOpen: Boolean(isActive && hasCustomEmojis && !isManuallyClosed),
    closeCustomEmojiTooltip: markManuallyClosed,
    insertCustomEmoji,
  };
}

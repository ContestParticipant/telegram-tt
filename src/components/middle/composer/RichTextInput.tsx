import type { ChangeEvent, ReactNode, RefObject } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  getIsHeavyAnimating,
  memo, useEffect, useLayoutEffect,
  useRef, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { IAnchorPosition } from '../../../types';
import type { Signal } from '../../../util/signals';
import { type ApiFormattedText, ApiMessageEntityTypes, type ApiSticker } from '../../../api/types';

import { BASE_EMOJI_KEYWORD_LANG } from '../../../config';
import { requestForcedReflow, requestMutation, requestNextMutation } from '../../../lib/fasterdom/fasterdom';
import { selectCanPlayAnimatedEmojis, selectIsCurrentUserPremium } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import captureKeyboardListeners from '../../../util/captureKeyboardListeners';
import { getIsDirectTextInputDisabled } from '../../../util/directInputManager';
import parseEmojiOnlyString from '../../../util/emoji/parseEmojiOnlyString';
import focusEditableElement from '../../../util/focusEditableElement';
import { debounce } from '../../../util/schedulers';
import {
  IS_ANDROID, IS_EMOJI_SUPPORTED, IS_IOS, IS_TOUCH_ENV,
} from '../../../util/windowEnvironment';
import renderText from '../../common/helpers/renderText';
import { getTextWithEntitiesAsHtml } from '../../common/helpers/renderTextWithEntities';
import { isSelectionInsideInput } from './helpers/selection';

import useDerivedState from '../../../hooks/useDerivedState';
import useFlag from '../../../hooks/useFlag';
import useGetSelectionRange from '../../../hooks/useGetSelectionRange';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';
import { useShowCustomEmojiPremiumNotification } from '../../common/hooks/useShowCustomEmojiPremiumNotification';
import useClipboardPaste from './hooks/useClipboardPaste';
import useCustomEmojiTooltip from './hooks/useCustomEmojiTooltip';
import useEmojiTooltip from './hooks/useEmojiTooltip';
import useInputCustomEmojis from './hooks/useInputCustomEmojis';

import CustomEmojiTooltip from './CustomEmojiTooltip';
import EmojiTooltip from './EmojiTooltip';
import TextFormatter from './TextFormatter.async';

import './RichTextInput.scss';

// Focus slows down animation, also it breaks transition layout in Chrome
const FOCUS_DELAY_MS = 350;
const TRANSITION_DURATION_FACTOR = 50;

const SCROLLER_CLASS = 'input-scroller';

type OwnProps = {
  ref?: RefObject<HTMLDivElement>;
  customEmojiPrefix: string;
  inputId: string;
  isActive: boolean;
  getHtml: Signal<string>;
  htmlOverwrite: Signal<string>;
  overwrite: boolean;
  placeholder?: string;
  placeholderComponent?: ReactNode;
  shouldSuppressTextFormatter?: boolean;
  onUpdate: (html: string) => void;
  onScroll?: (event: React.UIEvent<HTMLElement>) => void;
  captionLimit?: number;
  limitIndicator?: string;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
  isNeedPremium?: boolean;
  disableTextFormatter?: boolean;
  isEditable?: boolean;
  maxInputHeight?: number;
  forcedPlaceholder?: string;
  shouldSuppressFocus?: boolean;
  onSuppressedFocus?: () => void;
  containerId?: string;
  onClick?: () => void;
  onKeyDown?: (
    (e: React.KeyboardEvent<HTMLDivElement>) => { processSelection: true } | { closeTextFormatter: true } | void
  );
  isReady?: boolean;
  className?: string;
  singleLine?: boolean;
  label?: string;
  handlePaste?: boolean;
  disabledEntities?: ApiMessageEntityTypes[];
  chatId?: string;
  canUseEmojiTooltip?: boolean;
  canRenderEmojiTooltip?: boolean;
  cannotInsertHtml?: boolean;
  children?: ReactNode;
  canPlayAnimatedEmojis?: boolean;
};

type StateProps = {
  canPlayAnimatedEmojisGlobal: boolean;
  isCurrentUserPremium: boolean;
  recentEmojis: string[];
  customEmojiForEmoji?: ApiSticker[];
  baseEmojiKeywords?: Record<string, string[]>;
  emojiKeywords?: Record<string, string[]>;
};

const TAB_INDEX_PRIORITY_TIMEOUT = 2000;
// Heuristics allowing the user to make a triple click
const SELECTION_RECALCULATE_DELAY_MS = 260;
const TEXT_FORMATTER_SAFE_AREA_PX = 140;
// For some reason Safari inserts `<br>` after user removes text from input
const SAFARI_BR = '<br>';

function clearSelection() {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  if (selection.removeAllRanges) {
    selection.removeAllRanges();
  } else if (selection.empty) {
    selection.empty();
  }
}

const CONTEXT_MENU_CLOSE_DELAY_MS = 100;

const RichTextInput: FC<OwnProps & StateProps> = ({
  ref,
  captionLimit,
  limitIndicator,
  inputId,
  isActive,
  getHtml,
  htmlOverwrite,
  placeholder,
  placeholderComponent,
  shouldSuppressTextFormatter,
  onUpdate,
  onScroll,
  onFocus,
  onBlur,
  isNeedPremium,
  overwrite,
  disableTextFormatter,
  isEditable = true,
  maxInputHeight = Number.POSITIVE_INFINITY,
  forcedPlaceholder,
  shouldSuppressFocus,
  onSuppressedFocus,
  containerId,
  onClick,
  onKeyDown,
  isReady,
  customEmojiPrefix,
  canPlayAnimatedEmojis,
  canPlayAnimatedEmojisGlobal,
  className: className_,
  singleLine,
  label,
  isCurrentUserPremium,
  handlePaste = true,
  disabledEntities,
  customEmojiForEmoji,
  canUseEmojiTooltip,
  chatId,
  canRenderEmojiTooltip = true,
  recentEmojis,
  baseEmojiKeywords,
  emojiKeywords,
  cannotInsertHtml,
  children,
}) => {
  const { addRecentCustomEmoji, addRecentEmoji } = getActions();
  disabledEntities ??= [];
  // eslint-disable-next-line no-null/no-null
  let inputRef = useRef<HTMLDivElement>(null);
  if (ref) {
    inputRef = ref;
  }

  // eslint-disable-next-line no-null/no-null
  const selectionTimeoutRef = useRef<number>(null);
  // eslint-disable-next-line no-null/no-null
  const cloneRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const wrapperRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const scrollerCloneRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const sharedCanvasHqRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line no-null/no-null
  const absoluteContainerRef = useRef<HTMLDivElement>(null);

  const lang = useOldLang();
  const isContextMenuOpenRef = useRef(false);
  const [isTextFormatterOpen, openTextFormatter, closeTextFormatter] = useFlag();
  const [textFormatterAnchorPosition, setTextFormatterAnchorPosition] = useState<IAnchorPosition>();
  const [selectedRange, setSelectedRange] = useState<Range>();
  const [isTextFormatterDisabled, setIsTextFormatterDisabled] = useState<boolean>(false);

  const updateInputHeight = useLastCallback((willSend = false) => {
    requestForcedReflow(() => {
      const scroller = inputRef.current!.closest<HTMLDivElement>(`.${SCROLLER_CLASS}`)!;
      const currentHeight = Number(scroller.style.height.replace('px', ''));
      const clone = scrollerCloneRef.current!;
      const { scrollHeight } = clone;
      const newHeight = Math.min(scrollHeight, maxInputHeight);

      if (newHeight === currentHeight) {
        return undefined;
      }

      const isOverflown = scrollHeight > maxInputHeight;

      function exec() {
        const transitionDuration = Math.round(
          TRANSITION_DURATION_FACTOR * Math.log(Math.abs(newHeight - currentHeight)),
        );
        scroller.style.height = `${newHeight}px`;
        scroller.style.transitionDuration = `${transitionDuration}ms`;
        scroller.classList.toggle('overflown', isOverflown);
      }

      if (willSend) {
        // Delay to next frame to sync with sending animation
        requestMutation(exec);
        return undefined;
      } else {
        return exec;
      }
    });
  });

  useLayoutEffect(() => {
    updateInputHeight(false);
  }, [maxInputHeight]);

  const htmlRef = useRef(htmlOverwrite());
  useLayoutEffect(() => {
    const html = isActive ? htmlOverwrite() : '';

    if (html !== inputRef.current!.innerHTML) {
      inputRef.current!.innerHTML = html;

      updateCloneRef();
      updateInputHeight(!html);
      onUpdate(html);
    }

    if (html !== htmlRef.current) {
      htmlRef.current = html;
    }
  }, [htmlOverwrite, isActive, updateInputHeight, onUpdate, overwrite]);

  // const chatIdRef = useRef(chatId);
  // chatIdRef.current = chatId;
  const focusInput = useLastCallback(() => {
    if (!inputRef.current || isNeedPremium) {
      return;
    }

    if (getIsHeavyAnimating()) {
      setTimeout(focusInput, FOCUS_DELAY_MS);
      return;
    }

    focusEditableElement(inputRef.current!);
  });

  const handleCloseTextFormatter = useLastCallback(() => {
    closeTextFormatter();
    clearSelection();
  });

  function checkSelection() {
    // Disable the formatter on iOS devices for now.
    if (IS_IOS) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || isContextMenuOpenRef.current) {
      closeTextFormatter();
      if (IS_ANDROID) {
        setIsTextFormatterDisabled(false);
      }
      return false;
    }

    const selectionRange = selection.getRangeAt(0);
    const selectedText = selectionRange.toString().trim();
    if (
      shouldSuppressTextFormatter
      || !isSelectionInsideInput(selectionRange, inputId)
      || !selectedText
      || parseEmojiOnlyString(selectedText)
      || !selectionRange.START_TO_END
    ) {
      closeTextFormatter();
      return false;
    }

    return true;
  }

  function processSelection() {
    if (!checkSelection()) {
      return;
    }

    if (isTextFormatterDisabled) {
      return;
    }

    const selectionRange = window.getSelection()!.getRangeAt(0);
    const selectionRect = selectionRange.getBoundingClientRect();
    const scrollerRect = inputRef.current!.closest<HTMLDivElement>(`.${SCROLLER_CLASS}`)!.getBoundingClientRect();

    let x = (selectionRect.left + selectionRect.width / 2) - scrollerRect.left;

    if (x < TEXT_FORMATTER_SAFE_AREA_PX) {
      x = TEXT_FORMATTER_SAFE_AREA_PX;
    } else if (x > scrollerRect.width - TEXT_FORMATTER_SAFE_AREA_PX) {
      x = scrollerRect.width - TEXT_FORMATTER_SAFE_AREA_PX;
    }

    setTextFormatterAnchorPosition({
      x,
      y: selectionRect.top - scrollerRect.top,
    });

    setSelectedRange(selectionRange);
    openTextFormatter();
  }

  function processSelectionWithTimeout() {
    if (selectionTimeoutRef.current) {
      window.clearTimeout(selectionTimeoutRef.current);
    }
    // Small delay to allow browser properly recalculate selection
    selectionTimeoutRef.current = window.setTimeout(processSelection, SELECTION_RECALCULATE_DELAY_MS);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
    }
    updateInputHeight(false);
    if (!onKeyDown) {
      processSelectionWithTimeout();
      return;
    }
    const result = onKeyDown(e);
    if (result && typeof result === 'object') {
      if ('processSelection' in result && result.processSelection) {
        processSelectionWithTimeout();
      } else if ('closeTextFormatter' in result && result.closeTextFormatter) {
        closeTextFormatter();
      }
    }
  }

  function handleChange(e: ChangeEvent<HTMLDivElement>) {
    const { innerHTML, textContent } = e.currentTarget;

    onUpdate(innerHTML === SAFARI_BR ? '' : innerHTML);

    // Reset focus on the input to remove any active styling when input is cleared
    if (
      !IS_TOUCH_ENV
      && (!textContent || !textContent.length)
      // When emojis are not supported, innerHTML contains an emoji img tag that doesn't exist in the textContext
      && !(!IS_EMOJI_SUPPORTED && innerHTML.includes('emoji-small'))
      && !(innerHTML.includes('custom-emoji'))
    ) {
      const selection = window.getSelection()!;
      if (selection) {
        inputRef.current!.blur();
        selection.removeAllRanges();
        focusEditableElement(inputRef.current!, true);
      }
    }

    updateCloneRef();
  }

  function updateCloneRef() {
    if (cloneRef.current!.innerHTML !== inputRef.current!.innerHTML) {
      cloneRef.current!.innerHTML = inputRef.current!.innerHTML;
    }
  }

  function handleAndroidContextMenu(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (!checkSelection()) {
      return;
    }

    setIsTextFormatterDisabled(!isTextFormatterDisabled);

    if (!isTextFormatterDisabled) {
      e.preventDefault();
      e.stopPropagation();

      processSelection();
    } else {
      closeTextFormatter();
    }
  }

  useEffect(() => {
    const captureFirstTab = debounce((e: KeyboardEvent) => {
      if (e.key === 'Tab' && !getIsDirectTextInputDisabled()) {
        e.preventDefault();
        requestMutation(focusInput);
      }
    }, TAB_INDEX_PRIORITY_TIMEOUT, true, false);

    return captureKeyboardListeners({ onTab: captureFirstTab });
  }, [focusInput]);

  const isTouched = useDerivedState(() => Boolean(isActive && getHtml()), [isActive, getHtml]);

  useEffect(() => {
    const input = inputRef.current!;

    function suppressFocus() {
      input.blur();
    }

    if (shouldSuppressFocus) {
      input.addEventListener('focus', suppressFocus);
    }

    return () => {
      input.removeEventListener('focus', suppressFocus);
    };
  }, [shouldSuppressFocus]);

  const className = buildClassName(
    'form-control allow-selection',
    isTouched && 'touched',
    shouldSuppressFocus && 'focus-disabled',
    singleLine && 'single-line',
  );

  const inputScrollerContentClass = buildClassName('input-scroller-content', isNeedPremium && 'is-need-premium');

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (e.button !== 2) {
      wrapperRef.current?.addEventListener('mouseup', processSelectionWithTimeout, { once: true });
      return;
    }

    if (isContextMenuOpenRef.current) {
      return;
    }

    isContextMenuOpenRef.current = true;

    function handleCloseContextMenu(e2: KeyboardEvent | MouseEvent) {
      if (e2 instanceof KeyboardEvent && e2.key !== 'Esc' && e2.key !== 'Escape') {
        return;
      }

      setTimeout(() => {
        isContextMenuOpenRef.current = false;
      }, CONTEXT_MENU_CLOSE_DELAY_MS);

      window.removeEventListener('keydown', handleCloseContextMenu);
      window.removeEventListener('mousedown', handleCloseContextMenu);
    }

    document.addEventListener('mousedown', handleCloseContextMenu);
    document.addEventListener('keydown', handleCloseContextMenu);
  }

  useInputCustomEmojis(
    getHtml,
    inputRef,
    sharedCanvasRef,
    sharedCanvasHqRef,
    absoluteContainerRef,
    customEmojiPrefix,
    !!(canPlayAnimatedEmojis && canPlayAnimatedEmojisGlobal),
    isReady,
    isActive,
  );

  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    const input = inputRef.current;
    function handleFocus() {
      setIsFocused(true);
    }
    function handleBlur() {
      setIsFocused(false);
    }

    input?.addEventListener('focus', handleFocus);
    input?.addEventListener('blur', handleBlur);
    if (input) {
      setIsFocused(document.activeElement === input);
    }
    return () => [
      input?.removeEventListener('focus', handleFocus),
      input?.removeEventListener('blur', handleBlur),
    ];
  }, [inputRef]);

  const insertHtmlAndUpdateCursor = useLastCallback((newHtml: string, inInputId: string = inputId) => {
    if (inInputId === inputId && cannotInsertHtml) return;
    if (disabledEntities.length) {
      newHtml = removeDisabledEntities(newHtml, disabledEntities);
    }
    const messageInput = document.getElementById(inInputId) as HTMLDivElement;

    document.execCommand('insertHTML', false, newHtml);
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));

    // If selection is outside of input, set cursor at the end of input
    requestNextMutation(() => {
      focusEditableElement(messageInput);
    });
  });

  const insertFormattedTextAndUpdateCursor = useLastCallback((
    text: ApiFormattedText, inInputId: string = inputId,
  ) => {
    const newHtml = getTextWithEntitiesAsHtml(text);
    insertHtmlAndUpdateCursor(newHtml, inInputId);
  });

  const showCustomEmojiPremiumNotification = useShowCustomEmojiPremiumNotification();
  const hook: typeof useClipboardPaste = handlePaste ? useClipboardPaste : () => {};
  hook(
    inputId,
    isActive,
    insertFormattedTextAndUpdateCursor,
    () => {},
    () => {},
    undefined,
    !isCurrentUserPremium,
    showCustomEmojiPremiumNotification,
  );

  const getSelectionRange = useGetSelectionRange(`#${inputId}`);

  const {
    isEmojiTooltipOpen,
    closeEmojiTooltip,
    filteredEmojis,
    filteredCustomEmojis,
    insertEmoji,
  } = useEmojiTooltip(
    Boolean(isReady && canUseEmojiTooltip),
    getHtml,
    inputId,
    recentEmojis,
    baseEmojiKeywords,
    emojiKeywords,
  );

  const {
    isCustomEmojiTooltipOpen,
    closeCustomEmojiTooltip,
    insertCustomEmoji,
  } = useCustomEmojiTooltip(
    Boolean(isReady && canUseEmojiTooltip),
    getHtml,
    getSelectionRange,
    inputRef,
    customEmojiForEmoji,
  );

  return (
    <div
      id={containerId}
      ref={wrapperRef}
      className={buildClassName(
        'rich-text-input input-group',
        className_,
        label && 'with-label',
        (isTouched || isFocused) && 'touched',
      )}
      onClick={shouldSuppressFocus ? onSuppressedFocus : undefined}
      dir={lang.isRtl ? 'rtl' : undefined}
    >
      <div
        className={buildClassName('custom-scroll', SCROLLER_CLASS, isNeedPremium && 'is-need-premium')}
        onScroll={onScroll}
        onClick={onClick}
      >
        <div className={inputScrollerContentClass}>
          <div
            ref={inputRef}
            id={inputId}
            className={className}
            contentEditable={isEditable}
            role="textbox"
            dir="auto"
            tabIndex={0}
            onClick={focusInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onMouseDown={handleMouseDown}
            onContextMenu={IS_ANDROID ? handleAndroidContextMenu : undefined}
            onTouchCancel={IS_ANDROID ? processSelectionWithTimeout : undefined}
            aria-label={placeholder}
            onFocus={!isNeedPremium ? onFocus : undefined}
            onBlur={!isNeedPremium ? onBlur : undefined}
          />
          {!forcedPlaceholder && (
            <span
              className={buildClassName(
                'placeholder-text',
                isNeedPremium && 'is-need-premium',
              )}
              dir="auto"
            >
              {placeholderComponent ?? placeholder}
            </span>
          )}
          <canvas ref={sharedCanvasRef} className="shared-canvas" />
          <canvas ref={sharedCanvasHqRef} className="shared-canvas" />
          <div ref={absoluteContainerRef} className="absolute-video-container" />
        </div>
      </div>
      {label && (
        <label htmlFor={inputId}>{label}</label>
      )}
      <div
        ref={scrollerCloneRef}
        className={buildClassName('custom-scroll',
          SCROLLER_CLASS,
          'clone',
          isNeedPremium && 'is-need-premium')}
      >
        <div className={inputScrollerContentClass}>
          <div ref={cloneRef} className={buildClassName(className, 'clone')} dir="auto" />
        </div>
      </div>
      {(captionLimit !== undefined || limitIndicator !== undefined) && (
        <div className="max-length-indicator" dir="auto">
          {captionLimit || limitIndicator}
        </div>
      )}
      {!disableTextFormatter && (
        <TextFormatter
          isOpen={isTextFormatterOpen}
          anchorPosition={textFormatterAnchorPosition}
          selectedRange={selectedRange}
          setSelectedRange={setSelectedRange}
          onClose={handleCloseTextFormatter}
          input={inputRef.current || undefined}
          getHtml={getHtml}
          disabledEntities={disabledEntities}
        />
      )}
      {forcedPlaceholder && <span className="forced-placeholder">{renderText(forcedPlaceholder!)}</span>}
      {canRenderEmojiTooltip && (
        <>
          <CustomEmojiTooltip
            key={`custom-emoji-tooltip-${inputId}`}
            chatId={chatId}
            isOpen={isCustomEmojiTooltipOpen}
            onCustomEmojiSelect={insertCustomEmoji}
            addRecentCustomEmoji={addRecentCustomEmoji}
            onClose={closeCustomEmojiTooltip}
          />
          <EmojiTooltip
            key={`emoji-tooltip-${inputId}`}
            isOpen={isEmojiTooltipOpen}
            emojis={filteredEmojis}
            customEmojis={filteredCustomEmojis}
            addRecentEmoji={addRecentEmoji}
            addRecentCustomEmoji={addRecentCustomEmoji}
            onEmojiSelect={insertEmoji}
            onCustomEmojiSelect={insertEmoji}
            onClose={closeEmojiTooltip}
          />
        </>
      )}
      {children}
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const { language } = global.settings.byKey;
    const isCurrentUserPremium = selectIsCurrentUserPremium(global);
    const baseEmojiKeywords = global.emojiKeywords[BASE_EMOJI_KEYWORD_LANG];
    const emojiKeywords = language !== BASE_EMOJI_KEYWORD_LANG ? global.emojiKeywords[language] : undefined;
    return {
      canPlayAnimatedEmojisGlobal: selectCanPlayAnimatedEmojis(global),
      isCurrentUserPremium,
      recentEmojis: global.recentEmojis,
      customEmojiForEmoji: global.customEmojis.forEmoji.stickers,
      baseEmojiKeywords: baseEmojiKeywords?.keywords,
      emojiKeywords: emojiKeywords?.keywords,

    };
  },
)(RichTextInput));

const entityTypeToSelctorMap: Record<string, string> = {
  [ApiMessageEntityTypes.Bold]: 'b',
  [ApiMessageEntityTypes.Code]: 'code',
  [ApiMessageEntityTypes.Italic]: 'i',
  [ApiMessageEntityTypes.Pre]: 'pre',
  [ApiMessageEntityTypes.Url]: 'a',
  [ApiMessageEntityTypes.Underline]: 'u',
  [ApiMessageEntityTypes.Spoiler]: 'span.spoiler',
  [ApiMessageEntityTypes.CustomEmoji]: 'img.custom-emoji',
};
function removeDisabledEntities(html: string, disabledEntities: ApiMessageEntityTypes[]) {
  disabledEntities = Array.from(new Set(disabledEntities));
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  for (const disabledEntity of disabledEntities) {
    const selector = entityTypeToSelctorMap[disabledEntity];
    if (!selector) {
      continue;
    }
    let found = true;
    do {
      found = false;
      for (const match of body.querySelectorAll(selector)) {
        match.replaceWith(...match.childNodes);
        found = true;
      }
    } while (found);
  }
  return body.innerHTML;
}

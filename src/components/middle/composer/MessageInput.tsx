import type { RefObject } from 'react';
import type { FC } from '../../../lib/teact/teact';
import React, {
  getIsHeavyAnimating,
  memo,
  useEffect,
  useMemo,
  useRef, useState,
} from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type { ApiInputMessageReplyInfo } from '../../../api/types';
import type { ISettings, ThreadId } from '../../../types';
import type { Signal } from '../../../util/signals';

import { EDITABLE_INPUT_ID } from '../../../config';
import { selectDraft, selectIsInSelectMode } from '../../../global/selectors';
import { getIsDirectTextInputDisabled } from '../../../util/directInputManager';
import focusEditableElement from '../../../util/focusEditableElement';
import { IS_ANDROID, IS_IOS, IS_TOUCH_ENV } from '../../../util/windowEnvironment';

import useAppLayout from '../../../hooks/useAppLayout';
import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import TextTimer from '../../ui/TextTimer';
import RichTextInput from './RichTextInput';

// Focus slows down animation, also it breaks transition layout in Chrome
const FOCUS_DELAY_MS = 350;

type OwnProps = {
  ref?: RefObject<HTMLDivElement>;
  id: string;
  chatId: string;
  threadId: ThreadId;
  isAttachmentModalInput?: boolean;
  isStoryInput?: boolean;
  customEmojiPrefix: string;
  editableInputId?: string;
  isReady: boolean;
  isActive: boolean;
  getHtml: Signal<string>;
  htmlOverwrite: Signal<string>;
  overwrite: boolean;
  placeholder: string;
  timedPlaceholderLangKey?: string;
  timedPlaceholderDate?: number;
  forcedPlaceholder?: string;
  noFocusInterception?: boolean;
  canAutoFocus: boolean;
  shouldSuppressFocus?: boolean;
  shouldSuppressTextFormatter?: boolean;
  canSendPlainText?: boolean;
  onUpdate: (html: string) => void;
  onSuppressedFocus?: () => void;
  onSend: () => void;
  onScroll?: (event: React.UIEvent<HTMLElement>) => void;
  captionLimit?: number;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
  isNeedPremium?: boolean;
  cannotInsertHtml?: boolean;
};

type StateProps = {
  replyInfo?: ApiInputMessageReplyInfo;
  isSelectModeActive?: boolean;
  messageSendKeyCombo?: ISettings['messageSendKeyCombo'];
};

const MAX_ATTACHMENT_MODAL_INPUT_HEIGHT = 160;
const MAX_STORY_MODAL_INPUT_HEIGHT = 128;
// For some reason Safari inserts `<br>` after user removes text from input
const IGNORE_KEYS = [
  'Esc', 'Escape', 'Enter', 'PageUp', 'PageDown', 'Meta', 'Alt', 'Ctrl', 'ArrowDown', 'ArrowUp', 'Control', 'Shift',
];

const MessageInput: FC<OwnProps & StateProps> = ({
  ref,
  id,
  chatId,
  captionLimit,
  isAttachmentModalInput,
  isStoryInput,
  customEmojiPrefix,
  editableInputId,
  isReady,
  isActive,
  getHtml,
  htmlOverwrite,
  placeholder,
  timedPlaceholderLangKey,
  timedPlaceholderDate,
  forcedPlaceholder,
  canSendPlainText,
  canAutoFocus,
  noFocusInterception,
  shouldSuppressFocus,
  shouldSuppressTextFormatter,
  replyInfo,
  isSelectModeActive,
  messageSendKeyCombo,
  onUpdate,
  onSuppressedFocus,
  onSend,
  onScroll,
  onFocus,
  onBlur,
  isNeedPremium,
  overwrite,
  cannotInsertHtml,
}) => {
  const {
    editLastMessage,
    replyToNextMessage,
    showAllowedMessageTypesNotification,
    openPremiumModal,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  let inputRef = useRef<HTMLDivElement>(null);
  if (ref) {
    inputRef = ref;
  }

  const lang = useOldLang();
  const { isMobile } = useAppLayout();
  const isMobileDevice = isMobile && (IS_IOS || IS_ANDROID);

  const [shouldDisplayTimer, setShouldDisplayTimer] = useState(false);

  useEffect(() => {
    setShouldDisplayTimer(Boolean(timedPlaceholderLangKey && timedPlaceholderDate));
  }, [timedPlaceholderDate, timedPlaceholderLangKey]);

  const handleTimerEnd = useLastCallback(() => {
    setShouldDisplayTimer(false);
  });

  const maxInputHeight = useMemo(
    () => (
      isAttachmentModalInput
        ? MAX_ATTACHMENT_MODAL_INPUT_HEIGHT
        : isStoryInput ? MAX_STORY_MODAL_INPUT_HEIGHT : (isMobile ? 256 : 416)
    ),
    [isAttachmentModalInput, isStoryInput, isMobile],
  );

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

  const handleKeyDown = useLastCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): { processSelection: true } | { closeTextFormatter: true } | undefined => {
    // https://levelup.gitconnected.com/javascript-events-handlers-keyboard-and-load-events-1b3e46a6b0c3#1960
      const { isComposing } = e;

      const html = getHtml();
      if (!isComposing && !html && (e.metaKey || e.ctrlKey)) {
        const targetIndexDelta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : undefined;
        if (targetIndexDelta) {
          e.preventDefault();

          replyToNextMessage({ targetIndexDelta });
          return undefined;
        }
      }

      if (!isComposing && e.key === 'Enter' && !e.shiftKey) {
        if (
          !isMobileDevice
          && (
            (messageSendKeyCombo === 'enter' && !e.shiftKey)
          || (messageSendKeyCombo === 'ctrl-enter' && (e.ctrlKey || e.metaKey))
          )
        ) {
          e.preventDefault();

          onSend();
          return { closeTextFormatter: true };
        }
      } else if (!isComposing && e.key === 'ArrowUp' && !html && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        editLastMessage();
      }

      return { processSelection: true };
    },
  );

  const handleClick = useLastCallback(() => {
    if (isAttachmentModalInput || canSendPlainText || (isStoryInput && isNeedPremium)) return;
    showAllowedMessageTypesNotification({ chatId });
  });

  const handleOpenPremiumModal = useLastCallback(() => openPremiumModal());

  useEffect(() => {
    if (IS_TOUCH_ENV) {
      return;
    }

    if (canAutoFocus) {
      focusInput();
    }
  }, [chatId, focusInput, replyInfo, canAutoFocus]);

  useEffect(() => {
    if (
      !chatId
      || editableInputId !== EDITABLE_INPUT_ID
      || noFocusInterception
      || isMobileDevice
      || isSelectModeActive
    ) {
      return undefined;
    }

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (getIsDirectTextInputDisabled()) {
        return;
      }

      const { key } = e;
      const target = e.target as HTMLElement | undefined;

      if (!target || IGNORE_KEYS.includes(key)) {
        return;
      }

      const input = inputRef.current!;
      const isSelectionCollapsed = document.getSelection()?.isCollapsed;

      if (
        ((key.startsWith('Arrow') || (e.shiftKey && key === 'Shift')) && !isSelectionCollapsed)
        || (e.code === 'KeyC' && (e.ctrlKey || e.metaKey) && target.tagName !== 'INPUT')
      ) {
        return;
      }

      if (
        input
        && target !== input
        && target.tagName !== 'INPUT'
        && target.tagName !== 'TEXTAREA'
        && !target.isContentEditable
      ) {
        focusEditableElement(input, true, true);

        const newEvent = new KeyboardEvent(e.type, e as any);
        input.dispatchEvent(newEvent);
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [chatId, editableInputId, isMobileDevice, isSelectModeActive, noFocusInterception]);

  return (
    <RichTextInput
      ref={ref}
      customEmojiPrefix={customEmojiPrefix}
      isReady={isReady}
      containerId={id}
      captionLimit={captionLimit}
      inputId={editableInputId || EDITABLE_INPUT_ID}
      isActive={isActive}
      getHtml={getHtml}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      htmlOverwrite={htmlOverwrite}
      placeholder={placeholder}
      placeholderComponent={(
        <>
          {!isAttachmentModalInput && !canSendPlainText
                && <Icon name="lock-badge" className="placeholder-icon" />}
          {shouldDisplayTimer ? (
            <TextTimer langKey={timedPlaceholderLangKey!} endsAt={timedPlaceholderDate!} onEnd={handleTimerEnd} />
          ) : placeholder}
          {isStoryInput && isNeedPremium && (
            <Button className="unlock-button" size="tiny" color="adaptive" onClick={handleOpenPremiumModal}>
              {lang('StoryRepliesLockedButton')}
            </Button>
          )}
        </>
      )}
      shouldSuppressTextFormatter={shouldSuppressTextFormatter}
      onUpdate={onUpdate}
      onScroll={onScroll}
      onFocus={onFocus}
      onBlur={onBlur}
      isNeedPremium={isNeedPremium}
      overwrite={overwrite}
      cannotInsertHtml={cannotInsertHtml}
      isEditable={isAttachmentModalInput || canSendPlainText}
      maxInputHeight={maxInputHeight}
      forcedPlaceholder={forcedPlaceholder}
      shouldSuppressFocus={shouldSuppressFocus}
      onSuppressedFocus={onSuppressedFocus}
      handlePaste={false}
      chatId={chatId}
      canRenderEmojiTooltip={false}
    />
  );
};

export default memo(withGlobal<OwnProps>(
  (global, { chatId, threadId }: OwnProps): StateProps => {
    const { messageSendKeyCombo } = global.settings.byKey;

    return {
      messageSendKeyCombo,
      replyInfo: chatId && threadId ? selectDraft(global, chatId, threadId)?.replyInfo : undefined,
      isSelectModeActive: selectIsInSelectMode(global),
    };
  },
)(MessageInput));

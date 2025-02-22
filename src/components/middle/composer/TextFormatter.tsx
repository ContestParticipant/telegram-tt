import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useRef, useState,
} from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type { IAnchorPosition } from '../../../types';
import type { Signal } from '../../../util/signals';
import { ApiMessageEntityTypes } from '../../../api/types';

import { EDITABLE_INPUT_ID } from '../../../config';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { ensureProtocol } from '../../../util/ensureProtocol';
import getKeyFromEvent from '../../../util/getKeyFromEvent';
import stopEvent from '../../../util/stopEvent';
import { IS_SAFARI } from '../../../util/windowEnvironment';
import { INPUT_CUSTOM_EMOJI_SELECTOR } from './helpers/customEmoji';
import { getSelectedBlockquote } from './helpers/getSelectedBlockquote';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useShowTransitionDeprecated from '../../../hooks/useShowTransitionDeprecated';
import useVirtualBackdrop from '../../../hooks/useVirtualBackdrop';

import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';

import './TextFormatter.scss';

export type OwnProps = {
  isOpen: boolean;
  anchorPosition?: IAnchorPosition;
  selectedRange?: Range;
  setSelectedRange: (range: Range) => void;
  onClose: () => void;
  input?: HTMLDivElement;
  getHtml: Signal<string>;
  disabledEntities?: ApiMessageEntityTypes[];
};

interface ISelectedTextFormats {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  monospace?: boolean;
  spoiler?: boolean;
  quote?: boolean;
}

const TEXT_FORMAT_BY_TAG_NAME: Record<string, keyof ISelectedTextFormats> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  DEL: 'strikethrough',
  CODE: 'monospace',
  SPAN: 'spoiler',
  BLOCKQUOTE: 'quote',
};
const fragmentEl = document.createElement('div');

function recursivelyHasOneChild(node: Node | undefined) {
  do {
    if (!node) {
      return true;
    }
    if (node.childNodes.length > 1) {
      return false;
    }
    node = node.childNodes[0];
  } while (node);
  return true;
}

function reloadBlockquotes(parent: HTMLDivElement) {
  for (const blockquote of parent.querySelectorAll('blockquote')) {
    const lines = blockquote.offsetHeight / parseInt(getComputedStyle(blockquote).lineHeight, 10);
    blockquote.dataset.collapsible = lines > 3 ? '1' : '0';
  }
}

const TextFormatter: FC<OwnProps> = ({
  isOpen,
  anchorPosition,
  selectedRange,
  setSelectedRange,
  onClose,
  input,
  getHtml,
  disabledEntities,
}) => {
  const canRenderSpoiler = !disabledEntities?.includes(ApiMessageEntityTypes.Spoiler);
  const canRenderBlockquote = !disabledEntities?.includes(ApiMessageEntityTypes.Blockquote);
  const canRenderBold = !disabledEntities?.includes(ApiMessageEntityTypes.Bold);
  const canRenderItalic = !disabledEntities?.includes(ApiMessageEntityTypes.Italic);
  const canRenderUnderline = !disabledEntities?.includes(ApiMessageEntityTypes.Underline);
  const canRenderStrikethrough = !disabledEntities?.includes(ApiMessageEntityTypes.Strike);
  const canRenderMonospace = !disabledEntities?.includes(ApiMessageEntityTypes.Code);
  const canRenderLink = !disabledEntities?.includes(ApiMessageEntityTypes.Url);
  const canRenderExceptSpoilerAndLink = canRenderBlockquote
   || canRenderBold
   || canRenderItalic
   || canRenderUnderline
   || canRenderStrikethrough
   || canRenderMonospace;
  const isTextFormatterUseless = !canRenderSpoiler && !canRenderLink && !canRenderExceptSpoilerAndLink;

  // eslint-disable-next-line no-null/no-null
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-null/no-null
  const linkUrlInputRef = useRef<HTMLInputElement>(null);
  const { shouldRender, transitionClassNames } = useShowTransitionDeprecated(isOpen);
  const [isLinkControlOpen, originalOpenLinkControl, closeLinkControl] = useFlag();
  const openLinkControl = useLastCallback(() => {
    if (canRenderLink) {
      originalOpenLinkControl();
    }
  });
  const [linkUrl, setLinkUrl] = useState('');
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [inputClassName, setInputClassName] = useState<string | undefined>();
  const [selectedTextFormats, setSelectedTextFormats] = useState<ISelectedTextFormats>({});
  const lang = useLang();

  useEffect(() => (isOpen ? captureEscKeyListener(onClose) : undefined), [isOpen, onClose]);
  useVirtualBackdrop(
    isOpen,
    containerRef,
    onClose,
    true,
  );

  useEffect(() => {
    if (isLinkControlOpen) {
      linkUrlInputRef.current!.focus();
    } else {
      setLinkUrl('');
      setIsEditingLink(false);
    }
  }, [isLinkControlOpen]);

  useEffect(() => {
    if (!input) {
      return;
    }
    reloadBlockquotes(input);
  }, [input, getHtml]);

  useEffect(() => {
    if (!shouldRender) {
      closeLinkControl();
      setSelectedTextFormats({});
      setInputClassName(undefined);
    }
  }, [closeLinkControl, shouldRender]);

  const getSelectedElementOfType = useLastCallback((type: string, range: Range | undefined = selectedRange) => {
    if (!range) {
      return undefined;
    }

    let element: Node | undefined = range.commonAncestorContainer;
    while (element && (!(element instanceof HTMLElement) || element?.tagName !== type)) {
      if (type === 'BLOCKQUOTE' || recursivelyHasOneChild(element)) {
        if (!(element instanceof HTMLElement) || element.tagName !== type) {
          for (const node of element.childNodes) {
            if (node instanceof HTMLElement && node.tagName === type) {
              element = node;
            }
          }
        }
      }
      if (!(element instanceof HTMLElement) || element.tagName !== type) {
        element = element?.parentElement || undefined;
        if (element instanceof HTMLElement && element?.id === EDITABLE_INPUT_ID) {
          element = undefined;
        }
      } else {
        break;
      }
    }

    if (!(element instanceof HTMLElement) || element.tagName !== type || element.id === EDITABLE_INPUT_ID) {
      return undefined;
    }
    return element;
  });

  useEffect(() => {
    if (!isOpen || !selectedRange) {
      return;
    }

    const selectedFormats: ISelectedTextFormats = {};
    for (const tagName of Object.keys(TEXT_FORMAT_BY_TAG_NAME)) {
      const entityType = TEXT_FORMAT_BY_TAG_NAME[tagName];
      const element = getSelectedElementOfType(tagName);
      if (!element) {
        continue;
      }
      if (entityType === 'spoiler'
        && (
          !element.classList.contains('spoiler') || element.dataset['entity-type'] !== ApiMessageEntityTypes.Spoiler)) {
        continue;
      }
      selectedFormats[entityType] = true;
    }

    setSelectedTextFormats(selectedFormats);
  }, [isOpen, selectedRange, openLinkControl]);

  const dispatchInput = useLastCallback(() => {
    input?.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  });

  const { showNotification } = getActions();

  const restoreSelection = useLastCallback(() => {
    if (!selectedRange) {
      return;
    }

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  });

  const updateSelectedRange = useLastCallback(() => {
    const selection = window.getSelection();
    if (selection) {
      setSelectedRange(selection.getRangeAt(0));
    }
  });

  const getSelectedText = useLastCallback((shouldDropCustomEmoji?: boolean) => {
    if (!selectedRange) {
      return undefined;
    }
    fragmentEl.replaceChildren(selectedRange.cloneContents());
    if (shouldDropCustomEmoji) {
      fragmentEl.querySelectorAll(INPUT_CUSTOM_EMOJI_SELECTOR).forEach((el) => {
        el.replaceWith(el.getAttribute('alt')!);
      });
    }
    return fragmentEl.innerHTML;
  });

  const getSelectedElement = useLastCallback(() => {
    if (!selectedRange) {
      return undefined;
    }

    return selectedRange.commonAncestorContainer.parentElement;
  });

  const isBlockquoteSelected = useLastCallback(() => {
    if (!selectedRange) {
      return undefined;
    }

    return getSelectedBlockquote();
  });

  function updateInputStyles() {
    const linkInput = linkUrlInputRef.current;
    if (!linkInput) {
      return;
    }

    const { offsetWidth, scrollWidth, scrollLeft } = linkInput;
    if (scrollWidth <= offsetWidth) {
      setInputClassName(undefined);
      return;
    }

    let className = '';
    if (scrollLeft < scrollWidth - offsetWidth) {
      className = 'mask-right';
    }
    if (scrollLeft > 0) {
      className += ' mask-left';
    }

    setInputClassName(className);
  }

  function handleLinkUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLinkUrl(e.target.value);
    updateInputStyles();
  }

  function getFormatButtonClassName(key: keyof ISelectedTextFormats) {
    if (selectedTextFormats[key]) {
      return 'active';
    }

    if (key === 'monospace' || key === 'strikethrough') {
      if (Object.keys(selectedTextFormats).some(
        (fKey) => fKey !== key && Boolean(selectedTextFormats[fKey as keyof ISelectedTextFormats]),
      )) {
        return 'disabled';
      }
    } else if (selectedTextFormats.monospace || selectedTextFormats.strikethrough) {
      return 'disabled';
    }

    return undefined;
  }

  const handleSpoilerText = useLastCallback(() => {
    if (selectedTextFormats.spoiler) {
      const element = getSelectedElement();
      if (
        !selectedRange
        || !element
        || element.dataset.entityType !== ApiMessageEntityTypes.Spoiler
        || !element.textContent
      ) {
        return;
      }

      element.replaceWith(element.textContent);
      setSelectedTextFormats((selectedFormats) => ({
        ...selectedFormats,
        spoiler: false,
      }));

      return;
    }

    const text = getSelectedText();
    document.execCommand(
      'insertHTML', false, `<span class="spoiler" data-entity-type="${ApiMessageEntityTypes.Spoiler}">${text}</span>`,
    );
    onClose();
  });

  useEffect(() => {
    function isAtEnd() {
      const selection = window.getSelection();
      if (!selection) {
        return false;
      }
      const firstOffset = selection.focusOffset;
      selection.modify('move', 'forward', 'character');
      if (firstOffset === selection.focusOffset) {
        return true;
      } else {
        selection.modify('move', 'backward', 'character');
        return false;
      }
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown' || (e.shiftKey && e.key === 'Enter' && IS_SAFARI)) {
        if (IS_SAFARI || isAtEnd()) {
          const blockquote = isBlockquoteSelected();
          if (!blockquote) {
            return;
          }
          if (IS_SAFARI) {
            e.preventDefault();
          }
          const range = document.createRange();
          const br = document.createElement('br');
          blockquote.after(br);
          setTimeout(() => {
            const selection = window.getSelection();
            if (!selection) {
              return;
            }
            range.setStartAfter(br);
            range.setEndAfter(br);
            selection.removeAllRanges();
            selection.addRange(range);
          });
        }
      }
    }

    input?.addEventListener('keydown', onKeydown);
    return () => input?.removeEventListener('keydown', onKeydown);
  }, [input]);

  useEffect(() => {
    function checkIconClick(e: MouseEvent, quote: HTMLQuoteElement) {
      const rect = quote.getBoundingClientRect();
      const ex = e.clientX;
      const ey = e.clientY;
      const elementWidth = 20;
      const elementHeight = 20;
      if (ex > (rect.right - elementWidth) && ex < rect.right && ey > rect.top && ey < (rect.top + elementHeight)) {
        return true;
      }

      return false;
    }

    function onClick(e: MouseEvent) {
      if (!(e.target instanceof HTMLQuoteElement)) {
        return;
      }
      if (e.target.dataset.collapsible !== '1') {
        return;
      }
      if (!checkIconClick(e, e.target)) {
        return;
      }
      e.target.dataset.collapsed = e.target.dataset.collapsed === '1' ? '0' : '1';

      showNotification({
        message: e.target.dataset.collapsed === '1' ? lang('QuoteCollapsed') : lang('QuoteVisible'),
        localId: 'quote',
      });
      setTimeout(dispatchInput);
    }

    input?.addEventListener('click', onClick);
    return () => input?.removeEventListener('click', onClick);
  }, [input, dispatchInput, lang]);

  const handleBoldText = useLastCallback(() => {
    if (!canRenderBold) return;
    setSelectedTextFormats((selectedFormats) => {
      // Somehow re-applying 'bold' command to already bold text doesn't work
      document.execCommand(selectedFormats.bold ? 'removeFormat' : 'bold');
      Object.keys(selectedFormats).forEach((key) => {
        if ((key === 'italic' || key === 'underline') && Boolean(selectedFormats[key])) {
          document.execCommand(key);
        }
      });

      updateSelectedRange();
      return {
        ...selectedFormats,
        bold: !selectedFormats.bold,
      };
    });
  });

  const handleItalicText = useLastCallback(() => {
    if (!canRenderItalic) return;
    document.execCommand('italic');
    updateSelectedRange();
    setSelectedTextFormats((selectedFormats) => ({
      ...selectedFormats,
      italic: !selectedFormats.italic,
    }));
  });

  const handleUnderlineText = useLastCallback(() => {
    if (!canRenderUnderline) return;
    document.execCommand('underline');
    updateSelectedRange();
    setSelectedTextFormats((selectedFormats) => ({
      ...selectedFormats,
      underline: !selectedFormats.underline,
    }));
  });

  const handleStrikethroughText = useLastCallback(() => {
    if (!canRenderStrikethrough) return;
    if (selectedTextFormats.strikethrough) {
      const element = getSelectedElement();
      if (
        !selectedRange
        || !element
        || element.tagName !== 'DEL'
        || !element.textContent
      ) {
        return;
      }

      element.replaceWith(element.textContent);
      setSelectedTextFormats((selectedFormats) => ({
        ...selectedFormats,
        strikethrough: false,
      }));

      return;
    }

    const text = getSelectedText();
    document.execCommand('insertHTML', false, `<del>${text}</del>`);
    onClose();
  });

  const handleMonospaceText = useLastCallback(() => {
    if (!canRenderMonospace) return;
    if (selectedTextFormats.monospace) {
      const element = getSelectedElement();
      if (
        !selectedRange
        || !element
        || element.tagName !== 'CODE'
        || !element.textContent
      ) {
        return;
      }

      element.replaceWith(element.textContent);
      setSelectedTextFormats((selectedFormats) => ({
        ...selectedFormats,
        monospace: false,
      }));

      dispatchInput();
      return;
    }

    const text = getSelectedText(true);
    document.execCommand('insertHTML', false, `<code class="text-entity-code" dir="auto">${text}</code>`);
    onClose();
  });

  const handleQuoteText = useLastCallback(() => {
    if (!canRenderBlockquote) return;
    if (selectedTextFormats.quote) {
      const element = getSelectedElementOfType('BLOCKQUOTE');
      if (
        !selectedRange
        || !element
        || element.tagName !== 'BLOCKQUOTE'
      ) {
        return;
      }

      element.replaceWith(document.createRange().createContextualFragment(element.innerHTML || ''));

      setSelectedTextFormats((selectedFormats) => ({
        ...selectedFormats,
        quote: false,
      }));

      dispatchInput();
      return;
    }

    const text = getSelectedText();
    const classes = 'blockquote TextFormatter-blockquote';
    document.execCommand(
      'insertHTML',
      false,
      `<blockquote class="${classes}" data-entity-type="${ApiMessageEntityTypes.Blockquote}">${text}</blockquote>`,
    );
    onClose();
  });

  const handleLinkUrlConfirm = useLastCallback(() => {
    const formattedLinkUrl = (ensureProtocol(linkUrl) || '').split('%').map(encodeURI).join('%');

    if (isEditingLink) {
      const element = getSelectedElement();
      if (!element || element.tagName !== 'A') {
        return;
      }

      (element as HTMLAnchorElement).href = formattedLinkUrl;

      onClose();

      return;
    }

    const text = getSelectedText(true);
    restoreSelection();
    document.execCommand(
      'insertHTML',
      false,
      `<a href=${formattedLinkUrl} class="text-entity-link" dir="auto">${text}</a>`,
    );
    onClose();
  });

  const handleKeyDown = useLastCallback((e: KeyboardEvent) => {
    const HANDLERS_BY_KEY: Record<string, AnyToVoidFunction> = {
      k: openLinkControl,
      b: handleBoldText,
      u: handleUnderlineText,
      i: handleItalicText,
      m: handleMonospaceText,
      s: handleStrikethroughText,
      p: handleSpoilerText,
    };

    const handler = HANDLERS_BY_KEY[getKeyFromEvent(e)];

    if (
      e.altKey
      || !(e.ctrlKey || e.metaKey)
      || !handler
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    handler();
  });

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && isLinkControlOpen) {
      handleLinkUrlConfirm();
      e.preventDefault();
    }
  }

  if (!shouldRender) {
    return undefined;
  }

  const className = buildClassName(
    'TextFormatter',
    transitionClassNames,
    isLinkControlOpen && 'link-control-shown',
  );

  const linkUrlConfirmClassName = buildClassName(
    'TextFormatter-link-url-confirm',
    Boolean(linkUrl.length) && 'shown',
  );

  const style = anchorPosition
    ? `left: ${anchorPosition.x}px; top: ${anchorPosition.y}px;--text-formatter-left: ${anchorPosition.x}px;`
    : '';

  if (isTextFormatterUseless) {
    return undefined;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      onKeyDown={handleContainerKeyDown}
      // Prevents focus loss when clicking on the toolbar
      onMouseDown={stopEvent}
    >
      <div className="TextFormatter-buttons">
        {canRenderSpoiler && (
          <>
            <Button
              color="translucent"
              ariaLabel="Spoiler text"
              className={getFormatButtonClassName('spoiler')}
              onClick={handleSpoilerText}
            >
              <Icon name="eye-closed" />
            </Button>
            {canRenderExceptSpoilerAndLink && <div className="TextFormatter-divider" />}
          </>
        )}
        {canRenderBold && (
          <Button
            color="translucent"
            ariaLabel="Bold text"
            className={getFormatButtonClassName('bold')}
            onClick={handleBoldText}
          >
            <Icon name="bold" />
          </Button>
        )}
        {canRenderItalic && (
          <Button
            color="translucent"
            ariaLabel="Italic text"
            className={getFormatButtonClassName('italic')}
            onClick={handleItalicText}
          >
            <Icon name="italic" />
          </Button>
        )}
        {canRenderUnderline && (
          <Button
            color="translucent"
            ariaLabel="Underlined text"
            className={getFormatButtonClassName('underline')}
            onClick={handleUnderlineText}
          >
            <Icon name="underlined" />
          </Button>
        )}
        {canRenderStrikethrough && (
          <Button
            color="translucent"
            ariaLabel="Strikethrough text"
            className={getFormatButtonClassName('strikethrough')}
            onClick={handleStrikethroughText}
          >
            <Icon name="strikethrough" />
          </Button>
        )}
        {canRenderMonospace && (
          <Button
            color="translucent"
            ariaLabel="Monospace text"
            className={getFormatButtonClassName('monospace')}
            onClick={handleMonospaceText}
          >
            <Icon name="monospace" />
          </Button>
        )}
        {canRenderBlockquote && (
          <Button
            color="translucent"
            ariaLabel="Quote text"
            className={getFormatButtonClassName('quote')}
            onClick={handleQuoteText}
          >
            <Icon name="quote" />
          </Button>
        )}
        {canRenderLink && (
          <>
            {(canRenderExceptSpoilerAndLink || canRenderSpoiler) && <div className="TextFormatter-divider" />}
            <Button color="translucent" ariaLabel={lang('TextFormat.AddLinkTitle')} onClick={openLinkControl}>
              <Icon name="link" />
            </Button>
          </>
        )}
      </div>

      <div className="TextFormatter-link-control">
        <div className="TextFormatter-buttons">
          <Button color="translucent" ariaLabel={lang('Cancel')} onClick={closeLinkControl}>
            <Icon name="arrow-left" />
          </Button>
          <div className="TextFormatter-divider" />

          <div
            className={buildClassName('TextFormatter-link-url-input-wrapper', inputClassName)}
          >
            <input
              ref={linkUrlInputRef}
              className="TextFormatter-link-url-input"
              type="text"
              value={linkUrl}
              placeholder="Enter URL..."
              autoComplete="off"
              inputMode="url"
              dir="auto"
              onChange={handleLinkUrlChange}
              onScroll={updateInputStyles}
            />
          </div>

          <div className={linkUrlConfirmClassName}>
            <div className="TextFormatter-divider" />
            <Button
              color="translucent"
              ariaLabel={lang('Save')}
              className="color-primary"
              onClick={handleLinkUrlConfirm}
            >
              <Icon name="check" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(TextFormatter);

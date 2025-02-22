import { EDITABLE_INPUT_ID } from '../../../../config';

export function getSelectedBlockquote() {
  const selection = window.getSelection();
  if (!selection || selection.focusNode !== selection.anchorNode) {
    return undefined;
  }

  let element: Node | null = selection.focusNode;
  while (element) {
    if (element instanceof HTMLElement && element.id === EDITABLE_INPUT_ID) {
      break;
    }
    if (element instanceof HTMLQuoteElement) {
      return element;
    }
    element = element.parentElement;
  }
  return undefined;
}

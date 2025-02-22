import React, { memo, useMemo, useState } from '../../../lib/teact/teact';

import type { IconName } from '../../../types/icons';

import useWindowSize from '../../../hooks/window/useWindowSize';

import Icon from '../icons/Icon';
import StickerSetContainer, { getItemsPerRowFallback } from '../StickerSetContainer';

import styles from '../CustomEmojiPicker.module.scss';

const folderPickerIconNames: IconName[] = [
  'folder-chats',
  'folder-chat',
  'folder-user',
  'folder-group',
  'folder-star',
  'folder-channel',
  'folder-bot',
  'folder-folder',
];

function split(max: number, array: IconName[]): IconName[][] {
  const parts = new Array<IconName[]>([]);
  for (const item of array) {
    if (parts[parts.length - 1].length === max) {
      parts.push([]);
    }
    parts[parts.length - 1].push(item);
  }
  return parts;
}

function DefaultFolderIconsRow({ onFolderIconSelected }: { onFolderIconSelected?: (icon: IconName) => void }) {
  const [itemsPerRow, setItemsPerRow] = useState(getItemsPerRowFallback(useWindowSize().width));
  const folderParts = useMemo(() => split(itemsPerRow, folderPickerIconNames), [itemsPerRow]);

  return (
    <StickerSetContainer
      index={0}
      idPrefix="folder-icons"
      className={styles.folderIconPickerDefaultIconList}
      setItemsPerRow={setItemsPerRow}
      isEmoji
    >
      {
        folderParts
          .map((v) => (
            <div key={v[v.length - 1] ?? v[0]}>
              {v.map((n) => (
                // eslint-disable-next-line jsx-a11y/control-has-associated-label
                <button
                  key={n}
                  onClick={() => onFolderIconSelected?.(n)}
                  className="StickerButton custom-emoji interactive"
                >
                  <Icon name={n} />
                </button>
              ))}
              {v.length < itemsPerRow
              && Array(itemsPerRow - v.length).fill(undefined).map((_, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={`fill-${i}`} className={styles.fillerFolderIcon} />
              ))}
            </div>
          ))
      }
    </StickerSetContainer>
  );
}

export default memo(DefaultFolderIconsRow);

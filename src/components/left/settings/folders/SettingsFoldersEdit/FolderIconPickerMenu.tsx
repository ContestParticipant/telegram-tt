import type { RefObject } from 'react';
import type { FC } from '../../../../../lib/teact/teact';
import React, {
  memo, useCallback, useEffect, useRef,
} from '../../../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../../../global';

import type { ApiSticker } from '../../../../../api/types';
import type { IconName } from '../../../../../types/icons';

import { selectIsContextMenuTranslucent } from '../../../../../global/selectors';

import useFlag from '../../../../../hooks/useFlag';

import CustomEmojiPicker from '../../../../common/CustomEmojiPicker';
import Menu from '../../../../ui/Menu';
import { FOLDER_EMOTICON_MAP } from '../../../main/LeftVerticalFolderList';

import styles from '../../../main/StatusPickerMenu.module.scss';

export type OwnProps = {
  isOpen: boolean;
  statusButtonRef: RefObject<HTMLButtonElement>;
  onEmojiStatusSelect: (emojiStatus: ApiSticker) => void;
  onClose: () => void;
  onFolderEmoticonSelected?: (emoticon: string) => void;
};

interface StateProps {
  areFeaturedStickersLoaded?: boolean;
  isTranslucent?: boolean;
}

const FolderIconPickerMenu: FC<OwnProps & StateProps> = ({
  isOpen,
  statusButtonRef,
  areFeaturedStickersLoaded,
  isTranslucent,
  onEmojiStatusSelect,
  onClose,
  onFolderEmoticonSelected,
}) => {
  const { loadFeaturedEmojiStickers } = getActions();

  const transformOriginX = useRef<number>();
  const [isContextMenuShown, markContextMenuShown, unmarkContextMenuShown] = useFlag();
  useEffect(() => {
    transformOriginX.current = statusButtonRef.current!.getBoundingClientRect().left / 2;
    // transformOriginY.current = statusButtonRef.current!.getBoundingClientRect().bottom;
  }, [isOpen, statusButtonRef]);

  useEffect(() => {
    if (isOpen && !areFeaturedStickersLoaded) {
      loadFeaturedEmojiStickers();
    }
  }, [areFeaturedStickersLoaded, isOpen, loadFeaturedEmojiStickers]);

  const handleEmojiSelect = useCallback((sticker: ApiSticker) => {
    onEmojiStatusSelect(sticker);
    onClose();
  }, [onClose, onEmojiStatusSelect]);

  const onFolderIconSelected = useCallback((icon: IconName) => {
    onFolderEmoticonSelected?.(FOLDER_EMOTICON_MAP[icon]);
  }, [onFolderEmoticonSelected]);

  return (
    <Menu
      isOpen={isOpen}
      noCompact
      positionX="right"
      bubbleClassName={styles.menuContent}
      onClose={onClose}
      noCloseOnBackdrop={isContextMenuShown}
    >
      <CustomEmojiPicker
        idPrefix="folder-emoji-set-"
        loadAndPlay={isOpen}
        isHidden={!isOpen}
        isTranslucent={isTranslucent}
        onContextMenuOpen={markContextMenuShown}
        onContextMenuClose={unmarkContextMenuShown}
        onCustomEmojiSelect={handleEmojiSelect}
        onFolderIconSelected={onFolderIconSelected}
        onContextMenuClick={onClose}
        isFolderIconPicker
      />
    </Menu>
  );
};

export default memo(withGlobal<OwnProps>((global): StateProps => {
  return {
    areFeaturedStickersLoaded: Boolean(global.customEmojis.featuredIds?.length),
    isTranslucent: selectIsContextMenuTranslucent(global),
  };
})(FolderIconPickerMenu));

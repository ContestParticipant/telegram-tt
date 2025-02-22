import { memo, useRef } from '../../../lib/teact/teact';
import React from '../../../lib/teact/teactn';
import { getActions, useGlobal } from '../../../global';

import type { IconName } from '../../../types/icons';
import type { MenuItemContextAction } from '../../ui/ListItem';
import {
  type ApiChatFolder, type ApiFormattedText, type ApiMessageEntityCustomEmoji, ApiMessageEntityTypes,
} from '../../../api/types';

import { ALL_FOLDER_ID } from '../../../config';
import { selectTabState } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { MouseButton } from '../../../util/windowEnvironment';
import { renderTextWithEntities } from '../../common/helpers/renderTextWithEntities';

import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import { useFastClick } from '../../../hooks/useFastClick';
import { useFolderManagerForUnreadCounters } from '../../../hooks/useFolderManager';
import useLastCallback from '../../../hooks/useLastCallback';
import { useDisplayedFolders } from './hooks/useDisplayedFolders';

import CustomEmoji from '../../common/CustomEmoji';
import Icon from '../../common/icons/Icon';
import Menu from '../../ui/Menu';
import MenuItem from '../../ui/MenuItem';
import MenuSeparator from '../../ui/MenuSeparator';

import './LeftVerticalFolderList.scss';
import '../../ui/Tab.scss';

const LeftVerticalFolderList = () => {
  const { setActiveChatFolder } = getActions();
  const { activeChatFolder } = useGlobal((g) => ({ activeChatFolder: selectTabState(g).activeChatFolder }));
  const displayedFolders = useDisplayedFolders();
  const handleSwitchTab = useLastCallback((index: number) => {
    setActiveChatFolder({ activeChatFolder: index }, { forceOnHeavyAnimation: true });
  });

  const folderCountersById = useFolderManagerForUnreadCounters();

  return displayedFolders?.map((v, i) => {
    const badgeCount = folderCountersById[v.id]?.chatsCount;
    const isBadgeActive = Boolean(folderCountersById[v.id]?.notificationsCount);

    return (
      <Folder
        folder={v}
        active={activeChatFolder === i}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={() => handleSwitchTab(i)}
        badgeCount={badgeCount}
        isBadgeActive={isBadgeActive}
        contextActions={v.contextActions.length ? v.contextActions : undefined}
        contextRootElementSelector="#LeftColumn"
      />
    );
  });
};

const classNames = {
  active: 'Tab--active',
  badgeActive: 'Tab__badge--active',
};
const CLASS_PREFIX = 'VFolderList-folder';
function Folder(
  {
    folder, active, onClick, badgeCount, isBadgeActive, contextActions,
    contextRootElementSelector,
  }: {
    folder: ApiChatFolder;
    active: boolean;
    onClick: () => void;
    badgeCount?: number;
    isBadgeActive?: boolean;
    contextActions?: MenuItemContextAction[];
    contextRootElementSelector: string;
  },
) {
  // eslint-disable-next-line no-null/no-null
  const folderRef = useRef<HTMLDivElement>(null);
  const [title, customEmoji] = extractPotentialCustomEmoji(folder.title);
  const renderedTitle = renderTextWithEntities({ ...title, noCustomEmojiPlayback: folder.noTitleAnimations });
  const icon = getFolderIcon(folder, customEmoji);

  const {
    contextMenuAnchor, handleContextMenu, handleBeforeContextMenu, handleContextMenuClose,
    handleContextMenuHide, isContextMenuOpen,
  } = useContextMenuHandlers(folderRef, !contextActions);
  const { handleClick, handleMouseDown } = useFastClick((e: React.MouseEvent<HTMLDivElement>) => {
    if (contextActions && (e.button === MouseButton.Secondary || !onClick)) {
      handleBeforeContextMenu(e);
    }

    if (e.type === 'mousedown' && e.button !== MouseButton.Main) {
      return;
    }

    onClick();
  });

  const getTriggerElement = useLastCallback(() => folderRef.current);
  const getRootElement = useLastCallback(
    () => (contextRootElementSelector ? folderRef.current!.closest(contextRootElementSelector) : document.body),
  );
  const getMenuElement = useLastCallback(
    () => document.querySelector('#portals')!.querySelector('.Tab-context-menu .bubble'),
  );
  const getLayout = useLastCallback(() => ({ withPortal: true }));

  return (
    <div
      ref={folderRef}
      tabIndex={-1}
      className={buildClassName(CLASS_PREFIX, active && `${CLASS_PREFIX}-active`)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      <div className={`${CLASS_PREFIX}-iconContainer`}>
        {Boolean(badgeCount) && (
          <span className={buildClassName('badge', isBadgeActive && classNames.badgeActive)}>{badgeCount}</span>
        )}
        <div className={`${CLASS_PREFIX}-icon`}>{icon}</div>
      </div>
      <div className={`${CLASS_PREFIX}-title`}>{renderedTitle}</div>

      {contextActions && contextMenuAnchor !== undefined && (
        <Menu
          isOpen={isContextMenuOpen}
          anchor={contextMenuAnchor}
          getTriggerElement={getTriggerElement}
          getRootElement={getRootElement}
          getMenuElement={getMenuElement}
          getLayout={getLayout}
          className="Tab-context-menu"
          autoClose
          onClose={handleContextMenuClose}
          onCloseAnimationEnd={handleContextMenuHide}
          withPortal
        >
          {contextActions.map((action) => (
            ('isSeparator' in action) ? (
              <MenuSeparator key={action.key || 'separator'} />
            ) : (
              <MenuItem
                key={action.title}
                icon={action.icon}
                destructive={action.destructive}
                disabled={!action.handler}
                onClick={action.handler}
              >
                {action.title}
              </MenuItem>
            )
          ))}
        </Menu>
      )}
    </div>
  );
}

export const EMOTICON_FOLDER_MAP: Record<string, IconName> = {
  '⭐': 'folder-star',
  '💬': 'folder-chats',
  '📢': 'folder-channel',
  '✅': 'folder-chat',
  '🤖': 'folder-bot',
  '📁': 'folder-folder',
  '👥': 'folder-group',
  '👤': 'folder-user',
};
export const FOLDER_EMOTICON_MAP = Object.fromEntries(
  Object.entries(EMOTICON_FOLDER_MAP)
    .map(([k, v]) => [v, k]),
) as Record<IconName, string>;
function getFolderIcon(folder: ApiChatFolder, customEmoji: ApiMessageEntityCustomEmoji | undefined) {
  if (customEmoji) {
    return <CustomEmoji documentId={customEmoji.documentId} size={36} noPlay={folder.noTitleAnimations} />;
  }
  let name: IconName = folder.id === ALL_FOLDER_ID ? 'folder-chats' : 'folder-folder';
  if (!folder.emoticon) {
    const all = [
      ['contacts', folder.contacts, 'folder-user'],
      ['nonContacts', folder.nonContacts, 'folder-folder'],
      ['groups', folder.groups, 'folder-group'],
      ['channels', folder.channels, 'folder-channel'],
      ['bots', folder.bots, 'folder-bot'],
    ] as const;
    const unique = all.filter((v) => v[1]);
    if (unique.length === 1) {
      name = unique[0][2];
    }
  } else if (folder.emoticon in EMOTICON_FOLDER_MAP) {
    name = EMOTICON_FOLDER_MAP[folder.emoticon];
  }
  return <Icon name={name} />;
}
export function extractPotentialCustomEmoji(title: ApiFormattedText):
[ApiFormattedText, ApiMessageEntityCustomEmoji | undefined, string | undefined] {
  title = JSON.parse(JSON.stringify(title));
  if (!title.entities) {
    return [title, undefined, undefined];
  }
  const customEmojis = title.entities?.filter((v) => v.type === ApiMessageEntityTypes.CustomEmoji);
  if (customEmojis?.length !== 1) {
    return [title, undefined, undefined];
  }
  const customEmoji = customEmojis[0];
  const emoji = customEmoji ? title.text.slice(customEmoji.offset, customEmoji.offset + customEmoji.length) : undefined;
  if (customEmoji.offset === 0) {
    for (const entity of title.entities) {
      entity.offset -= customEmoji.length;
    }
    title.entities = title.entities.filter((v) => v !== customEmoji);
    title.text = title.text.slice(customEmoji.length);
    return [title, customEmoji, emoji];
  } else if (customEmoji.length + customEmoji.offset === title.text.length) {
    title.entities = title.entities.filter((v) => v !== customEmoji);
    title.text = title.text.slice(0, customEmoji.offset);
    return [title, customEmoji, emoji];
  } else {
    return [title, undefined, undefined];
  }
}
export function replaceCustomEmoji(
  title: ApiFormattedText,
  newCustomEmojiEmoji: string,
  newCustomEmojiId: string,
): ApiFormattedText {
  let [{ text, entities }] = extractPotentialCustomEmoji(title);
  text = text.trim();
  text += ' ';
  const offset = text.length;
  const length = newCustomEmojiEmoji.length;
  const entity: ApiMessageEntityCustomEmoji = {
    type: ApiMessageEntityTypes.CustomEmoji,
    offset,
    length,
    documentId: newCustomEmojiId,
  };
  text += newCustomEmojiEmoji;
  entities = [...(entities ?? []), entity];
  return { text, entities };
}

export const FolderIcon = memo(({ folder }: { folder: ApiChatFolder }) => {
  const [, customEmoji] = extractPotentialCustomEmoji(folder.title);
  const icon = getFolderIcon(folder, customEmoji);
  return <div className="VFolderList-folder">{icon}</div>;
});

export default memo(LeftVerticalFolderList);

/* eslint-disable @typescript-eslint/no-shadow */
import { useEffect, useMemo, useRef } from '../../../../lib/teact/teact';
import { getActions, getGlobal, useGlobal } from '../../../../global';

import type { ApiChatFolder } from '../../../../api/types';
import type { MenuItemContextAction } from '../../../ui/ListItem';

import { ALL_FOLDER_ID } from '../../../../config';
import { selectCanShareFolder, selectTabState } from '../../../../global/selectors';
import { selectCurrentLimit } from '../../../../global/selectors/limits';
import captureEscKeyListener from '../../../../util/captureEscKeyListener';
import { MEMO_EMPTY_ARRAY } from '../../../../util/memo';

import useHistoryBack from '../../../../hooks/useHistoryBack';
import useLang from '../../../../hooks/useLang';

const SAVED_MESSAGES_HOTKEY = '0';
const FIRST_FOLDER_INDEX = 0;

export interface DisplayedFolder extends ApiChatFolder {
  contextActions: MenuItemContextAction[];
}

export function useDisplayedFolders(vertical = false) {
  const {
    chatFoldersById,
    orderedFolderIds,
    activeChatFolder,
    currentUserId,
    folderInvitesById,
  } = useGlobal((global) => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
      currentUserId,
    } = global;
    const { activeChatFolder } = selectTabState(global);

    return {
      chatFoldersById,
      orderedFolderIds,
      activeChatFolder,
      currentUserId,
      folderInvitesById,
    };
  });
  const {
    loadChatFolders,
    setActiveChatFolder,
    openChat,
    openLimitReachedModal,
    openShareChatFolderModal,
    openEditChatFolder,
    openDeleteChatFolderModal,
  } = getActions();

  // eslint-disable-next-line no-null/no-null
  const lang = useLang();

  useEffect(() => {
    loadChatFolders();
  }, []);

  const allChatsFolder: ApiChatFolder = useMemo(() => {
    return {
      id: ALL_FOLDER_ID,
      title: {
        text: orderedFolderIds?.[0] === ALL_FOLDER_ID && !vertical ? lang('FilterAllChatsShort')
          : lang('FilterAllChats'),
      },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
    } satisfies ApiChatFolder;
  }, [orderedFolderIds, lang, vertical]);

  const displayedFolders = useMemo(() => {
    return orderedFolderIds
      ? orderedFolderIds.map((id) => {
        if (id === ALL_FOLDER_ID) {
          return allChatsFolder;
        }

        return chatFoldersById[id] || {};
      }).filter(Boolean)
        .map((v): DisplayedFolder => {
          const { id } = v;
          const canShareFolder = selectCanShareFolder(getGlobal(), id);
          const contextActions = new Array<MenuItemContextAction>();
          const maxChatLists = selectCurrentLimit(getGlobal(), 'chatlistJoined');
          const maxFolderInvites = selectCurrentLimit(getGlobal(), 'chatlistInvites');

          if (canShareFolder) {
            contextActions.push({
              title: lang('FilterShare'),
              icon: 'link',
              handler: () => {
                const chatListCount = Object.values(chatFoldersById)
                  .reduce((acc, el) => acc + (el.isChatList ? 1 : 0), 0);
                if (chatListCount >= maxChatLists && !v.isChatList) {
                  openLimitReachedModal({
                    limit: 'chatlistJoined',
                  });
                  return;
                }

                // Greater amount can be after premium downgrade
                if (folderInvitesById[id]?.length >= maxFolderInvites) {
                  openLimitReachedModal({
                    limit: 'chatlistInvites',
                  });
                  return;
                }

                openShareChatFolderModal({
                  folderId: id,
                });
              },
            });
          }

          if (id !== ALL_FOLDER_ID) {
            contextActions.push({
              title: lang('FilterEdit'),
              icon: 'edit',
              handler: () => {
                openEditChatFolder({ folderId: id });
              },
            });

            contextActions.push({
              title: lang('FilterDelete'),
              icon: 'delete',
              destructive: true,
              handler: () => {
                openDeleteChatFolderModal({ folderId: id });
              },
            });
          }

          return { ...v, contextActions };
        })
      : undefined;
  }, [lang, folderInvitesById, chatFoldersById, allChatsFolder, orderedFolderIds]);

  const isInFirstFolder = FIRST_FOLDER_INDEX === activeChatFolder;

  const isNotInFirstFolderRef = useRef();
  isNotInFirstFolderRef.current = !isInFirstFolder;
  useEffect(() => (isNotInFirstFolderRef.current ? captureEscKeyListener(() => {
    if (isNotInFirstFolderRef.current) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }) : undefined), [activeChatFolder, setActiveChatFolder]);

  useHistoryBack({
    isActive: !isInFirstFolder,
    onBack: () => setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX }, { forceOnHeavyAnimation: true }),
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code.startsWith('Digit') && displayedFolders) {
        const [, digit] = e.code.match(/Digit(\d)/) || [];
        if (!digit) return;

        if (digit === SAVED_MESSAGES_HOTKEY) {
          openChat({ id: currentUserId, shouldReplaceHistory: true });
          return;
        }

        const folder = Number(digit) - 1;
        if (folder > displayedFolders.length - 1) return;

        setActiveChatFolder({ activeChatFolder: folder }, { forceOnHeavyAnimation: true });
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentUserId, displayedFolders, openChat, setActiveChatFolder]);

  return displayedFolders;
}

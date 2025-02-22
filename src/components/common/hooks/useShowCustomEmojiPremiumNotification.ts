import { useRef } from '../../../lib/teact/teact';
import { getActions, useGlobal } from '../../../global';

import useLastCallback from '../../../hooks/useLastCallback';
import useOldLang from '../../../hooks/useOldLang';

export function useShowCustomEmojiPremiumNotification() {
  const lang = useOldLang();
  const { showNotification } = getActions();
  const customEmojiNotificationNumber = useRef(0);
  const { currentUserId } = useGlobal((v) => ({ currentUserId: v.currentUserId }));
  return useLastCallback(() => {
    const notificationNumber = customEmojiNotificationNumber.current;
    if (!notificationNumber) {
      showNotification({
        message: lang('UnlockPremiumEmojiHint'),
        action: {
          action: 'openPremiumModal',
          payload: { initialSection: 'animated_emoji' },
        },
        actionText: lang('PremiumMore'),
      });
    } else {
      showNotification({
        message: lang('UnlockPremiumEmojiHint2'),
        action: {
          action: 'openChat',
          payload: { id: currentUserId, shouldReplaceHistory: true },
        },
        actionText: lang('Open'),
      });
    }
    customEmojiNotificationNumber.current = Number(!notificationNumber);
  });
}

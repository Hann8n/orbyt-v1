import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExtendedPostView, ExtendedFeedViewPost } from '../../../../../services/api/types';

/** System moderation labels: do not show in user-facing warning text. */
const WARNING_HIDDEN_LABELS = ['!hide', '!warn', '!no-unauthenticated'];

/** Label keys that have i18n translations (video.contentWarningLabels.*) */
const CONTENT_WARNING_LABEL_KEYS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'gore',
  'self-harm',
  'sensitive',
  'extremist',
  'intolerance',
  'threats',
  'rude',
  'illicit',
  'security-concerns',
  'unsafe-link',
  'impersonation',
  'misinformation',
  'scam',
  'engagement-farming',
  'spam',
  'unconfirmed',
  'misleading',
  'inauthentic-account',
  'sexually-suggestive-cartoon',
] as const;

export interface VideoCardModerationState {
  cannotShowMedia: boolean;
  isBlurred: boolean;
  warningDescription: string;
  handleViewContent: () => void;
}

export function useVideoCardModerationState(
  postView: ExtendedPostView,
  feedItem: ExtendedFeedViewPost | undefined,
  userChoseToView: boolean,
  setUserChoseToView: (v: boolean) => void
): VideoCardModerationState {
  const { t } = useTranslation();

  // Moderation: hide = explicit filter/noOverride from batch; warn = blur only with opt-in.
  // Failsafe: if the post has labels but we're missing batch result, block to avoid showing un-evaluated labeled content.
  const contentListUI = feedItem?.contentListUI;
  const contentMediaUI = feedItem?.contentMediaUI;
  const hasModerationFromBatch = contentListUI != null || contentMediaUI != null;
  const postHasLabels = Array.isArray(postView.labels) && postView.labels.length > 0;
  const shouldBlur = !!(contentListUI?.blur || contentMediaUI?.blur);
  const noOverride = !!(contentListUI?.noOverride || contentMediaUI?.noOverride);
  const isFiltered = !!(contentListUI?.filter || contentMediaUI?.filter);
  const cannotShowMedia = noOverride || isFiltered || (!hasModerationFromBatch && postHasLabels);
  const isWarn = shouldBlur && !noOverride && !isFiltered;
  const firstBlur = contentListUI?.blurs?.[0] ?? contentMediaUI?.blurs?.[0];
  // ModerationCause is a discriminated union; when type === 'label', label.val is guaranteed.
  const reason = firstBlur?.type === 'label' ? firstBlur.label.val : undefined;
  const isBlurred = isWarn && !userChoseToView;

  const warningDescription = useMemo(() => {
    const fallback = t('video.contentWarningFallback');
    if (!reason) return fallback;

    const labels = reason
      .split(',')
      .map((l: string) => l.trim().toLowerCase())
      .filter((l: string) => !WARNING_HIDDEN_LABELS.includes(l));

    if (labels.length === 0) return fallback;

    if (labels.some(l => l === 'inauthentic-account')) {
      return t('video.contentWarningInauthentic');
    }

    const getLabelMessage = (label: string): string => {
      const key = `video.contentWarningLabels.${label}`;
      const translated = t(key);
      if (translated !== key) return translated;
      const matchedKey = CONTENT_WARNING_LABEL_KEYS.find(k => k === label);
      if (matchedKey) return t(`video.contentWarningLabels.${matchedKey}`);
      return label
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .toLowerCase();
    };

    const messages = labels
      .map((label: string) => getLabelMessage(label))
      .filter((msg: string) => msg.length > 0);

    if (messages.length === 0) return fallback;

    const andConjunction = t('video.contentWarningAnd');
    const formattedMessage =
      messages.length > 1
        ? messages.slice(0, -1).join(', ') + andConjunction + messages[messages.length - 1]
        : messages[0];

    return t('video.contentWarningMayContain', { labels: formattedMessage });
  }, [reason, t]);

  const handleViewContent = () => setUserChoseToView(true);

  return { cannotShowMedia, isBlurred, warningDescription, handleViewContent };
}

import { useCallback, useEffect, useRef } from 'react';

import { AtprotoFeedService } from '../../../../../services/api/feed/FeedService';
import type { Interaction } from '../../../../../services/api/types';
import { ErrorHandler } from '../../../../../utils/errors/errorHandler';

type UseFeedInteractionQueueArgs = {
  postUri: string;
  feedContext?: string;
  reqId?: string;
  resolvedFeedUri?: string;
};

type QueueInteractionEvent = NonNullable<Interaction['event']>;

const INTERACTION_DEBOUNCE_MS = 1500;

export function useFeedInteractionQueue({
  postUri,
  feedContext,
  reqId,
  resolvedFeedUri,
}: UseFeedInteractionQueueArgs) {
  const interactionQueueRef = useRef<Interaction[]>([]);
  const sendInteractionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenInteractionSentRef = useRef(false);

  const flushNow = useCallback(
    (errorScope: string) => {
      const interactionsToSend = [...interactionQueueRef.current];
      interactionQueueRef.current = [];
      if (interactionsToSend.length === 0) return;

      AtprotoFeedService.sendFeedInteractions(interactionsToSend, resolvedFeedUri).catch(error => {
        ErrorHandler.handleError(error, errorScope);
      });
    },
    [resolvedFeedUri]
  );

  const queueSeenInteractionOnce = useCallback(
    (event: QueueInteractionEvent) => {
      if (seenInteractionSentRef.current) return;
      seenInteractionSentRef.current = true;
      const interaction: Interaction = {
        $type: 'app.bsky.feed.defs#interaction',
        item: postUri,
        event,
      };
      if (feedContext) interaction.feedContext = feedContext;
      if (reqId) interaction.reqId = reqId;
      interactionQueueRef.current.push(interaction);

      if (sendInteractionsTimeoutRef.current) {
        clearTimeout(sendInteractionsTimeoutRef.current);
      }

      sendInteractionsTimeoutRef.current = setTimeout(() => {
        flushNow('VideoCard: sendFeedInteractions (debounced)');
        sendInteractionsTimeoutRef.current = null;
      }, INTERACTION_DEBOUNCE_MS);
    },
    [postUri, feedContext, reqId, flushNow]
  );

  const resetSeenInteraction = useCallback(() => {
    seenInteractionSentRef.current = false;
  }, []);

  useEffect(
    () => () => {
      if (sendInteractionsTimeoutRef.current) {
        clearTimeout(sendInteractionsTimeoutRef.current);
        sendInteractionsTimeoutRef.current = null;
      }
      flushNow('VideoCard: sendFeedInteractions (unmount flush)');
    },
    [flushNow]
  );

  return {
    queueSeenInteractionOnce,
    resetSeenInteraction,
  };
}

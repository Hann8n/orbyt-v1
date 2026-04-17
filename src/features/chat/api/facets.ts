/**
 * RichText facet detection for chat messages. Extracted from ChatService.sendMessage
 * so callers can decide whether/when to compute facets (e.g. useSendMessage runs
 * detection before optimistically inserting the placeholder).
 */

import { RichText } from '@atproto/api';
import { AtprotoCore } from '../../../services/api/core';
import type { MessageView } from '../../../services/api/types';

export async function detectFacets(text: string): Promise<MessageView['facets'] | undefined> {
  if (!text) return undefined;
  try {
    const { api } = await AtprotoCore.getApiClient();
    const rt = new RichText({ text });
    await rt.detectFacets(api);
    if (rt.facets && rt.facets.length > 0) {
      return rt.facets as MessageView['facets'];
    }
  } catch {
    // Fall through: send plain text.
  }
  return undefined;
}

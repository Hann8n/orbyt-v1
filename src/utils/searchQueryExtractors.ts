export interface SearchQuery {
  query: string;
  start: number;
  end: number;
}

/**
 * Extract @mention query from text and cursor position
 */
export const getMentionQuery = (text: string, cursor: number): SearchQuery | null => {
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|\s)@([\w.-]*)$/.exec(beforeCursor);
  if (match) {
    return {
      query: match[2],
      start: match.index + match[1].length,
      end: cursor,
    };
  }
  return null;
};

/**
 * Extract #hashtag query from text and cursor position
 */
export const getHashtagQuery = (text: string, cursor: number): SearchQuery | null => {
  const beforeCursor = text.slice(0, cursor);
  const match = /(^|\s)#([\w-]*)$/.exec(beforeCursor);
  if (match) {
    return {
      query: match[2],
      start: match.index + match[1].length,
      end: cursor,
    };
  }
  return null;
};

/**
 * Extract search query from text and cursor position for both mentions and hashtags
 */
export const getSearchQuery = (
  text: string,
  cursor: number,
  enableHashtags: boolean = false
): { type: 'mention' | 'hashtag'; query: SearchQuery } | null => {
  if (enableHashtags) {
    const hashtag = getHashtagQuery(text, cursor);
    if (hashtag) {
      return { type: 'hashtag', query: hashtag };
    }
  }
  
  const mention = getMentionQuery(text, cursor);
  if (mention && mention.query.length > 0) {
    return { type: 'mention', query: mention };
  }
  
  return null;
};

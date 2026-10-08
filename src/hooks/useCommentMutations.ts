import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { RichText } from '@atproto/api';
import { logger } from '../utils/logger';
import { queryKeys } from '../utils/query/queryKeys';
import { getAtprotoBridge } from '../services/api/agentBridge';
import { AtprotoCore } from '../services/api/core';
import { normalizeExternalEmbedThumbSource } from '../services/api/feed/feedShared';
import type { Comment, CommentsResponse } from '../services/api/types';
import type { InfiniteData } from '@tanstack/react-query';
import {
  confirmToggle,
  isConfirmedUri,
  optimisticToggle,
  rollbackToggle,
  type ToggleState,
} from '../utils/query/viewerToggle';

const MAX_IMAGE_BYTES = 1_000_000;

function inferImageEncoding(uri: string, blob: Blob): string {
  const fromBlob = typeof blob?.type === 'string' ? blob.type.toLowerCase() : '';
  if (fromBlob === 'image/png') return 'image/png';
  if (fromBlob === 'image/webp') return 'image/webp';
  if (fromBlob === 'image/gif') return 'image/gif';
  if (fromBlob === 'image/jpeg' || fromBlob === 'image/jpg') return 'image/jpeg';

  const clean = uri.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg') || clean.endsWith('.heic')) {
    return 'image/jpeg';
  }
  return 'image/jpeg';
}

interface PostCommentVars {
  text: string;
  rootUri: string;
  rootCid: string;
  parentUri?: string;
  parentCid?: string;
  images?: { uri: string; alt: string; aspectRatio?: { width: number; height: number } }[];
  externalEmbed?: { uri: string; title?: string; description?: string; thumb?: string };
  author: { did: string; handle: string; displayName?: string; avatar?: string };
}

/** Insert a reply into the nested comment tree (used for optimistic updates). */
function insertReplyInTree(comments: Comment[], parentUri: string, reply: Comment): Comment[] {
  let inserted = false;
  const next = comments.map(comment => {
    if (inserted) return comment;
    if (comment.uri === parentUri) {
      inserted = true;
      return { ...comment, replies: [reply, ...(comment.replies ?? [])] };
    }
    if (comment.replies?.length) {
      const child = insertReplyInTree(comment.replies, parentUri, reply);
      if (child !== comment.replies) {
        inserted = true;
        return { ...comment, replies: child };
      }
    }
    return comment;
  });
  return next;
}

/** Remove a comment by URI from the nested tree (top-level + all replies). */
function removeFromTree(comments: Comment[], uri: string): Comment[] {
  return comments
    .filter(c => c.uri !== uri)
    .map(c => (c.replies?.length ? { ...c, replies: removeFromTree(c.replies, uri) } : c));
}

/** Apply a mapper function to every comment in the nested tree. */
function mapTree(comments: Comment[], fn: (c: Comment) => Comment): Comment[] {
  return comments.map(c => {
    const mapped = fn(c);
    return mapped.replies?.length ? { ...mapped, replies: mapTree(mapped.replies, fn) } : mapped;
  });
}

/** Replace optimistic tempId with real uri/cid throughout the nested tree. */
function replaceOptimisticInTree(
  comments: Comment[],
  tempId: string,
  realUri: string,
  realCid: string
): Comment[] {
  return comments.map(c => {
    const updatedReplies = c.replies?.length
      ? replaceOptimisticInTree(c.replies, tempId, realUri, realCid)
      : c.replies;
    if (c.uri === tempId) {
      return { ...c, uri: realUri, cid: realCid, replies: updatedReplies };
    }
    if (updatedReplies !== c.replies) {
      return { ...c, replies: updatedReplies };
    }
    return c;
  });
}

/** Build optimistic comment for immediate UI feedback. */
function buildOptimisticComment(vars: PostCommentVars, tempId: string): Comment {
  const now = new Date().toISOString();
  return {
    uri: tempId,
    cid: tempId,
    author: {
      did: vars.author.did,
      handle: vars.author.handle,
      displayName: vars.author.displayName,
      avatar: vars.author.avatar,
    } as Comment['author'],
    record: {
      $type: 'app.bsky.feed.post',
      text: vars.text,
      createdAt: now,
    } as Comment['record'],
    indexedAt: now,
    likeCount: 0,
    replyCount: 0,
    replies: [],
    parent: null,
  };
}

export function usePostCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ uri: string; cid: string }, Error, PostCommentVars>({
    mutationFn: async vars => {
      if (AtprotoCore.isOutgoingApiBlocked()) {
        if (AtprotoCore.shouldFailOfflineWriteMock()) {
          throw new Error('Offline write mock failure: postComment');
        }
        const stamp = Date.now();
        return {
          uri: `at://did:plc:offline-debug/app.bsky.feed.post/mock-comment-${stamp}`,
          cid: `offline-comment-cid-${stamp}`,
        };
      }
      const { agent } = getAtprotoBridge();
      if (!agent) throw new Error('No authenticated agent');

      const actualParentUri = vars.parentUri || vars.rootUri;
      const actualParentCid = vars.parentCid || vars.rootCid;

      const richText = new RichText({ text: vars.text || '' });
      await richText.detectFacets(agent.api);

      const postRecord = {
        $type: 'app.bsky.feed.post' as const,
        text: richText.text,
        reply: {
          root: { uri: vars.rootUri, cid: vars.rootCid },
          parent: { uri: actualParentUri, cid: actualParentCid },
        },
        ...(richText.facets?.length ? { facets: richText.facets } : {}),
      };

      let embed: Record<string, unknown> | undefined;

      if (vars.externalEmbed?.uri) {
        let uploadedThumb: unknown;
        const thumbSource = normalizeExternalEmbedThumbSource(vars.externalEmbed.thumb);
        if (thumbSource) {
          try {
            const thumbRes = await fetch(thumbSource);
            if (thumbRes.ok) {
              const blob = await thumbRes.blob();
              const uploadResult = await agent.uploadBlob(blob, {
                encoding: inferImageEncoding(thumbSource, blob),
              });
              uploadedThumb = uploadResult.data.blob;
            }
          } catch (err) {
            logger.error('External embed thumbnail upload failed', { err });
          }
        }
        embed = {
          $type: 'app.bsky.embed.external',
          external: {
            uri: vars.externalEmbed.uri,
            title: vars.externalEmbed.title ?? vars.externalEmbed.uri,
            description: vars.externalEmbed.description ?? '',
            ...(uploadedThumb ? { thumb: uploadedThumb } : {}),
          },
        };
      } else if (vars.images?.length) {
        const uploadedImages = await Promise.all(
          vars.images.slice(0, 4).map(async img => {
            const response = await fetch(img.uri);
            if (!response.ok) throw new Error(`Failed to read image (${response.status})`);
            const blob = await response.blob();
            if (blob.size > MAX_IMAGE_BYTES) {
              throw new Error(`Image exceeds 1,000,000 byte limit (${blob.size})`);
            }
            const uploadResult = await agent.uploadBlob(blob, {
              encoding: inferImageEncoding(img.uri, blob),
            });
            return {
              image: uploadResult.data.blob,
              alt: img.alt ?? '',
              aspectRatio: img.aspectRatio,
            };
          })
        );
        embed = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages,
        };
      }

      return agent.post({
        ...postRecord,
        ...(embed ? { embed: embed as Comment['record']['embed'] } : {}),
      });
    },

    onMutate: async vars => {
      const queryKey = queryKeys.comments.byPost(vars.rootUri);
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<InfiniteData<CommentsResponse>>(queryKey);
      const tempId = `optimistic-comment:${Date.now()}`;
      const optimistic = buildOptimisticComment(vars, tempId);
      const isReply = vars.parentUri && vars.parentUri !== vars.rootUri;

      queryClient.setQueryData<InfiniteData<CommentsResponse>>(queryKey, old => {
        if (!old?.pages?.length) {
          return {
            pages: [{ comments: [optimistic], cursor: null }],
            pageParams: [null],
          };
        }
        const [first, ...rest] = old.pages;
        if (isReply && vars.parentUri) {
          const inserted = insertReplyInTree(first.comments, vars.parentUri, optimistic);
          return { ...old, pages: [{ ...first, comments: inserted }, ...rest] };
        }
        return {
          ...old,
          pages: [{ ...first, comments: [optimistic, ...first.comments] }, ...rest],
        };
      });

      return { previousData, tempId };
    },

    onSuccess: (result, vars, context) => {
      const ctx = context as
        | { previousData?: InfiniteData<CommentsResponse>; tempId?: string }
        | undefined;
      const tempId = ctx?.tempId;
      if (!tempId) return;
      const queryKey = queryKeys.comments.byPost(vars.rootUri);
      queryClient.setQueryData<InfiniteData<CommentsResponse>>(queryKey, old => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            comments: replaceOptimisticInTree(page.comments, tempId, result.uri, result.cid),
          })),
        };
      });
    },

    onError: (_err, vars, context) => {
      const ctx = context as
        | { previousData?: InfiniteData<CommentsResponse>; tempId?: string }
        | undefined;
      const queryKey = queryKeys.comments.byPost(vars.rootUri);
      if (ctx?.previousData) {
        queryClient.setQueryData(queryKey, ctx.previousData);
      } else {
        queryClient.removeQueries({ queryKey });
      }
    },

    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments.byPost(vars.rootUri) });
    },
  });
}

export function useDeleteCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation<boolean, Error, { uri: string }>({
    mutationFn: async ({ uri }) => {
      if (AtprotoCore.isOutgoingApiBlocked()) {
        return AtprotoCore.shouldFailOfflineWriteMock() ? false : true;
      }
      const { agent } = getAtprotoBridge();
      if (!agent) throw new Error('No authenticated agent');
      await agent.deletePost(uri);
      return true;
    },

    onSuccess: (_data, vars) => {
      const queryKey = queryKeys.comments.all;
      queryClient.setQueriesData({ queryKey }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const data = old as InfiniteData<CommentsResponse>;
        if (!Array.isArray(data.pages)) return old;
        return {
          ...data,
          pages: data.pages.map(page => ({
            ...page,
            comments: removeFromTree(page.comments, vars.uri),
          })),
        };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.comments.all });
      // Invalidate feed queries to refetch updated reply count from server
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
    },
  });
}

export function useRepostCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation<{ uri: string }, Error, { uri: string; cid: string }>({
    mutationFn: async ({ uri, cid }) => {
      if (AtprotoCore.isOutgoingApiBlocked()) {
        return { uri: `at://did:plc:offline-debug/app.bsky.feed.repost/mock-${Date.now()}` };
      }
      const { agent } = getAtprotoBridge();
      if (!agent) throw new Error('No authenticated agent');
      const result = await agent.repost(uri, cid);
      return { uri: result.uri };
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.comments.all });
    },
  });
}

interface LikeCommentVars {
  uri: string;
  cid: string;
  /** The state at tap time. */
  isLiked: boolean;
  likeUri?: string;
  likeCount: number;
}

/** Whether a like of this comment is in flight; taps are ignored until it settles. */
export function isCommentLikePending(queryClient: QueryClient, uri: string): boolean {
  return (
    queryClient.isMutating({
      mutationKey: ['commentLike'],
      predicate: mutation => (mutation.state.variables as LikeCommentVars | undefined)?.uri === uri,
    }) > 0
  );
}

export function useLikeCommentMutation() {
  const queryClient = useQueryClient();

  const setCommentLike = (uri: string, update: (current: ToggleState) => ToggleState) =>
    queryClient.setQueriesData({ queryKey: queryKeys.comments.all }, (old: unknown) => {
      if (!old || typeof old !== 'object') return old;
      const data = old as InfiniteData<CommentsResponse>;
      if (!Array.isArray(data.pages)) return old;
      return {
        ...data,
        pages: data.pages.map(page => ({
          ...page,
          comments: mapTree(page.comments, c => {
            if (c.uri !== uri) return c;
            const next = update({ uri: c.viewer?.like, count: c.likeCount ?? 0 });
            return { ...c, likeCount: next.count, viewer: { ...c.viewer, like: next.uri } };
          }),
        })),
      };
    });

  return useMutation<
    string | undefined,
    Error,
    LikeCommentVars,
    { previous: ToggleState; optimistic: ToggleState }
  >({
    mutationKey: ['commentLike'],
    mutationFn: async ({ uri, cid, isLiked, likeUri }) => {
      if (AtprotoCore.isOutgoingApiBlocked()) return undefined;
      const { agent } = getAtprotoBridge();
      if (!agent) throw new Error('No authenticated agent');

      if (isLiked) {
        if (!isConfirmedUri(likeUri)) throw new Error('No like URI');
        await agent.deleteLike(likeUri);
        return undefined;
      }
      const response = await agent.like(uri, cid);
      return response.uri;
    },

    // The comment threads are not refetched afterwards: the AppView can lag the write, and a
    // refetch would flip the heart back. The created record's URI is written instead.
    onMutate: ({ uri, isLiked, likeUri, likeCount }) => {
      const previous = { uri: isLiked ? likeUri : undefined, count: likeCount };
      const optimistic = optimisticToggle(previous, !isLiked);
      setCommentLike(uri, () => optimistic);
      return { previous, optimistic };
    },

    onSuccess: (likeUri, { uri, isLiked }) => {
      setCommentLike(uri, current => confirmToggle(current, !isLiked, likeUri));
    },

    onError: (_err, { uri }, context) => {
      if (!context) return;
      setCommentLike(uri, current => rollbackToggle(current, context.optimistic, context.previous));
    },
  });
}

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  UIManager,
  Dimensions,
  StyleSheet,
  Alert,
  Image,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolate,
  runOnJS,
  useAnimatedScrollHandler,
  useDerivedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, FlatList as GHFlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AtprotoService from '../../../services/api/AtprotoService';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useQuery, useQueryClient, useInfiniteQuery, InfiniteData } from '@tanstack/react-query';
import { createQueryKeys } from '../../../services/FeedService';
import { INTERACTIVE, BRAND } from '../../../utils/formatting/Colors';
import ProfileCache, { profileKeys } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../verification/VerificationBadge';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate, { formatPostDate } from '../../ui/RelativeDate';
import UI from '../../ui/UI';
import { Icon } from '../../ui/UI';
import PopUpModal from '../../ui/PopUpModal';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView, NativeViewGestureHandler } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetFlatList, BottomSheetTextInput, BottomSheetVirtualizedList } from "@gorhom/bottom-sheet";
import { useFocusEffect } from '@react-navigation/native';
import { ListRenderItemInfo } from 'react-native';
import { TouchableOpacity as BottomSheetTouchableOpacity } from '@gorhom/bottom-sheet';
import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useUserSearchTrigger, UserSearchModal } from '../../ui/usersearch';
import { useKeyboardState } from 'react-native-keyboard-controller';
import CommentItem, { Comment, Like } from './CommentItem';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Post {
  uri: string;
  cid?: string;
  likeCount?: number;
  indexedAt?: string;
  comments?: Comment[];
  likes?: Like[];
}

interface UserProfile {
  did: string;
  avatar?: string;
  displayName?: string;
}

interface CommentRecord {
  text: string;
  embed?: {
    $type: string;
    images?: {
      image: any;
      alt: string;
    }[];
  };
}

interface UserProfileCache {
  data: UserProfile | null;
  lastFetch: number;
  TTL: number;
}

const userProfileCache: UserProfileCache = {
  data: null,
  lastFetch: 0,
  TTL: 5 * 60 * 1000, // 5 minutes
};

const SCREEN_HEIGHT = Dimensions.get('window').height;
const MAX_TRANSLATE_Y = SCREEN_HEIGHT;
const MIN_TRANSLATE_Y = 0;

type RootStackParamList = {
  AuthorProfile: { handle: string };
};

const CellRendererComponent: React.ComponentType<{
  children: React.ReactNode;
  style?: any;
  index?: number;
}> = React.memo(({ children, style, index }) => {
  return (
    <View style={[style, { overflow: 'hidden' }]} key={`cell-${index}`}>
      {children}
    </View>
  );
});

const SNAP_POINTS = {
  TOP: MIN_TRANSLATE_Y,
  BOTTOM: MAX_TRANSLATE_Y,
};

const LikeItem: React.FC<{ like: Like }> = React.memo(({ like }) => (
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
  }}>
    <UI.Avatar
      uri={like.actor.avatar}
      type="profile"
      size={40}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#333',
      }}
    />
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
          {like.actor.displayName || like.actor.handle}
        </Text>
        {like.actor.handle && (
          <VerificationBadge
            handle={like.actor.handle}
            textSize={14}
            textColor="#FFFFFF"
            autoPosition={true}
          />
        )}
      </View>
      <Text style={{ color: '#DDDDDD', fontSize: 14 }}>
        @{like.actor.handle}
      </Text>
    </View>
  </View>
));

const MemoizedLikeItem = React.memo(LikeItem);

interface CommentSectionProps {
  post: Post;
  onDismiss?: () => void;
  visible: boolean;
  totalLikes?: number;
  totalComments?: number;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  post,
  onDismiss,
  visible,
  totalLikes = 0,
  totalComments = 0,
}) => {
  const insets = useSafeAreaInsets();
  const [newCommentText, setNewCommentText] = useState('');
  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');
  const [likesQueryEnabled, setLikesQueryEnabled] = useState(false);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const maxHeight = useMemo(() => Dimensions.get('window').height - insets.top, [insets.top]);
  const snapPoints = useMemo(() => ['60%', maxHeight], [maxHeight]);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const { height: keyboardHeight } = useKeyboardState();

  const [replyContext, setReplyContext] = useState<{
    authorName: string;
    parentUri: string;
    parentCid: string;
    level: number;
  } | null>(null);

  const inputRef = useRef<any>(null);

  const handleReplyPress = useCallback((comment: Comment) => {
    const properUri = comment?.uri || comment?.post?.uri;
    const properCid = comment?.cid || comment?.post?.cid;
    const authorName = comment?.post?.author?.displayName || comment?.author?.displayName || comment?.post?.author?.handle || comment?.author?.handle || 'Unknown';
    if (properUri && properCid) {
      setReplyContext({
        authorName,
        parentUri: properUri,
        parentCid: properCid,
        level: 1
      });
      setTimeout(() => {
        inputRef.current?.focus && inputRef.current.focus();
      }, 0);
    }
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyContext(null);
  }, []);

  const handleTabPress = (tabId: string) => {
    setActiveTab(tabId as 'comments' | 'likes');
    if (tabId === 'likes') setLikesQueryEnabled(true);
  };

  const {
    data: commentsPages,
    isLoading: commentsLoading,
    fetchNextPage: fetchNextCommentsPage,
    hasNextPage: hasNextCommentsPage,
    isFetchingNextPage: isFetchingNextCommentsPage,
    refetch: refetchComments,
  } = useInfiniteQuery<{ comments: any[]; cursor: string | null }, Error>({
    queryKey: createQueryKeys.comments.byPost(post.uri),
    queryFn: ({ pageParam }) => AtprotoService.getComments(post.uri, pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post.uri,
  });
  const comments = useMemo(
    () => commentsPages?.pages.flatMap((page) => (page as { comments: any[] }).comments) ?? [],
    [commentsPages]
  );

  const {
    data: likesPages,
    isLoading: likesLoading,
    fetchNextPage: fetchNextLikesPage,
    hasNextPage: hasNextLikesPage,
    isFetchingNextPage: isFetchingNextLikesPage,
    refetch: refetchLikes,
  } = useInfiniteQuery<{ likes: any[]; cursor: string | null }, Error>({
    queryKey: createQueryKeys.likes.byPost(post.uri),
    queryFn: ({ pageParam }) => AtprotoService.getLikes(post.uri, pageParam as string | null),
    getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
    initialPageParam: null,
    enabled: !!post.uri && likesQueryEnabled,
  });
  const likes = useMemo(
    () => likesPages?.pages.flatMap((page) => (page as { likes: any[] }).likes) ?? [],
    [likesPages]
  );

  const renderCommentItem = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
        comment={item}
        onDismiss={onDismiss}
        onImagePress={setFullscreenImageUri}
        onReplyPress={handleReplyPress}
      />
    ),
    [onDismiss, handleReplyPress]
  );
  
  const renderLikeItem = useCallback(
    ({ item }: { item: Like }) => <MemoizedLikeItem like={item} />,
    []
  );

  const commentKeyExtractor = useCallback((item: Comment) => item.uri, []);
  const likeKeyExtractor = useCallback((item: Like) => {
    if (item.uri) return item.uri;
    if (item.actor && item.actor.did && item.createdAt) return `${item.actor.did}-${item.createdAt}`;
    return Math.random().toString(36);
  }, []);

  const handleClose = useCallback(() => {
    if (onDismiss) onDismiss();
    bottomSheetRef.current?.close();
  }, [onDismiss]);

  const tabOptions: TabOption[] = [
    { id: 'comments', label: totalComments > 0 ? `comments ${formatNumber(totalComments)}` : 'Comments' },
    { id: 'likes', label: totalLikes > 0 ? `likes ${formatNumber(totalLikes)}` : 'Likes' },
  ];

  const {
    inputProps: mentionInputProps,
    userSearchModalProps,
  } = useUserSearchTrigger({
    value: newCommentText,
    selection: inputSelection,
    onChangeText: setNewCommentText,
    onSelectionChange: (e) => setInputSelection(e.nativeEvent.selection),
  });

  const queryClient = useQueryClient();
  const [isPosting, setIsPosting] = useState(false);
  const MAX_COMMENT_LENGTH = 300;
  const charCount = newCommentText.length;
  const showCharCount = charCount >= 150;
  
  const handleSendComment = useCallback(async () => {
    if (!newCommentText.trim() || isPosting) return;
    setIsPosting(true);
    try {
      const rootUri = post.uri;
      const rootCid = post.cid || '';
      let parentUri = rootUri;
      let parentCid = rootCid;
      if (replyContext) {
        parentUri = replyContext.parentUri;
        parentCid = replyContext.parentCid;
      }
      await AtprotoService.postComment(
        newCommentText.trim(),
        rootUri,
        rootCid,
        parentUri,
        parentCid
      );
      setNewCommentText('');
      setReplyContext(null);
      queryClient.invalidateQueries({ queryKey: createQueryKeys.comments.byPost(post.uri) });
    } catch (error) {
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setIsPosting(false);
    }
  }, [newCommentText, post, replyContext, isPosting, queryClient]);

  // Shared text input component
  const renderTextInput = useCallback(() => (
    <View style={[
      styles.inputContainer,
      {
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: '#000',
        borderTopColor: '#333',
        alignItems: 'flex-start',
      },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'transparent', borderRadius: 18, borderWidth: 0, borderColor: 'transparent', position: 'relative' }}>
          <BottomSheetTextInput
            {...mentionInputProps}
            style={[
              styles.input,
              {
                backgroundColor: 'transparent',
                color: '#fff',
                borderColor: 'transparent',
                flex: 1,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                minHeight: 40,
                maxHeight: 120,
                paddingRight: 0,
                textAlignVertical: 'center',
                fontWeight: '600',
                fontFamily: 'Firma-SemiBold',
              },
            ]}
            placeholder={replyContext ? `Reply to ${replyContext.authorName}...` : (totalComments === 0 ? 'Add a comment...' : 'say something nice...')}
            placeholderTextColor="#cfd6e8"
            multiline
            value={newCommentText}
            onChangeText={setNewCommentText}
            editable={!isPosting}
            ref={inputRef}
            maxLength={MAX_COMMENT_LENGTH + 25}
          />
          {(newCommentText.trim() || replyContext) && (
            <>
              <View style={{ width: 1, backgroundColor: '#333', alignSelf: 'stretch', marginVertical: 6 }} />
              <TouchableOpacity
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  alignSelf: 'flex-start',
                  justifyContent: 'center',
                  borderTopRightRadius: 18,
                  borderBottomRightRadius: 18,
                }}
                onPress={replyContext && !newCommentText.trim() ? handleCancelReply : handleSendComment}
                disabled={isPosting || (!newCommentText.trim() && !replyContext) || charCount > MAX_COMMENT_LENGTH}
              >
                <Icon 
                  name={replyContext && !newCommentText.trim() ? "close" : "send-plane-fill"} 
                  size={22} 
                  color={isPosting || (!newCommentText.trim() && !replyContext) || charCount > MAX_COMMENT_LENGTH ? '#ccc' : '#fff'} 
                />
              </TouchableOpacity>
            </>
          )}
          {showCharCount && (
            <View
              style={{
                position: 'absolute',
                bottom: 6,
                right: 0,
                width: 22 + 2 * 10,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <Text
                style={{
                  color: (MAX_COMMENT_LENGTH - charCount) <= 0 ? '#FF4D4F' : '#888',
                  fontSize: 12,
                  textAlign: 'center',
                  marginTop: 4,
                }}
              >
                {MAX_COMMENT_LENGTH - charCount}
              </Text>
            </View>
          )}
        </View>
      </View>
      <UserSearchModal {...userSearchModalProps} />
    </View>
  ), [mentionInputProps, replyContext, totalComments, newCommentText, isPosting, charCount, showCharCount, handleCancelReply, handleSendComment, userSearchModalProps, insets.bottom]);

  if (!visible) return null;

  return (
    <>
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={handleClose}
        keyboardBehavior="extend"
        style={{ zIndex: 100 }}
        backgroundStyle={{ backgroundColor: '#000', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0.5, borderTopColor: '#333' }}
        handleIndicatorStyle={{ backgroundColor: '#666', width: 40, height: 5 }}
        enableDynamicSizing={false}
      >
        <View style={{ width: '100%', backgroundColor: '#000', paddingHorizontal: 10, paddingTop: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <TabNavigation
            tabs={tabOptions}
            activeTab={activeTab}
            onTabPress={handleTabPress as any}
            textColor="#FFFFFF"
            backgroundColor="transparent"
            style={{ marginBottom: 0, paddingVertical: 0, marginTop: 0 }}
          />
          <RelativeDate
            dateString={post.indexedAt}
            style={{ color: '#888', fontSize: 15, marginLeft: 10 }}
          />
        </View>
        {activeTab === 'comments' ? (
          totalComments === 0 ? (
            <View style={{ flex: 1, justifyContent: 'space-between', minHeight: 220, paddingHorizontal: 0 }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                <Text style={{ color: '#cfd6e8', fontSize: 17, textAlign: 'center', fontWeight: '600', fontFamily: 'Firma-SemiBold' }}>No comments yet</Text>
              </View>
              {renderTextInput()}
            </View>
          ) : commentsLoading ? (
            <BottomSheetFlatList
              data={Array.from({ length: totalComments > 0 ? totalComments : 4 })}
              renderItem={() => (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 0 }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 1, borderColor: '#333' }}
                    shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '50%', height: 14, borderRadius: 3, marginBottom: 2 }}
                      shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                    />
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '35%', height: 14, borderRadius: 3, marginBottom: 4 }}
                      shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                    />
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '85%', height: 15, borderRadius: 4, marginBottom: 6 }}
                      shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                    />
                  </View>
                </View>
              )}
              keyExtractor={(_, idx) => `shimmer-${idx}`}
              contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
            />
          ) : (
            <>
              <BottomSheetVirtualizedList
                data={comments}
                keyExtractor={commentKeyExtractor}
                getItemCount={(data) => data.length}
                getItem={(data, index) => data[index]}
                renderItem={renderCommentItem}
                contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
                keyboardShouldPersistTaps="handled"
                onEndReached={() => {
                  if (hasNextCommentsPage && !isFetchingNextCommentsPage) {
                    fetchNextCommentsPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={5}
                removeClippedSubviews={true}
              />
              {renderTextInput()}
            </>
          )
        ) : (
          totalLikes === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220, paddingHorizontal: 24 }}>
              <Text style={{ color: '#cfd6e8', fontSize: 17, textAlign: 'center', fontWeight: '600', fontFamily: 'Firma-SemiBold' }}>No likes yet</Text>
            </View>
          ) : likesLoading ? (
            <BottomSheetFlatList
              data={Array.from({ length: totalLikes > 0 ? totalLikes : 4 })}
              renderItem={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 0 }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 1, borderColor: '#333' }}
                    shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '40%', height: 16, borderRadius: 2, marginBottom: 4 }}
                      shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                    />
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '55%', height: 16, borderRadius: 2 }}
                      shimmerColors={UI.Colors.SHIMMER.PRIMARY}
                    />
                  </View>
                </View>
              )}
              keyExtractor={(_, idx) => `shimmer-like-${idx}`}
              contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
            />
          ) : (
            <BottomSheetVirtualizedList
              data={likes}
              keyExtractor={likeKeyExtractor}
              getItemCount={(data) => data.length}
              getItem={(data, index) => data[index]}
              renderItem={renderLikeItem}
              contentContainerStyle={{ paddingBottom: 8, backgroundColor: '#000', paddingHorizontal: 10 }}
              onEndReached={() => {
                if (hasNextLikesPage && !isFetchingNextLikesPage) {
                  fetchNextLikesPage();
                }
              }}
              onEndReachedThreshold={0.5}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={true}
            />
          )
        )}
      </BottomSheet>
      <Modal
        visible={!!fullscreenImageUri}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenImageUri(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setFullscreenImageUri(null)}
        >
          {fullscreenImageUri && (
            <>
              <Image
                source={{ uri: fullscreenImageUri }}
                style={{ width: '95%', height: '80%', resizeMode: 'contain', borderRadius: 12 }}
              />
              {(() => {
                let altText: string | undefined = undefined;
                for (const comment of comments) {
                  const record = comment?.record || comment?.post?.record;
                  const embed = record?.embed || comment?.embed || comment?.post?.embed;
                  if (embed && typeof embed === 'object') {
                    if (embed.$type === 'app.bsky.embed.external' && embed.external && embed.external.uri === fullscreenImageUri) {
                      altText = embed.external.description || embed.external.title || undefined;
                      break;
                    }
                    if (Array.isArray(embed.images)) {
                      for (const img of embed.images) {
                        if ((img.fullsize === fullscreenImageUri || img.thumb === fullscreenImageUri) && img.alt) {
                          altText = img.alt;
                          break;
                        }
                      }
                    }
                  }
                  if (altText) break;
                }
                if (altText) {
                  return (
                    <Text style={{ color: '#ccc', fontSize: 15, marginTop: 16, textAlign: 'center', maxWidth: '90%' }}>{altText}</Text>
                  );
                }
                return null;
              })()}
            </>
          )}
          <Pressable
            style={{ position: 'absolute', top: 40, right: 24, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: 8 }}
            onPress={() => setFullscreenImageUri(null)}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✕</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  closeButton: {
    padding: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: UI.Colors.BACKGROUND.PRIMARY,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UI.Colors.BORDER.PRIMARY,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 15,
    backgroundColor: UI.Colors.BACKGROUND.ITEM,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    color: UI.Colors.TEXT.PRIMARY,
    borderWidth: 1,
    borderColor: UI.Colors.BORDER.PRIMARY,
    textAlignVertical: 'center',
  },
  sendButton: {
    padding: 8,
  },
});

export default CommentSection;
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { Colors } from '../../ui/UI';
import UI from '../../ui/UI';
import Icon, { HeartFillIcon, MoreFillIcon, CloseFillIcon } from '../../ui/Icon';
import ProfileCache, { profileKeys, useProfile } from '../../../services/cache/ProfileCache';
import VerificationBadge from '../verification/VerificationBadge';
import { TextWithAuthorLinks } from '../../ui/TextWithLinks';
import RelativeDate, { formatPostDate } from '../../ui/RelativeDate';
import PopUpModal from '../../ui/PopUpModal';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView, NativeViewGestureHandler } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetFlashList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useFocusEffect } from '@react-navigation/native';
import { ListRenderItemInfo } from 'react-native';
import { TouchableOpacity as BottomSheetTouchableOpacity } from '@gorhom/bottom-sheet';
import TabNavigation, { TabOption } from '../../layout/header/TabNavigation';
import { formatNumber } from '../../../utils/helpers/formatNumber';
import { useUserSearchTrigger, UserSearchModal } from '../../ui/usersearch';
import { useKeyboardState } from 'react-native-keyboard-controller';
import CommentItem, { Comment, Like } from './CommentItem';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    paddingVertical: 12,
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
        borderWidth: 0,
      }}
    />
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: Colors.white, fontSize: 16, marginBottom: 2, fontFamily: 'Firma-Bold' }}>
          {like.actor.displayName || like.actor.handle}
        </Text>
        {like.actor.handle && (
          <VerificationBadge
            handle={like.actor.handle}
            textSize={14}
            textColor={Colors.white}
            autoPosition={true}
          />
        )}
      </View>
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
  isLiked?: boolean;
  onOpenShareSheet?: () => void;
  postedAt?: string;
  onToggleLike?: () => void;
  isLikePending?: boolean;
}

const CommentSection: React.FC<CommentSectionProps> = ({
  post,
  onDismiss,
  visible,
  totalLikes = 0,
  totalComments = 0,
  isLiked,
  onOpenShareSheet,
  postedAt,
  onToggleLike,
  isLikePending,
}) => {
  const handleHeaderSharePress = useCallback(() => {
    // Fast transition: open share sheet immediately, close comments sheet
    onOpenShareSheet?.();
    try {
      bottomSheetRef.current?.close();
    } catch {}
    onDismiss?.();
  }, [onOpenShareSheet, onDismiss]);
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

  // Get current user's profile for avatar
  const [currentUserHandle, setCurrentUserHandle] = useState<string | null>(null);
  const { data: currentUserProfile } = useProfile(currentUserHandle);

  // Load current user handle
  useEffect(() => {
    const loadCurrentUserHandle = async () => {
      try {
        const storedHandle = await AsyncStorage.getItem('CURRENT_USER_HANDLE');
        if (storedHandle) {
          setCurrentUserHandle(storedHandle);
        } else {
          // Fallback to fetching current user
          const user = await AtprotoService.getCurrentUser();
          if (user?.handle) {
            setCurrentUserHandle(user.handle);
          }
        }
      } catch (error) {
        console.error('Error loading current user handle for comment input:', error);
      }
    };

    loadCurrentUserHandle();
  }, []);

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
    onDismiss?.();
  }, [onDismiss]);

  const tabOptions: TabOption[] = [
    { id: 'comments', label: totalComments > 0 ? `${formatNumber(totalComments)} Comments` : 'Comments' },
    { id: 'likes', label: totalLikes > 0 ? `${formatNumber(totalLikes)} Likes` : 'Likes' },
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
        backgroundColor: Colors.black,
        alignItems: 'flex-start',
      },
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
        {/* Current user avatar */}
        {currentUserProfile?.avatar && (
          <View style={{ marginRight: 12, marginTop: 2 }}>
            <UI.Avatar
              uri={currentUserProfile.avatar}
              type="profile"
              size={42}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                borderWidth: 0,
              }}
            />
          </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'transparent', borderRadius: 18, borderWidth: 0, borderColor: 'transparent', position: 'relative' }}>
          <BottomSheetTextInput
            {...mentionInputProps}
            style={[
              styles.input,
              {
                backgroundColor: 'transparent',
                color: Colors.white,
                borderColor: 'transparent',
                flex: 1,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                minHeight: 40,
                maxHeight: 120,
                paddingRight: 0,
                paddingTop: 10,
                textAlignVertical: 'center',
                fontFamily: 'Firma-Regular',
                fontSize: 18,
              },
            ]}
            placeholder={replyContext ? `reply to ${replyContext.authorName}...` : (totalComments === 0 ? 'add a comment...' : 'Say something nice...')}
            placeholderTextColor={Colors.gray}
            multiline
            value={newCommentText}
            onChangeText={setNewCommentText}
            editable={!isPosting}
            ref={inputRef}
            maxLength={MAX_COMMENT_LENGTH + 25}
          />
          {(newCommentText.trim() || replyContext) && (
            <TouchableOpacity
              style={{
                paddingHorizontal: 6,
                paddingVertical: 8,
                alignSelf: 'flex-start',
                justifyContent: 'center',
                marginTop: 2,
                borderTopRightRadius: 18,
                borderBottomRightRadius: 18,
              }}
              onPress={replyContext && !newCommentText.trim() ? handleCancelReply : handleSendComment}
              disabled={isPosting || (!newCommentText.trim() && !replyContext) || charCount > MAX_COMMENT_LENGTH}
            >
              <Icon 
                name={replyContext && !newCommentText.trim() ? "close" : "send-plane-fill"} 
                size={26} 
                color={Colors.white} 
              />
            </TouchableOpacity>
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
  ), [mentionInputProps, replyContext, totalComments, newCommentText, isPosting, charCount, showCharCount, handleCancelReply, handleSendComment, userSearchModalProps, insets.bottom, currentUserProfile]);

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
        backgroundStyle={{ backgroundColor: Colors.black, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0.5, borderTopColor: Colors.mediumGray }}
        enableDynamicSizing={false}
        handleComponent={null}
      >
        <View style={{ width: '100%', backgroundColor: Colors.black, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 0 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TabNavigation
              tabs={tabOptions}
              activeTab={activeTab}
              onTabPress={handleTabPress as any}
              textColor={Colors.white}
              backgroundColor="transparent"
              style={{ marginBottom: 0, paddingVertical: 0, marginTop: 0 }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
            <RelativeDate
              dateString={postedAt || post.indexedAt}
              style={{ color: Colors.gray, fontSize: 15, marginRight: 8 }}
            />
            <BottomSheetTouchableOpacity
              onPress={handleHeaderSharePress}
              activeOpacity={0.7}
              style={{ padding: 6, marginRight: 6 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreFillIcon size={20} color={Colors.lightGray} />
            </BottomSheetTouchableOpacity>
            <BottomSheetTouchableOpacity
              onPress={onToggleLike}
              activeOpacity={0.7}
              disabled={!!isLikePending}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ padding: 6, paddingRight: 0 }}
            >
              <HeartFillIcon size={26} color={isLiked ? Colors.INTERACTIVE.HEART.ACTIVE : Colors.gray} />
            </BottomSheetTouchableOpacity>
          </View>
        </View>
        {activeTab === 'comments' ? (
          totalComments === 0 ? (
            <View style={{ flex: 1, justifyContent: 'space-between', minHeight: 220, paddingHorizontal: 0 }}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
                <Text style={{ color: Colors.white, fontSize: 17, textAlign: 'center', fontFamily: 'Firma-SemiBold' }}>no comments yet</Text>
              </View>
              {renderTextInput()}
            </View>
          ) : commentsLoading ? (
            <BottomSheetFlashList
              data={Array.from({ length: totalComments > 0 ? totalComments : 4 })}
              renderItem={() => (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 0 }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 0 }}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '55%', height: 18, borderRadius: 3, marginBottom: 2 }}
                      shimmerColors={Colors.SHIMMER.PRIMARY}
                    />
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '85%', height: 16, borderRadius: 4, marginTop: 2 }}
                      shimmerColors={Colors.SHIMMER.PRIMARY}
                    />
                  </View>
                </View>
              )}
              keyExtractor={(_, idx) => `shimmer-${idx}`}
              contentContainerStyle={{ paddingBottom: 8, backgroundColor: Colors.black, paddingHorizontal: 10 }}
              focusHook={useFocusEffect}
            />
          ) : (
            <>
              <BottomSheetFlashList
                data={comments}
                keyExtractor={commentKeyExtractor}
                renderItem={renderCommentItem}
                contentContainerStyle={{ paddingBottom: 8, backgroundColor: Colors.black, paddingHorizontal: 10 }}
                keyboardShouldPersistTaps="handled"
                onEndReached={() => {
                  if (hasNextCommentsPage && !isFetchingNextCommentsPage) {
                    fetchNextCommentsPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                focusHook={useFocusEffect}
              />
              {isFetchingNextCommentsPage && (
                <View style={{ paddingVertical: 16, alignItems: 'center', backgroundColor: Colors.black }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                </View>
              )}
              {renderTextInput()}
            </>
          )
        ) : (
          totalLikes === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220, paddingHorizontal: 24 }}>
                              <Text style={{ color: Colors.white, fontSize: 17, textAlign: 'center', fontFamily: 'Firma-SemiBold' }}>no likes yet</Text>
            </View>
          ) : likesLoading ? (
            <BottomSheetFlashList
              data={Array.from({ length: totalLikes > 0 ? totalLikes : 4 })}
              renderItem={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 0 }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, borderWidth: 0 }}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <ShimmerPlaceholder
                      LinearGradient={LinearGradient}
                      style={{ width: '55%', height: 18, borderRadius: 3, marginBottom: 0 }}
                      shimmerColors={Colors.SHIMMER.PRIMARY}
                    />
                  </View>
                </View>
              )}
              keyExtractor={(_, idx) => `shimmer-like-${idx}`}
              contentContainerStyle={{ paddingBottom: 8, backgroundColor: Colors.black, paddingHorizontal: 10 }}
              focusHook={useFocusEffect}
            />
          ) : (
            <>
              <BottomSheetFlashList
                data={likes}
                keyExtractor={likeKeyExtractor}
                renderItem={renderLikeItem}
                contentContainerStyle={{ paddingBottom: 8, backgroundColor: Colors.black, paddingHorizontal: 10 }}
                onEndReached={() => {
                  if (hasNextLikesPage && !isFetchingNextLikesPage) {
                    fetchNextLikesPage();
                  }
                }}
                onEndReachedThreshold={0.5}
                focusHook={useFocusEffect}
              />
              {isFetchingNextLikesPage && (
                <View style={{ paddingVertical: 16, alignItems: 'center', backgroundColor: Colors.black }}>
                  <ShimmerPlaceholder
                    LinearGradient={LinearGradient}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    shimmerColors={Colors.SHIMMER.PRIMARY}
                  />
                </View>
              )}
            </>
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
                style={{ width: '95%', height: '80%', resizeMode: 'contain', borderRadius: 15 }}
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
                    <Text style={{ color: Colors.white, fontSize: 15, marginTop: 16, textAlign: 'center', maxWidth: '90%' }}>{altText}</Text>
                  );
                }
                return null;
              })()}
            </>
          )}
          <Pressable
            style={{ position: 'absolute', top: insets.top + 16, left: 24, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: 12 }}
            onPress={() => setFullscreenImageUri(null)}
          >
            <CloseFillIcon size={28} color={Colors.white} />
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
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.white,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 18,
    color: Colors.darkGray,
  },
  closeButton: {
    padding: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.darkGray,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 15,
    backgroundColor: Colors.darkGray,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    color: UI.Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray,
    textAlignVertical: 'center',
  },
  sendButton: {
    padding: 8,
  },
});

export default CommentSection;
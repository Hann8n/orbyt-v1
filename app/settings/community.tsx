/**
 * Community – Ideas and Feature Requests
 * Lists topics from community.getorbyt.com; tap to open in browser.
 */
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Linking,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ListHeader from '../../src/components/ui/ListHeader';
import Icon from '../../src/components/ui/Icon';
import { Loading } from '../../src/components/ui/UI';
import { Colors } from '../../src/theme';
import { BORDER_RADIUS, DISCOURSE } from '../../src/utils/constants';
import { queryKeys } from '../../src/utils/query/queryKeys';

const COMMUNITY_URL = DISCOURSE.COMMUNITY_URL;
const IDEAS_JSON = `${COMMUNITY_URL}/c/${DISCOURSE.IDEAS_CATEGORY_SLUG}/${DISCOURSE.IDEAS_CATEGORY_ID}.json`;

interface DiscourseTopic {
  id: number;
  title: string;
  fancy_title: string;
  slug: string;
  like_count: number;
  vote_count?: number; // Topic Voting plugin; use this for vote tally when present
  posts_count: number;
  reply_count: number;
}

interface CategoryResponse {
  topic_list?: {
    topics: DiscourseTopic[];
  };
}

async function fetchCategory(): Promise<DiscourseTopic[]> {
  const res = await fetch(IDEAS_JSON);
  if (!res.ok) throw new Error('Failed to load topics');
  const data = (await res.json()) as CategoryResponse;
  return data.topic_list?.topics ?? [];
}

function TopicRow({
  topic,
  onPress,
}: {
  topic: DiscourseTopic;
  onPress: (topic: DiscourseTopic) => void;
}) {
  const voteCount = topic.vote_count ?? topic.like_count;
  return (
    <TouchableOpacity style={styles.topicRow} onPress={() => onPress(topic)} activeOpacity={0.7}>
      <View style={styles.topicContent}>
        <Text style={styles.topicTitle} numberOfLines={2}>
          {topic.fancy_title || topic.title}
        </Text>
        <Text style={styles.topicMeta}>
          {topic.like_count} {topic.like_count === 1 ? 'like' : 'likes'} · {topic.reply_count}{' '}
          {topic.reply_count === 1 ? 'reply' : 'replies'}
        </Text>
      </View>
      <View style={styles.voteTallyButton}>
        <Icon
          name="arrow-up-fill"
          size={16}
          color={voteCount >= 1 ? Colors.brand.teal : Colors.neutral[200]}
        />
        <Text
          style={[
            styles.voteTallyCount,
            voteCount === 0 && { color: Colors.neutral[200] },
            voteCount >= 1 && { color: Colors.brand.teal },
          ]}
        >
          {voteCount === 0 ? 'vote' : voteCount}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function CommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    data: topics = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: queryKeys.discourse.categoryTopics(DISCOURSE.IDEAS_CATEGORY_ID),
    queryFn: fetchCategory,
    staleTime: 2 * 60 * 1000,
  });

  const openInBrowser = (topic: DiscourseTopic) => {
    Linking.openURL(`${COMMUNITY_URL}/t/${topic.slug}/${topic.id}`);
  };

  const showFooter = !isLoading && !isError;
  const openForumUrl = `${COMMUNITY_URL}/c/${DISCOURSE.IDEAS_CATEGORY_SLUG}/${DISCOURSE.IDEAS_CATEGORY_ID}`;

  return (
    <View style={styles.container}>
      <ListHeader
        mode="sheet"
        title="Ideas & feature requests"
        showCloseButton
        onClosePress={() => router.dismiss()}
        applySafeAreaTop={false}
        backgroundColor={Colors.black}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          showFooter && { paddingBottom: 56 + insets.bottom },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefetching && !isLoading} onRefresh={() => refetch()} />
        }
      >
        {isLoading && (
          <View style={[styles.centered, styles.loadingWrapper]}>
            <Loading size="large" color={Colors.neutral[50]} />
          </View>
        )}
        {isError && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>
              {error instanceof Error ? error.message : 'Failed to load'}
            </Text>
          </View>
        )}
        {!isLoading &&
          !isError &&
          topics.length > 0 &&
          topics.map(topic => <TopicRow key={topic.id} topic={topic} onPress={openInBrowser} />)}
        {!isLoading && !isError && topics.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No topics yet.</Text>
          </View>
        )}
      </ScrollView>
      {showFooter && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={styles.openForumFooter} onPress={() => Linking.openURL(openForumUrl)}>
            <Text style={styles.openForumFooterText}>Open forum in browser</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  footer: {
    backgroundColor: Colors.black,
    paddingTop: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  centered: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrapper: {
    minHeight: 200,
  },
  errorText: {
    fontSize: 15,
    color: Colors.brand.coral,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.neutral[400],
  },
  openForumFooter: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.FULL,
  },
  openForumFooterText: {
    color: Colors.neutral[50],
    fontSize: 14,
    fontFamily: 'Figtree-SemiBold',
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.neutral[800],
  },
  topicContent: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[50],
  },
  topicMeta: {
    fontSize: 13,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  voteTallyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginLeft: 12,
    backgroundColor: Colors.neutral[900],
    borderRadius: BORDER_RADIUS.LARGE,
    minWidth: 52,
  },
  voteTallyCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[50],
  },
});

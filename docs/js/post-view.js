/**
 * Bluesky Post View with TanStack Query
 * Fetches and displays a single Bluesky post with video player
 * Uses TanStack Query Core for caching and request deduplication
 */

import { getQueryClient, queryKeys, fetchQuery } from './query-client.js';

const BLUESKY_API_BASE = 'https://public.api.bsky.app/xrpc';
const GET_POSTS_ENDPOINT = `${BLUESKY_API_BASE}/app.bsky.feed.getPosts`;
const GET_POST_THREAD_ENDPOINT = `${BLUESKY_API_BASE}/app.bsky.feed.getPostThread`;
const GET_PROFILE_ENDPOINT = `${BLUESKY_API_BASE}/app.bsky.actor.getProfile`;

/**
 * Parse URL to extract handle and post ID (rkey)
 * Supports:
 * - Router-provided data (window.__currentRoute)
 * - Query params: ?user=handle&post=postId
 * - Path-based: /@handle/postId
 * - Direct path: /handle/postId
 */
function parsePostURL() {
  // First check for router-provided route data
  if (window.__currentRoute) {
    if (window.__currentRoute.type === 'post') {
      return {
        handle: window.__currentRoute.handle ? window.__currentRoute.handle.trim() : null,
        postId: window.__currentRoute.postId ? window.__currentRoute.postId.trim() : null,
      };
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  let handle = urlParams.get('user');
  let postId = urlParams.get('post');

  // If no query params, try path-based routing
  if (!handle || !postId) {
    const path = window.location.pathname;

    // Match patterns like /@username/postId or /username/postId
    const pathMatch = path.match(/[@]?([^/]+)\/([^/]+)$/);
    if (pathMatch) {
      handle = pathMatch[1];
      postId = pathMatch[2];

      // Remove @ prefix if present
      if (handle.startsWith('@')) {
        handle = handle.substring(1);
      }
    }
  }

  // Remove @ prefix if present in query param
  if (handle && handle.startsWith('@')) {
    handle = handle.substring(1);
  }

  return {
    handle: handle ? handle.trim() : null,
    postId: postId ? postId.trim() : null,
  };
}

/**
 * Fetch profile for DID lookup (query function for TanStack Query)
 * @param {string} handle - User handle
 * @returns {Promise<Object>} Profile data with DID
 */
async function fetchProfileForDID(handle) {
  const url = `${GET_PROFILE_ENDPOINT}?actor=${encodeURIComponent(handle)}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Profile not found: ${handle}`);
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.message || `API error: ${data.error}`);
  }

  if (!data.did) {
    throw new Error('Invalid profile data: missing DID');
  }

  return data;
}

/**
 * Build AT URI from handle and post ID using cached profile data
 * @param {string} handle - User handle
 * @param {string} rkey - Record key (post ID)
 * @returns {Promise<string>} AT URI
 */
async function buildPostURI(handle, rkey) {
  try {
    const queryClient = await getQueryClient();
    // Use query cache to get profile (reuse profile query from bluesky-profile.js)
    const queryKey = queryKeys.profile(handle);

    // Try to get from cache first
    let profileData = queryClient.getQueryData(queryKey);

    // If not in cache, fetch it (will be cached for future use)
    if (!profileData) {
      profileData = await fetchQuery(queryClient, queryKey, () => fetchProfileForDID(handle), {
        staleTime: 5 * 60 * 1000, // 5-minute stale time
        gcTime: 10 * 60 * 1000, // 10-minute cache time
      });
    }

    if (profileData && profileData.did) {
      return `at://${profileData.did}/app.bsky.feed.post/${rkey}`;
    }
  } catch (profileError) {
    console.warn('Could not fetch profile for DID lookup:', profileError);
  }
  throw new Error(`Could not build URI for post: @${handle}/${rkey}`);
}

/**
 * Fetch a single post from Bluesky API using getPosts endpoint (query function for TanStack Query)
 * @param {string} uri - AT URI of the post
 * @returns {Promise<Object>} Post data with stats
 */
async function fetchPostQuery(uri) {
  // Use getPosts endpoint which returns view format with playlist URL directly
  const postsUrl = `${GET_POSTS_ENDPOINT}?uris=${encodeURIComponent(uri)}`;
  const postsResponse = await fetch(postsUrl);

  if (!postsResponse.ok) {
    if (postsResponse.status === 404) {
      throw new Error(`Post not found: ${uri}`);
    }
    throw new Error(`API error: ${postsResponse.status} ${postsResponse.statusText}`);
  }

  const postsData = await postsResponse.json();

  if (postsData.error) {
    throw new Error(postsData.message || `API error: ${postsData.error}`);
  }

  if (!postsData.posts || postsData.posts.length === 0) {
    throw new Error(`Post not found: ${uri}`);
  }

  const postView = postsData.posts[0];

  // Fetch thread data to get engagement stats (repostCount, likeCount, etc.)
  try {
    const threadUrl = `${GET_POST_THREAD_ENDPOINT}?uri=${encodeURIComponent(uri)}&depth=0`;
    const threadResponse = await fetch(threadUrl);

    if (threadResponse.ok) {
      const threadData = await threadResponse.json();
      if (threadData.thread?.post) {
        // Merge stats into post view
        postView.repostCount = threadData.thread.post.repostCount || 0;
        postView.likeCount = threadData.thread.post.likeCount || 0;
        postView.replyCount = threadData.thread.post.replyCount || 0;
      }
    }
  } catch (threadError) {
    console.warn('Could not fetch thread stats:', threadError);
    // Continue with post data only
    postView.repostCount = 0;
    postView.likeCount = 0;
    postView.replyCount = 0;
  }

  // Return in format compatible with existing renderPost function
  return {
    value: postView.record,
    uri: postView.uri,
    cid: postView.cid,
    author: postView.author,
    embed: postView.embed,
    repostCount: postView.repostCount || 0,
    likeCount: postView.likeCount || 0,
    replyCount: postView.replyCount || 0,
  };
}

/**
 * Fetch a single post from Bluesky API using TanStack Query
 * @param {string} handle - User handle
 * @param {string} rkey - Record key (post ID)
 * @returns {Promise<Object>} Post data with stats
 */
async function fetchPost(handle, rkey) {
  // Build AT URI first (this will use cached profile if available)
  const uri = await buildPostURI(handle, rkey);

  // Use TanStack Query to fetch post with caching
  const queryClient = await getQueryClient();
  const queryKey = queryKeys.post(handle, rkey);

  return await fetchQuery(queryClient, queryKey, () => fetchPostQuery(uri), {
    staleTime: 10 * 60 * 1000, // 10-minute stale time for posts (static after publish)
    gcTime: 30 * 60 * 1000, // 30-minute cache time for posts
  });
}

/**
 * Fetch author profile from Bluesky API (query function for TanStack Query)
 * @param {string} handle - User handle or DID
 * @returns {Promise<Object>} Profile data
 */
async function fetchAuthorProfileQuery(handle) {
  const url = `${GET_PROFILE_ENDPOINT}?actor=${encodeURIComponent(handle)}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Profile not found: ${handle}`);
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.message || `API error: ${data.error}`);
  }

  return data;
}

/**
 * Fetch author profile using TanStack Query (reuses profile cache)
 * @param {string} handle - User handle or DID
 * @returns {Promise<Object>} Profile data
 */
async function fetchAuthorProfile(handle) {
  const queryClient = await getQueryClient();
  const queryKey = queryKeys.profile(handle);

  // Use TanStack Query to fetch profile with caching
  // This will reuse the same cache as bluesky-profile.js
  return await fetchQuery(queryClient, queryKey, () => fetchAuthorProfileQuery(handle), {
    staleTime: 5 * 60 * 1000, // 5-minute stale time for profiles
    gcTime: 10 * 60 * 1000, // 10-minute cache time
  });
}

/**
 * Extract video URL from post embed data
 * Can accept either postRecord (from getRecord) or postView (from getPosts)
 * @param {Object} postData - Post data from API (can be record or view format)
 * @returns {Object|null} Video data with URL, thumbnail, and aspect ratio
 */
function extractVideoData(postData) {
  if (!postData) return null;

  // Handle view format (from getPosts) - embed is directly on postData
  let embed = postData.embed;

  // Handle record format (from getRecord) - embed is on value.embed
  if (!embed && postData.value) {
    embed = postData.value.embed;
  }

  if (!embed) return null;

  // Check for direct video view format (from getPosts)
  if (embed.$type === 'app.bsky.embed.video#view') {
    return extractVideoDataFromEmbed(embed, postData.uri);
  }

  // Check for video record format (from getRecord)
  if (embed.$type === 'app.bsky.embed.video') {
    return extractVideoDataFromEmbed(embed, postData.uri || postData.value?.uri);
  }

  // Check for recordWithMedia format
  if (embed.$type === 'app.bsky.embed.recordWithMedia') {
    const media = embed.media;
    if (
      media &&
      (media.$type === 'app.bsky.embed.video#view' || media.$type === 'app.bsky.embed.video')
    ) {
      return extractVideoDataFromEmbed(media, postData.uri || postData.value?.uri);
    }
  }

  return null;
}

/**
 * Extract video data from embed object
 * @param {Object} embed - Embed object (can be record embed or view embed)
 * @param {string} uri - Post URI
 * @returns {Object|null} Video data
 */
function extractVideoDataFromEmbed(embed, uri) {
  // Check if this is a view embed (from getPosts - has playlist URL directly)
  if (embed.$type === 'app.bsky.embed.video#view') {
    if (embed.playlist) {
      // Use playlist URL directly (already in correct format)
      return {
        url: embed.playlist,
        thumbnail: embed.thumbnail || null,
        aspectRatio: embed.aspectRatio || { width: 9, height: 16 },
        mimeType: 'application/vnd.apple.mpegurl',
        cid: embed.cid || null,
        did: null,
      };
    }
    // If view but no playlist, try to construct from CID and DID
    if (embed.cid && uri) {
      const didMatch = uri.match(/did:plc:[^/]+/);
      const did = didMatch ? didMatch[0] : null;
      if (did) {
        return {
          url: `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(embed.cid)}/playlist.m3u8`,
          thumbnail: embed.thumbnail || null,
          aspectRatio: embed.aspectRatio || { width: 9, height: 16 },
          mimeType: 'application/vnd.apple.mpegurl',
          cid: embed.cid,
          did: did,
        };
      }
    }
  }

  // Otherwise, extract from record embed (video blob from getRecord)
  const videoBlob = embed.video;
  const thumbnail = embed.thumbnail;
  const aspectRatio = embed.aspectRatio;

  if (!videoBlob) {
    return null;
  }

  // Extract DID from URI if available
  const didMatch = uri ? uri.match(/did:plc:[^/]+/) : null;
  const did = didMatch ? didMatch[0] : null;

  // Extract CID from BlobRef - handle both direct link and nested ref
  let cid = null;
  if (videoBlob.ref) {
    if (typeof videoBlob.ref === 'string') {
      cid = videoBlob.ref;
    } else if (videoBlob.ref.$link) {
      cid = videoBlob.ref.$link;
    } else if (videoBlob.ref.cid) {
      cid = videoBlob.ref.cid;
    }
  }

  if (!cid) {
    console.warn('Could not extract CID from video blob:', videoBlob);
    return null;
  }

  // Construct video URL using video.bsky.app
  let videoUrl = null;
  if (did && cid) {
    videoUrl = `https://video.bsky.app/watch/${encodeURIComponent(did)}/${encodeURIComponent(cid)}/playlist.m3u8`;
  }

  if (!videoUrl) {
    console.warn('Could not construct HLS URL, missing DID. CID:', cid, 'URI:', uri);
    return null;
  }

  return {
    url: videoUrl,
    thumbnail: thumbnail || null,
    aspectRatio: aspectRatio || { width: 9, height: 16 },
    mimeType: videoBlob.mimeType || 'video/mp4',
    cid: cid,
    did: did,
  };
}

/**
 * Format relative time (e.g., "2h", "3d", "1mo")
 * @param {string} createdAt - ISO timestamp
 * @returns {string} Formatted time
 */
function formatRelativeTime(createdAt) {
  if (!createdAt) return '';

  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths > 0) {
    return `${diffMonths}mo`;
  } else if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else if (diffMins > 0) {
    return `${diffMins}m`;
  } else {
    return 'now';
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Escape HTML attribute value to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped attribute value
 */
function escapeHtmlAttribute(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert URLs to clickable abbreviated links
 * @param {string} text - Text containing URLs
 * @returns {string} Text with URLs converted to abbreviated clickable links (HTML)
 */
function convertUrlsToLinks(text) {
  if (!text) return text;

  // Match URLs (http/https/www patterns)
  // This matches: http://example.com, https://example.com, www.example.com, example.com/path
  const urlRegex =
    /(https?:\/\/)?(www\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}([\/][^\s]*)?/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  // Find all URLs and split text around them
  while ((match = urlRegex.exec(text)) !== null) {
    // Add text before URL (escaped)
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.substring(lastIndex, match.index)));
    }

    // Process URL
    try {
      let urlString = match[0];

      // If it doesn't have a protocol, add https:// for URL parsing
      if (!match[0].startsWith('http://') && !match[0].startsWith('https://')) {
        urlString = 'https://' + match[0];
      }

      // Try to parse as URL to extract hostname and path
      const url = new URL(urlString);
      let domain = url.hostname;

      // Remove www prefix
      if (domain.toLowerCase().startsWith('www.')) {
        domain = domain.substring(4);
      }

      // Get pathname (first part after /) for abbreviation
      const pathname = url.pathname;
      let displayText = domain;
      if (pathname && pathname.length > 1) {
        // Get first segment of path (up to 8 characters) then add ...
        const pathSegment = pathname.substring(1).split('/')[0];
        if (pathSegment && pathSegment.length > 0) {
          const shortPath = pathSegment.length > 8 ? pathSegment.substring(0, 8) : pathSegment;
          displayText = `${domain}/${shortPath}...`;
        }
      }

      // Create link with abbreviated text
      const finalUrl = match[0].startsWith('http') ? match[0] : urlString;
      const escapedUrl = escapeHtmlAttribute(finalUrl);
      const escapedDisplayText = escapeHtml(displayText);
      parts.push(
        `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${escapedDisplayText}</a>`
      );
    } catch (e) {
      // If URL parsing fails, fall back to manual extraction
      let cleanMatch = match[0];
      // Remove protocol
      cleanMatch = cleanMatch.replace(/^https?:\/\//i, '');
      // Remove www prefix
      cleanMatch = cleanMatch.replace(/^www\./i, '');
      // Extract domain and path parts
      const parts_match = cleanMatch.split('/');
      const domain = parts_match[0];
      let displayText = domain;
      // Check if there's a path after the domain
      if (parts_match.length > 1 && parts_match[1]) {
        const pathSegment = parts_match[1];
        const shortPath = pathSegment.length > 8 ? pathSegment.substring(0, 8) : pathSegment;
        displayText = `${domain}/${shortPath}...`;
      }
      const urlString = match[0].startsWith('http') ? match[0] : 'https://' + match[0];
      const escapedUrl = escapeHtmlAttribute(urlString);
      const escapedDisplayText = escapeHtml(displayText);
      parts.push(
        `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${escapedDisplayText}</a>`
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last URL (escaped)
  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.substring(lastIndex)));
  }

  // If no URLs found, just escape and return the text
  if (parts.length === 0) {
    return escapeHtml(text);
  }

  return parts.join('');
}

/**
 * Update meta tags for social sharing
 * @param {Object} postData - Post data
 * @param {Object} authorProfile - Author profile data
 */
function updateMetaTags(postData, authorProfile) {
  const caption = postData.value?.text || 'Bluesky video post';
  const authorName = authorProfile?.displayName || authorProfile?.handle || 'Unknown';
  const handle = authorProfile?.handle || '';
  const avatar = authorProfile?.avatar || '';
  const videoData = extractVideoData(postData);
  const thumbnail = videoData?.thumbnail || avatar;

  // Update title
  document.title = `@${handle} - ${caption.substring(0, 50)}${caption.length > 50 ? '...' : ''}`;

  // Update meta description
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.setAttribute('name', 'description');
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute('content', caption);

  // Update OG tags
  const ogTags = {
    'og:title': `@${handle} on orbyt`,
    'og:description': caption,
    'og:image': thumbnail,
    'og:type': 'video.other',
    'og:url': window.location.href,
  };

  Object.entries(ogTags).forEach(([property, content]) => {
    let tag = document.querySelector(`meta[property="${property}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('property', property);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  });

  // Add video-specific OG tags if video URL exists
  if (videoData?.url) {
    let ogVideo = document.querySelector('meta[property="og:video"]');
    if (!ogVideo) {
      ogVideo = document.createElement('meta');
      ogVideo.setAttribute('property', 'og:video');
      document.head.appendChild(ogVideo);
    }
    ogVideo.setAttribute('content', videoData.url);
  }

  // Update Twitter card tags
  const twitterTags = {
    'twitter:card': 'summary_large_image',
    'twitter:title': `@${handle} on orbyt`,
    'twitter:description': caption,
    'twitter:image': thumbnail,
  };

  Object.entries(twitterTags).forEach(([name, content]) => {
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  });
}

/**
 * Render post data into HTML
 * @param {Object} postData - Post data from API
 * @param {Object} authorProfile - Author profile data
 */
function renderPost(postData, authorProfile) {
  // Handle both view format (from getPosts) and record format (from getRecord)
  const postValue = postData.value || postData.record || postData;
  const caption = postValue?.text || '';
  const createdAt = postValue?.createdAt || '';
  const handle = authorProfile?.handle || postData.repo || '';
  const displayName = authorProfile?.displayName || handle;
  const avatar = authorProfile?.avatar || '';

  const videoData = extractVideoData(postData);

  // Update captions with clickable abbreviated links
  const captionMobile = document.getElementById('post-caption-mobile');
  const captionDesktop = document.getElementById('post-caption-desktop');
  const captionWithLinks = convertUrlsToLinks(caption);
  if (captionMobile) captionMobile.innerHTML = captionWithLinks;
  if (captionDesktop) captionDesktop.innerHTML = captionWithLinks;

  // Update author info
  const avatarMobile = document.getElementById('author-avatar-mobile');
  const avatarDesktop = document.getElementById('author-avatar-desktop');
  const linkMobile = document.getElementById('author-link-mobile');
  const linkDesktop = document.getElementById('author-link-desktop');
  const timeMobile = document.getElementById('post-time-mobile');
  const timeDesktop = document.getElementById('post-time-desktop');

  if (avatarMobile) {
    avatarMobile.src = avatar || '/images/Default-avatar.png';
    avatarMobile.alt = `${displayName}'s avatar`;
    avatarMobile.onerror = function () {
      this.src = '/images/Default-avatar.png';
    };
  }
  if (avatarDesktop) {
    avatarDesktop.src = avatar || '/images/Default-avatar.png';
    avatarDesktop.alt = `${displayName}'s avatar`;
    avatarDesktop.onerror = function () {
      this.src = '/images/Default-avatar.png';
    };
  }

  if (linkMobile) {
    linkMobile.textContent = displayName;
    linkMobile.href = `/@${encodeURIComponent(handle)}`;
  }
  if (linkDesktop) {
    linkDesktop.textContent = displayName;
    linkDesktop.href = `/@${encodeURIComponent(handle)}`;
  }

  const relativeTime = formatRelativeTime(createdAt);
  if (timeMobile) timeMobile.textContent = relativeTime;
  if (timeDesktop) timeDesktop.textContent = relativeTime;

  // Update likes count
  const likesCountMobile = document.getElementById('likes-count-mobile');
  const likesCountDesktop = document.getElementById('likes-count-desktop');
  // Get likeCount from postData if available (from getPostThread), otherwise default to 0
  const likesCount = postData.likeCount || 0;
  if (likesCountMobile) likesCountMobile.textContent = likesCount;
  if (likesCountDesktop) likesCountDesktop.textContent = likesCount;

  // Setup video player
  const videoEl = document.getElementById('vinit');
  if (videoEl && videoData && videoData.url) {
    console.log('Video data found:', {
      url: videoData.url,
      thumbnail: videoData.thumbnail,
      aspectRatio: videoData.aspectRatio,
    });

    // Set video attributes for autoplay and looping (TikTok style)
    videoEl.setAttribute('autoplay', '');
    videoEl.setAttribute('loop', '');
    videoEl.setAttribute('playsinline', '');
    videoEl.muted = true; // Required for autoplay in most browsers

    // Set poster first
    if (videoData.thumbnail) {
      videoEl.poster = videoData.thumbnail;

      // Wait for poster to load before initializing responsive sizing (original pattern)
      const thumb = new Image();
      thumb.onload = function () {
        thumb.onload = null;
        // Call postResizer after poster loads (matches original pattern)
        postResizer();
      };
      thumb.onerror = function () {
        // Even if poster fails to load, still initialize sizing
        postResizer();
      };
      thumb.src = videoData.thumbnail;
    } else {
      // No thumbnail, initialize sizing immediately
      postResizer();
    }

    // Setup HLS playback
    if (videoData.url.includes('.m3u8')) {
      // Check if native HLS is supported (Safari/iOS)
      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support
        videoEl.src = videoData.url;
        videoEl.load();

        // Try to play after loading
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.play().catch(err => {
            console.warn('Native HLS autoplay prevented:', err);
          });
        });
      } else if (typeof Hls !== 'undefined') {
        // Use hls.js for browsers that don't support native HLS
        // Clear any existing src first
        videoEl.src = '';

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          autoStartLoad: true,
        });

        hls.loadSource(videoData.url);
        hls.attachMedia(videoEl);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest parsed, attempting playback');
          // Try to play after manifest is parsed
          videoEl.play().catch(err => {
            console.warn('HLS.js autoplay prevented:', err);
            // Store HLS instance for later manual play
            videoEl.hlsInstance = hls;
          });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS.js error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('Fatal network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('Fatal media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.error('Fatal error, destroying HLS instance');
                hls.destroy();
                break;
            }
          }
        });

        // Store HLS instance on video element for later access
        videoEl.hlsInstance = hls;
      } else {
        // Fallback: try to load directly (might work in some browsers)
        console.warn(
          'HLS.js not available, attempting direct HLS load (may not work in all browsers)'
        );
        videoEl.src = videoData.url;
        videoEl.load();

        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.play().catch(err => {
            console.warn('Direct HLS autoplay prevented:', err);
          });
        });
      }
    } else {
      // Regular video file (mp4, etc.)
      videoEl.src = videoData.url;
      videoEl.load();

      // Try to play after loading
      videoEl.addEventListener('loadedmetadata', () => {
        videoEl.play().catch(err => {
          console.warn('Video autoplay prevented:', err);
        });
      });
    }

    // Add comprehensive error handling
    videoEl.addEventListener('error', e => {
      console.error('Video load error:', e);
      console.error('Video element error details:', {
        error: videoEl.error,
        errorCode: videoEl.error ? videoEl.error.code : null,
        errorMessage: videoEl.error ? videoEl.error.message : null,
        networkState: videoEl.networkState,
        readyState: videoEl.readyState,
        src: videoEl.src,
        videoUrl: videoData.url,
      });
    });

    // Add click handler to video element to play/pause (only if clicking directly on video)
    videoEl.addEventListener('click', e => {
      e.stopPropagation();
      if (videoEl.paused) {
        videoEl.play().catch(err => console.warn('Play failed:', err));
      } else {
        videoEl.pause();
      }
    });

    // Ensure video plays when user interacts with the page (for browsers that block autoplay)
    const handleUserInteraction = () => {
      if (videoEl.paused && videoEl.readyState >= 2) {
        videoEl.play().catch(err => {
          // Ignore autoplay errors - user will need to click to play
          if (err.name !== 'NotAllowedError') {
            console.warn('Play attempt failed:', err);
          }
        });
      }
    };

    // Listen for user interaction on the document
    ['click', 'touchstart', 'keydown'].forEach(eventType => {
      document.addEventListener(eventType, handleUserInteraction, { once: true, passive: true });
    });
  } else if (videoEl) {
    // No video available - show message
    console.warn('No video data found in post:', {
      videoEl: !!videoEl,
      videoData: videoData,
      postData: postData,
    });
    const videoWrapper = document.getElementById('post-media');
    if (videoWrapper) {
      videoWrapper.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center; padding: 20px;">
          <p>No video available for this post</p>
          <a href="/@${encodeURIComponent(handle)}" style="color: #FF876C; text-decoration: underline;">Back to profile</a>
        </div>
      `;
    }
  } else {
    console.error('Video element not found in DOM');
  }

  // Update meta tags
  updateMetaTags(postData, authorProfile);
}

/**
 * Initialize video player controls
 */
function initVideoControls() {
  const videoEl = document.getElementById('vinit');
  const muteToggle = document.getElementById('mute-toggle');
  const muteText = document.getElementById('mute-text');

  if (!videoEl) return;

  // Ensure video is muted initially (required for autoplay)
  videoEl.muted = true;

  // Update mute text based on initial state
  if (muteText) {
    muteText.textContent = 'TAP TO UNMUTE';
  }

  // Mute toggle
  if (muteToggle) {
    muteToggle.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      if (videoEl.muted) {
        videoEl.muted = false;
        // Try to play if paused (user interaction allows unmuted playback)
        if (videoEl.paused) {
          videoEl.play().catch(err => {
            console.warn('Unmuted play failed:', err);
          });
        }
        if (muteText) muteText.textContent = 'TAP TO MUTE';
      } else {
        videoEl.muted = true;
        if (muteText) muteText.textContent = 'TAP TO UNMUTE';
      }
    });
  }

  // Ensure video plays when it can
  const ensurePlayback = () => {
    if (videoEl.readyState >= 2) {
      // HAVE_CURRENT_DATA
      videoEl.play().catch(err => {
        // Autoplay was prevented - this is expected in some browsers
        if (err.name !== 'NotAllowedError') {
          console.warn('Playback error:', err);
        }
      });
    }
  };

  // Try to play when video is ready
  videoEl.addEventListener('canplay', ensurePlayback);
  videoEl.addEventListener('loadeddata', ensurePlayback);
  videoEl.addEventListener('loadedmetadata', ensurePlayback);

  // Also try after a short delay to handle async loading
  setTimeout(ensurePlayback, 500);

  // Handle video ended event to restart (for looping)
  videoEl.addEventListener('ended', () => {
    videoEl.currentTime = 0;
    videoEl.play().catch(err => {
      console.warn('Loop play failed:', err);
    });
  });
}

/**
 * Initialize responsive video sizing
 * This matches the original postResizer() function pattern
 */
function initResponsiveVideo() {
  const videoEl = document.getElementById('vinit');
  const desktop = document.getElementById('desktop');
  const postOverlay = document.getElementById('post-overlay');

  if (!videoEl) return;

  function resizeVideo() {
    if (window.innerWidth >= 700) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Base calculation: height-based sizing
      const availableHeight = viewportHeight - 60;
      const maxHeight = Math.min(1200, availableHeight);
      const minHeight = 400;
      let videoHeight = Math.max(minHeight, maxHeight);

      // Calculate width based on 9:16 aspect ratio
      let columnWidth = (videoHeight * 9) / 16;

      // Apply scaling factor based on viewport width to shrink video as screen gets narrower
      // This makes the video shrink gradually before switching to mobile view
      let scaleFactor = 1.0;
      if (viewportWidth < 900) {
        // Linear scaling from 1.0 at 900px to 0.75 at 700px
        scaleFactor = 0.75 + (0.25 * (viewportWidth - 700)) / 200;
        scaleFactor = Math.max(0.75, Math.min(1.0, scaleFactor));
        videoHeight = videoHeight * scaleFactor;
        columnWidth = (videoHeight * 9) / 16;
      }

      // Account for available viewport width - ensure video doesn't exceed available space
      // Desktop content (max 374px, scales down with viewport via CSS) + padding + gap
      // Use a conservative estimate that scales with viewport
      let reservedSpace = 540; // Base: 374 + 60 + 30 + 40 + margin
      if (viewportWidth < 900) {
        // Scale reserved space proportionally as viewport shrinks
        const spaceScale = 0.7 + (0.3 * (viewportWidth - 700)) / 200; // 0.7 at 700px, 1.0 at 900px
        reservedSpace = Math.max(400, reservedSpace * spaceScale);
      }
      const maxVideoWidth = viewportWidth - reservedSpace;

      // If video width exceeds available space, scale down to fit
      if (columnWidth > maxVideoWidth && maxVideoWidth > 200) {
        columnWidth = maxVideoWidth;
        videoHeight = (columnWidth * 16) / 9;
        // Re-apply minimum height check
        if (videoHeight < minHeight) {
          videoHeight = minHeight;
          columnWidth = (videoHeight * 9) / 16;
        }
      }

      // Ensure minimum dimensions
      if (videoHeight < minHeight) {
        videoHeight = minHeight;
        columnWidth = (videoHeight * 9) / 16;
      }

      videoEl.style.height = `${videoHeight}px`;
      videoEl.style.width = `${columnWidth}px`;
      // Desktop container width is handled by CSS responsive styles, don't override it
    } else {
      videoEl.style.width = '100%';
      videoEl.style.height = 'auto';
      videoEl.style.verticalAlign = 'middle';
      if (desktop) {
        desktop.style.width = '';
      }
    }
  }

  function adjustOverlay() {
    if (!postOverlay) return;

    const scrollPosition = window.scrollY;
    const offsetHeight = videoEl.offsetHeight;
    const displayHeight = document.documentElement.clientHeight;
    const overlayOffset = Math.max(0, offsetHeight - displayHeight - scrollPosition);

    postOverlay.style.bottom = `${overlayOffset}px`;
  }

  // Initial resize
  resizeVideo();
  adjustOverlay();

  // Resize on window resize
  window.addEventListener('resize', () => {
    resizeVideo();
    adjustOverlay();
  });

  // Adjust overlay on scroll (throttled)
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        adjustOverlay();
        ticking = false;
      });
      ticking = true;
    }
  });
}

/**
 * postResizer function - alias for compatibility with original pattern
 */
function postResizer() {
  initResponsiveVideo();
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');

  if (loading) loading.style.display = 'none';
  if (error) error.style.display = 'flex';
  if (errorMessage) errorMessage.textContent = message;
}

/**
 * Show post content
 */
function showPostContent() {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const post = document.getElementById('post');

  if (loading) loading.style.display = 'none';
  if (error) error.style.display = 'none';
  if (post) {
    // Remove hidden class to let CSS media queries handle display property
    // CSS will set display:flex on desktop (>=700px) and display:block on mobile
    post.classList.remove('hidden');
  }
}

/**
 * Main initialization function
 */
async function initPostView() {
  try {
    // Parse URL to get handle and post ID
    const { handle, postId } = parsePostURL();

    if (!handle || !postId) {
      showError('Invalid URL format. Expected: /@handle/postId or ?user=handle&post=postId');
      return;
    }

    // Fetch post data
    const postData = await fetchPost(handle, postId);

    if (!postData || !postData.value) {
      throw new Error('Invalid post data received from API');
    }

    // Get author info from postData (from getPosts, author is included)
    let authorProfile = null;

    if (postData.author) {
      // Use author data from getPosts response
      authorProfile = postData.author;
    } else {
      // Fallback: fetch author profile if not included
      const postHandle = postData.repo || handle;
      const didMatch = postData.uri?.match(/did:plc:[^/]+/);

      try {
        try {
          authorProfile = await fetchAuthorProfile(postHandle);
        } catch (handleError) {
          if (didMatch) {
            authorProfile = await fetchAuthorProfile(didMatch[0]);
          } else {
            throw handleError;
          }
        }

        if (!authorProfile || !authorProfile.handle) {
          throw new Error('Invalid profile data');
        }
      } catch (profileError) {
        console.warn('Could not fetch author profile:', profileError);
        authorProfile = {
          handle: postHandle,
          displayName: postHandle,
          avatar: null,
          description: null,
        };
      }
    }

    // Render post (this will handle video loading and call postResizer after poster loads)
    renderPost(postData, authorProfile);
    showPostContent();

    // Initialize video controls
    initVideoControls();
    // Note: initResponsiveVideo/postResizer is called after poster loads in renderPost()
  } catch (error) {
    console.error('Failed to initialize post view:', error);
    showError(error.message || 'Failed to load post. Please check the URL and try again.');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPostView);
} else {
  initPostView();
}

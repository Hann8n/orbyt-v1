import { extractColorsFromImage } from '../formatting/colorUtils';
import { extractVideoThumbnail } from './video';
import { Colors } from '../../components/ui/UI';

// Cache for video background colors to avoid repeated processing
const backgroundCache = new Map<string, {
  colors: string[];
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

// Background processing queue to avoid blocking main thread
const processingQueue: Array<{
  post: any;
  resolve: (colors: string[]) => void;
  reject: (error: any) => void;
}> = [];

let isProcessing = false;
const BATCH_SIZE = 5; // Process more backgrounds at once
const BATCH_DELAY = 50; // Faster processing
const MAX_QUEUE_SIZE = 20; // Prevent queue from growing too large

/**
 * Generates a dynamic gradient background for a video card based on its thumbnail
 * Uses background processing and batching to ensure zero main thread impact
 */
export async function generateVideoBackground(post: any | null): Promise<string[]> {
  if (!post) return [];
  
  const cacheKey = post?.uri;
  
  // Check cache first - immediate return if cached
  if (cacheKey && backgroundCache.has(cacheKey)) {
    const cached = backgroundCache.get(cacheKey)!;
    const now = Date.now();
    
    // Return cached result if still valid
    if (now - cached.timestamp < CACHE_DURATION) {
      return cached.colors;
    }
    
    // Remove expired cache entry
    backgroundCache.delete(cacheKey);
  }
  
  // Extract thumbnail URL first (synchronous operation)
  const thumbnailUrl = extractVideoThumbnail(post?.embed);
  
  if (!thumbnailUrl) {
    // Return empty array immediately if no thumbnail
    cacheResult(cacheKey, []);
    return [];
  }
  
  // Return a promise that will be resolved in background processing
  return new Promise((resolve, reject) => {
    // Prevent queue from growing too large
    if (processingQueue.length >= MAX_QUEUE_SIZE) {
      // Remove oldest items to make room
      processingQueue.splice(0, processingQueue.length - MAX_QUEUE_SIZE + 1);
    }
    
    processingQueue.push({ post, resolve, reject });
    
    // Start background processing if not already running
    if (!isProcessing) {
      // Use requestIdleCallback or setTimeout to ensure non-blocking
      setTimeout(() => {
        processBackgroundQueue();
      }, 0);
    }
  });
}

/**
 * Processes background queue in batches to avoid blocking main thread
 */
async function processBackgroundQueue() {
  if (isProcessing || processingQueue.length === 0) return;
  
  isProcessing = true;
  
  try {
    while (processingQueue.length > 0) {
      // Process a batch of items
      const batch = processingQueue.splice(0, BATCH_SIZE);
      
      // Process batch in parallel with better error handling
      const promises = batch.map(async ({ post, resolve, reject }) => {
        try {
          const cacheKey = post?.uri;
          const thumbnailUrl = extractVideoThumbnail(post?.embed);
          
          if (!thumbnailUrl) {
            cacheResult(cacheKey, []);
            resolve([]);
            return;
          }
          
          // Extract colors from thumbnail (this is the expensive operation)
          const colorResult = await extractColorsFromImage(thumbnailUrl);
          
          // Generate gradient colors from extracted colors
          const gradientColors = generateGradientFromColors(colorResult);
          
          // Cache the result
          cacheResult(cacheKey, gradientColors);
          
          resolve(gradientColors);
        } catch (error) {
          console.warn('Error generating video background:', error);
          cacheResult(post?.uri, []);
          resolve([]); // Resolve with empty array instead of rejecting
        }
      });
      
      // Wait for batch to complete with timeout
      await Promise.race([
        Promise.all(promises),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
      ]);
      
      // Minimal delay between batches
      if (processingQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
  } catch (error) {
    console.warn('Background processing error:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Generates gradient colors from extracted image colors
 */
function generateGradientFromColors(colorResult: any): string[] {
  const { backgroundColor, accentColor, secondaryColor } = colorResult;
  
  // Create a 3-color gradient using the extracted colors
  const colors: string[] = [];
  
  // Start with a darker version of the background color
  const darkBg = darkenColor(backgroundColor, 0.3);
  colors.push(darkBg);
  
  // Middle color - blend background and accent
  const midColor = blendColors(backgroundColor, accentColor, 0.7);
  colors.push(midColor);
  
  // End with the original background color
  colors.push(backgroundColor);
  
  return colors;
}

/**
 * Generates a fallback gradient when thumbnail processing fails
 */
function generateFallbackGradient(): string[] {
  return [
    Colors.darkGray,
    Colors.mediumGray,
    Colors.black
  ];
}

/**
 * Darkens a color by a given factor
 */
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const newR = Math.max(0, Math.floor(r * (1 - factor)));
  const newG = Math.max(0, Math.floor(g * (1 - factor)));
  const newB = Math.max(0, Math.floor(b * (1 - factor)));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Blends two colors by a given ratio
 */
function blendColors(color1: string, color2: string, ratio: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const newR = Math.floor(r1 * ratio + r2 * (1 - ratio));
  const newG = Math.floor(g1 * ratio + g2 * (1 - ratio));
  const newB = Math.floor(b1 * ratio + b2 * (1 - ratio));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Caches a result with timestamp
 */
function cacheResult(key: string | undefined, colors: string[]) {
  if (!key) return;
  
  // Clean up cache if it's too large
  if (backgroundCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = backgroundCache.keys().next().value;
    backgroundCache.delete(oldestKey);
  }
  
  backgroundCache.set(key, {
    colors,
    timestamp: Date.now()
  });
}

/**
 * Clears the background cache (useful for memory management)
 */
export function clearBackgroundCache(): void {
  backgroundCache.clear();
}

/**
 * Clears the processing queue (useful for cleanup)
 */
export function clearProcessingQueue(): void {
  processingQueue.length = 0;
  isProcessing = false;
}

/**
 * Gets processing queue status
 */
export function getProcessingStatus(): { queueLength: number; isProcessing: boolean } {
  return {
    queueLength: processingQueue.length,
    isProcessing
  };
}

/**
 * Gets cached background colors without processing
 */
export function getCachedBackground(post: any): string[] | null {
  const cacheKey = post?.uri;
  if (!cacheKey || !backgroundCache.has(cacheKey)) {
    return null;
  }
  
  const cached = backgroundCache.get(cacheKey)!;
  const now = Date.now();
  
  if (now - cached.timestamp < CACHE_DURATION) {
    return cached.colors;
  }
  
  // Remove expired cache entry
  backgroundCache.delete(cacheKey);
  return null;
}

/**
 * Client-side router for clean URLs on static hosting
 * Handles routes like /@username and /@username/postid
 * Loads content dynamically without changing the URL
 */

// Route patterns
const ROUTES = {
  PROFILE: /^\/@([^/]+)\/?$/,
  POST: /^\/@([^/]+)\/([^/]+)\/?$/,
};

// Current route state
let currentRoute = null;
let currentContent = null;

/**
 * Parse the current pathname into route components
 * @returns {Object|null} Route object with type, handle, and postId, or null if no match
 */
function parseRoute(pathname) {
  // Match post route first (more specific)
  const postMatch = pathname.match(ROUTES.POST);
  if (postMatch) {
    return {
      type: 'post',
      handle: postMatch[1],
      postId: postMatch[2],
    };
  }

  // Match profile route
  const profileMatch = pathname.match(ROUTES.PROFILE);
  if (profileMatch) {
    return {
      type: 'profile',
      handle: profileMatch[1],
    };
  }

  return null;
}

/**
 * Get the HTML file path for a route
 * @param {Object} route - Route object
 * @returns {string} HTML file path
 */
function getRouteFilePath(route) {
  if (route.type === 'post') {
    return '/post-view.html';
  } else if (route.type === 'profile') {
    return '/orbyt-profile.html';
  }
  return null;
}

/**
 * Extract the body content from HTML string
 * @param {string} html - HTML string
 * @returns {Object} Object with body HTML, head content, and scripts
 */
function extractHTMLContent(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract scripts from both head and body
  const allScripts = [];

  // Get all scripts from head
  const headScripts = doc.head.querySelectorAll('script');
  headScripts.forEach(script => allScripts.push(script.cloneNode(true)));

  // Get all scripts from body and remove them from DOM for now
  const bodyScripts = Array.from(doc.body.querySelectorAll('script'));
  const scriptData = [];

  bodyScripts.forEach(script => {
    scriptData.push({
      element: script.cloneNode(true),
      text: script.textContent,
      src: script.getAttribute('src'),
      type: script.getAttribute('type'),
    });
    script.remove(); // Remove from DOM so it's not in innerHTML
  });

  // Extract body content (now without scripts)
  const body = doc.body.innerHTML;

  // Add body scripts to allScripts array
  scriptData.forEach(data => {
    allScripts.push(data.element);
  });

  // Extract head content (styles, meta tags, etc.)
  const headElements = Array.from(doc.head.children);

  // Separate styles from other head content
  const styles = [];
  const otherHead = [];

  headElements.forEach(element => {
    if (element.tagName === 'SCRIPT') {
      // Already collected above
    } else if (element.tagName === 'LINK' && element.rel === 'stylesheet') {
      styles.push(element);
    } else if (element.tagName === 'STYLE') {
      styles.push(element);
    } else {
      otherHead.push(element);
    }
  });

  return {
    body: body,
    scripts: allScripts,
    styles,
    meta: otherHead,
  };
}

/**
 * Set or update the base tag for relative path resolution
 * This ensures CSS, JS, and image paths resolve correctly when loading dynamic content
 */
function setBaseTag() {
  let baseTag = document.querySelector('base');
  if (!baseTag) {
    baseTag = document.createElement('base');
    document.head.insertBefore(baseTag, document.head.firstChild);
  }
  // Set base to current origin + path (root) for relative path resolution
  // This ensures CSS, JS, and image paths resolve correctly
  const baseUrl = window.location.origin + '/';
  baseTag.href = baseUrl;

  // Debug logging (remove in production)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('[Router] Base tag set to:', baseUrl);
  }
}

/**
 * Update meta tags in the document head
 * @param {Array} metaElements - Array of meta and other head elements
 */
function updateHeadElements(metaElements) {
  // Remove dynamic meta tags (keep base ones)
  const head = document.head;
  const existingMeta = head.querySelectorAll(
    'meta[data-dynamic], link[data-dynamic], title[data-dynamic]'
  );
  existingMeta.forEach(el => el.remove());

  // Add new meta tags
  metaElements.forEach(element => {
    const clone = element.cloneNode(true);
    clone.setAttribute('data-dynamic', 'true');

    // Handle title separately
    if (element.tagName === 'TITLE') {
      let titleEl = head.querySelector('title');
      if (!titleEl) {
        titleEl = document.createElement('title');
        head.appendChild(titleEl);
      }
      titleEl.setAttribute('data-dynamic', 'true');
      titleEl.textContent = element.textContent;
    } else {
      head.appendChild(clone);
    }
  });
}

/**
 * Load and execute scripts in order
 * @param {Array} scriptElements - Array of script elements
 * @returns {Promise} Resolves when all scripts are loaded
 */
function loadScripts(scriptElements) {
  const loadPromises = scriptElements.map(script => {
    return new Promise((resolve, reject) => {
      const newScript = document.createElement('script');

      // Copy attributes
      Array.from(script.attributes).forEach(attr => {
        newScript.setAttribute(attr.name, attr.value);
      });

      // Handle external scripts (module or regular)
      // Per HTML spec: if src is present, load external file and ignore inline content
      const src = script.getAttribute('src');
      if (src) {
        // Check if already loaded
        const existing = Array.from(document.querySelectorAll('script[src]')).find(
          script => script.getAttribute('src') === src
        );
        if (existing) {
          // Script already loaded, resolve immediately
          resolve();
          return;
        }

        newScript.onload = resolve;
        newScript.onerror = err => {
          console.error(`Failed to load script: ${src}`, err);
          reject(err);
        };
        newScript.src = src; // Base tag will handle relative path resolution
        document.body.appendChild(newScript);
      } else if (script.textContent) {
        // Handle inline scripts (only if no src attribute)
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        resolve();
      } else {
        // Script with no src and no content - resolve immediately
        resolve();
      }
    });
  });

  return Promise.all(loadPromises);
}

/**
 * Load CSS styles and wait for them to load
 * @param {Array} styleElements - Array of link and style elements
 * @returns {Promise} Resolves when all stylesheets are loaded
 * Note: With base tag set, relative paths should resolve correctly
 */
async function loadStyles(styleElements) {
  const head = document.head;
  const loadPromises = [];

  styleElements.forEach(element => {
    // Check if style is already loaded
    if (element.tagName === 'LINK' && element.rel === 'stylesheet') {
      const href = element.getAttribute('href');

      // Check if already loaded (by href attribute)
      const existing = Array.from(head.querySelectorAll('link[rel="stylesheet"]')).find(
        link => link.getAttribute('href') === href
      );
      if (existing) {
        // Style already loaded - check if it's fully loaded and parsed
        // Stylesheets that are loaded will have a 'sheet' property (or styleSheet in IE)
        // Also check if the link has loaded state
        if (existing.sheet || existing.styleSheet) {
          return; // Already loaded and parsed, no need to wait
        }
        // Check if link has completed loading (sometimes sheet isn't immediately available)
        if (existing.readyState === 'complete' || existing.readyState === 'loaded') {
          return; // Already completed loading
        }
        // If it exists but not loaded yet (unlikely but possible), wait for it
        // Use a timeout to prevent hanging if it never loads
        loadPromises.push(
          new Promise(resolve => {
            const timeout = setTimeout(() => {
              console.warn(`Stylesheet load timeout: ${href}`);
              resolve(); // Resolve on timeout to not block
            }, 5000); // 5 second timeout

            const cleanup = () => {
              clearTimeout(timeout);
              existing.removeEventListener('load', onLoad);
              existing.removeEventListener('error', onError);
            };

            const onLoad = () => {
              cleanup();
              resolve();
            };

            const onError = () => {
              cleanup();
              console.warn(`Stylesheet failed to load: ${href}`);
              resolve(); // Resolve even on error to not block
            };

            existing.addEventListener('load', onLoad);
            existing.addEventListener('error', onError);
          })
        );
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href; // Base tag will handle relative path resolution
      link.setAttribute('data-dynamic', 'true');

      // Wait for stylesheet to load
      const loadPromise = new Promise(resolve => {
        const onLoad = () => {
          // Small delay to ensure styles are parsed and applied
          setTimeout(() => resolve(), 50);
        };

        const onError = () => {
          console.warn(`Failed to load stylesheet: ${href}`);
          resolve(); // Resolve even on error to not block
        };

        link.addEventListener('load', onLoad);
        link.addEventListener('error', onError);

        head.appendChild(link);

        // Check if stylesheet loaded synchronously (cached)
        // This can happen with cached resources
        if (
          link.sheet ||
          link.styleSheet ||
          link.readyState === 'complete' ||
          link.readyState === 'loaded'
        ) {
          link.removeEventListener('load', onLoad);
          link.removeEventListener('error', onError);
          setTimeout(() => resolve(), 50);
        }
      });

      loadPromises.push(loadPromise);
    } else if (element.tagName === 'STYLE') {
      // Inline styles load immediately
      const style = document.createElement('style');
      style.setAttribute('data-dynamic', 'true');
      style.textContent = element.textContent;
      head.appendChild(style);
    }
  });

  // Wait for all stylesheets to load
  await Promise.all(loadPromises);

  // Small delay to ensure styles are parsed and applied to DOM
  // This prevents flash of unstyled content
  return new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * Set route data on window for JavaScript to access
 * This allows existing JavaScript to read route info without query params
 * @param {Object} route - Route object
 */
function setRouteData(route) {
  // Store route data on window so JavaScript can access it
  // This avoids adding query params to the URL
  window.__currentRoute = route;

  // Also update history state without changing URL
  window.history.replaceState({ route }, '', window.location.pathname);
}

/**
 * Load content for a route
 * @param {Object} route - Route object
 * @returns {Promise} Resolves when content is loaded
 */
async function loadRouteContent(route) {
  const filePath = getRouteFilePath(route);
  if (!filePath) {
    throw new Error(`No file path for route type: ${route.type}`);
  }

  // Show loading state
  showLoading();

  try {
    // Fetch the HTML file
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}: ${response.status}`);
    }

    const html = await response.text();

    // Set base tag FIRST for relative path resolution
    // This ensures CSS, JS, and image paths resolve correctly
    setBaseTag();

    // Extract content
    const { body, scripts, styles, meta } = extractHTMLContent(html);

    // Update head elements first
    updateHeadElements(meta);

    // Load styles and wait for them to load before inserting content
    // This prevents flash of unstyled content (FOUC)
    await loadStyles(styles);

    // Clear existing content
    const container = document.getElementById('router-content');
    if (container) {
      container.innerHTML = body;
    } else {
      // Create container if it doesn't exist
      const newContainer = document.createElement('div');
      newContainer.id = 'router-content';
      newContainer.innerHTML = body;
      document.body.innerHTML = '';
      document.body.appendChild(newContainer);
    }

    // Set route data for JavaScript to access
    setRouteData(route);

    // Load scripts (these will initialize the page)
    await loadScripts(scripts);

    // Hide loading state
    hideLoading();

    // Store current route
    currentRoute = route;
  } catch (error) {
    console.error('Error loading route content:', error);
    showError(`Failed to load page: ${error.message}`);
  }
}

/**
 * Show loading state
 */
function showLoading() {
  const existingLoading = document.getElementById('router-loading');
  if (existingLoading) return;

  const loading = document.createElement('div');
  loading.id = 'router-loading';
  loading.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    z-index: 9999;
  `;
  loading.innerHTML = '<p>Loading...</p>';
  document.body.appendChild(loading);
}

/**
 * Hide loading state
 */
function hideLoading() {
  const loading = document.getElementById('router-loading');
  if (loading) {
    loading.remove();
  }
}

/**
 * Show error state
 * @param {string} message - Error message
 */
function showError(message) {
  hideLoading();

  const error = document.createElement('div');
  error.id = 'router-error';
  error.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    flex-direction: column;
    gap: 20px;
    z-index: 9999;
  `;
  error.innerHTML = `
    <p style="font-size: 18px;">${escapeHtml(message)}</p>
    <a href="/" style="color: #FF876C; text-decoration: underline;">Go Home</a>
  `;
  document.body.appendChild(error);
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handle navigation to a new route
 * @param {string} pathname - Path to navigate to
 */
function navigate(pathname) {
  const route = parseRoute(pathname);

  if (!route) {
    // No route matched - show 404
    show404();
    return;
  }

  // Load the route content
  loadRouteContent(route).catch(error => {
    console.error('Navigation error:', error);
    showError('Failed to navigate to page');
  });
}

/**
 * Show 404 error page
 */
function show404() {
  hideLoading();

  const error = document.createElement('div');
  error.id = 'router-404';
  error.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    flex-direction: column;
    gap: 20px;
    z-index: 9999;
  `;
  error.innerHTML = `
    <div style="font-size: 8rem; font-weight: 900; line-height: 1;">404</div>
    <p style="font-size: 1.25rem; opacity: 0.9;">There's nothing to see here...</p>
    <a href="/" style="display: inline-flex; background: #fff; color: #000; padding: 12px 20px; border-radius: 999px; text-decoration: none; font-weight: 700;">Go Home</a>
  `;
  document.body.innerHTML = '';
  document.body.appendChild(error);
}

/**
 * Initialize the router
 */
function initRouter() {
  const pathname = window.location.pathname;
  const route = parseRoute(pathname);

  // Only initialize router if we're on 404.html (handled by GitHub Pages)
  // Check if we're on the 404 page by looking for the router-content element
  // This element only exists in 404.html, not in other pages (index.html, terms.html, etc.)
  const is404Page = document.body.querySelector('#router-content') !== null;

  if (is404Page) {
    // We're on 404.html - handle routing
    if (route) {
      // This is a routed path - load the route content
      navigate(pathname);
    } else {
      // Not a routed path - show 404
      show404();
    }

    // Handle browser back/forward buttons
    window.addEventListener('popstate', event => {
      const newPathname = window.location.pathname;
      const newRoute = parseRoute(newPathname);

      if (newRoute) {
        navigate(newPathname);
      } else {
        // Not a route - reload to show the actual page
        window.location.reload();
      }
    });

    // Intercept link clicks to handle internal navigation
    // This allows links to routes to work from anywhere
    document.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Check if it's an internal route
      try {
        const url = new URL(href, window.location.origin);

        // Only handle same-origin URLs
        if (url.origin !== window.location.origin) {
          return; // External link - let it navigate normally
        }

        const clickedRoute = parseRoute(url.pathname);
        if (clickedRoute) {
          // It's a routed URL - handle it client-side
          event.preventDefault();

          // Update history
          window.history.pushState({ route: clickedRoute }, '', url.pathname);

          // Navigate
          navigate(url.pathname);
        }
        // If not a route, let it navigate normally (for /, terms.html, etc.)
      } catch (e) {
        // Relative URL - check if it's a clean URL pattern
        if (href.startsWith('/@') || href.startsWith('@')) {
          const fullPath = href.startsWith('/') ? href : '/' + href;
          const clickedRoute = parseRoute(fullPath);
          if (clickedRoute) {
            event.preventDefault();
            window.history.pushState({ route: clickedRoute }, '', fullPath);
            navigate(fullPath);
          }
        }
        // Otherwise let it navigate normally
      }
    });
  }
  // If not on 404.html, let the page load normally (index.html, terms.html, etc.)
}

// Export for use in other scripts if needed
window.router = {
  navigate,
  parseRoute,
  getRouteFilePath,
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}

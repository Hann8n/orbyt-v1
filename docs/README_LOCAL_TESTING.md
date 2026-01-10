# Local Testing Guide

To test the router locally before deploying to GitHub Pages, you need to run a local HTTP server.

## Option 1: Custom Test Server (Recommended)

The custom test server mimics GitHub Pages behavior by serving `404.html` for routes.

1. Open Terminal
2. Navigate to the `docs` directory:
   ```bash
   cd /Users/jack/orbyt/docs
   ```
3. Start the test server:
   ```bash
   python3 test-server.py
   ```
4. Open your browser and visit:
   - `http://localhost:8000/` - Homepage
   - `http://localhost:8000/@username` - Profile page (replace with actual username)
   - `http://localhost:8000/@username/postid` - Post page

5. To stop the server, press `Ctrl+C` in the terminal

**Why use this instead of standard Python server?**
The standard `python3 -m http.server` returns a 404 error page for routes like `/@username`, but GitHub Pages serves `404.html` which contains our router. This custom server mimics that behavior.

## Option 2: Node.js HTTP Server

If you have Node.js installed:

1. Install a simple HTTP server globally:

   ```bash
   npm install -g http-server
   ```

2. Navigate to the `docs` directory:

   ```bash
   cd /Users/jack/orbyt/docs
   ```

3. Start the server:

   ```bash
   http-server -p 8000
   ```

4. Open your browser and visit the same URLs as above

## Option 3: VS Code Live Server Extension

If you use VS Code:

1. Install the "Live Server" extension
2. Right-click on `docs/index.html` or `docs/404.html`
3. Select "Open with Live Server"
4. The browser will open automatically

## Testing Checklist

Test these URLs locally:

- [ ] `http://localhost:8000/` - Should show index.html
- [ ] `http://localhost:8000/@wsj.com` - Should load profile page
- [ ] `http://localhost:8000/@wsj.com/3k7f2k8m5n1q` - Should load post page (use actual post ID)
- [ ] `http://localhost:8000/terms.html` - Should work normally
- [ ] `http://localhost:8000/nonexistent` - Should show 404 page

Test navigation:

- [ ] Click links on profile page - should navigate without page reload
- [ ] Click links on post page - should navigate without page reload
- [ ] Use browser back button - should work correctly
- [ ] Use browser forward button - should work correctly
- [ ] Directly type URLs in address bar - should work correctly

## Troubleshooting

### Server won't start

- Make sure port 8000 is available, or use a different port (e.g., `python3 -m http.server 8080`)

### 404 page shows instead of content

- Make sure you're accessing via `http://localhost:8000` not `file://`
- Check browser console for JavaScript errors (F12 → Console tab)

### Links don't work

- Open browser console (F12) to see any JavaScript errors
- Make sure `router.js` is loading correctly

### CORS errors

- The router fetches HTML files, so you need a real HTTP server (not file://)

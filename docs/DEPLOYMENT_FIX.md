# Fix for 404 Error on Association Files

## Current Issue

The validator shows:
- ❌ Server returned error status code (404)
- ❌ Content-Type header not set
- ❌ JSON test didn't run

**Root Cause:** The `.well-known` folder isn't being deployed or served.

## Quick Fix Steps

### Step 1: Verify Files Exist

The files should be in:
```
docs/
  └── .well-known/
      ├── apple-app-site-association
      ├── assetlinks.json
      └── .gitkeep
```

### Step 2: Deploy the Files

**If using GitHub Pages:**
1. Commit and push the `.well-known` folder:
   ```bash
   git add docs/.well-known/
   git commit -m "Add universal links association files"
   git push
   ```

2. Wait for GitHub Pages to rebuild (usually 1-2 minutes)

3. Verify deployment:
   ```bash
   curl https://getorbyt.com/.well-known/apple-app-site-association
   ```

**If using another hosting platform:**
- Upload the entire `.well-known` folder to your web root
- Ensure the folder is included in your deployment

### Step 3: Configure Content-Type Header

Since you're using **Cloudflare** (detected from server headers), you have options:

#### Option A: Cloudflare Workers (Recommended)

1. Go to Cloudflare Dashboard → Workers & Pages
2. Create a new Worker
3. Add this code:

```javascript
addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle apple-app-site-association
  if (url.pathname === '/.well-known/apple-app-site-association') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.status === 404) {
          // If GitHub Pages returns 404, serve from Workers KV or fetch from origin
          return new Response('{"error":"File not found"}', {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Content-Type', 'application/json');
        return newResponse;
      })
    );
  }
  
  // Handle assetlinks.json
  if (url.pathname === '/.well-known/assetlinks.json') {
    event.respondWith(
      fetch(event.request).then(response => {
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Content-Type', 'application/json');
        return newResponse;
      })
    );
  }
});
```

4. Add a route: `getorbyt.com/.well-known/*` → Your Worker

#### Option B: Cloudflare Page Rules

1. Go to Cloudflare Dashboard → Rules → Page Rules
2. Create a new rule:
   - URL: `getorbyt.com/.well-known/apple-app-site-association`
   - Setting: Add Custom Header
   - Header Name: `Content-Type`
   - Value: `application/json`
3. Repeat for `assetlinks.json`

#### Option C: Use Netlify/Vercel

Both platforms support the `_headers` file I created:
- Netlify: Automatically reads `_headers` file
- Vercel: Use `vercel.json` (already created)

### Step 4: Test Again

After deploying and configuring:

```bash
# Test file accessibility
curl -I https://getorbyt.com/.well-known/apple-app-site-association

# Should return:
# HTTP/2 200
# Content-Type: application/json
```

Then re-run the validator: https://branch.io/resources/aasa-validator/

## If Files Still Return 404

1. **Check GitHub Pages settings:**
   - Go to repository → Settings → Pages
   - Ensure source is set to `/docs` folder
   - Check if `.well-known` is in the deployed files

2. **Verify file permissions:**
   ```bash
   ls -la docs/.well-known/
   ```
   Files should be readable (644 permissions)

3. **Check if `.well-known` is ignored:**
   - Some `.gitignore` files exclude `.well-known`
   - Ensure it's not in `.gitignore`

4. **Manual upload:**
   - If automated deployment fails, manually upload the `.well-known` folder via FTP or hosting dashboard

## Expected Result

After fixing, the validator should show:
- ✅ Domain is valid (valid DNS)
- ✅ File is served over HTTPS
- ✅ File returns 200 status code
- ✅ Content-Type is application/json
- ✅ JSON is valid

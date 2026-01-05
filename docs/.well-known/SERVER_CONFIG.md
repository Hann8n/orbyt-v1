# Server Configuration for Association Files

The `apple-app-site-association` and `assetlinks.json` files **must** be served with the correct `Content-Type` header.

## The Problem

Apple and Android require these files to be served with:
- **Content-Type:** `application/json`
- **HTTP Status:** 200 (not 404, 301, or 302)

If your server returns HTML or the wrong content type, the validator will fail.

## Solutions by Hosting Platform

### GitHub Pages

GitHub Pages doesn't support custom headers easily. You have two options:

**Option 1: Use a Custom Domain with Cloudflare (Recommended)**
1. Point your domain to Cloudflare
2. Add a Page Rule or Worker to set headers:
   ```javascript
   // Cloudflare Worker
   addEventListener('fetch', event => {
     if (event.request.url.includes('/.well-known/apple-app-site-association')) {
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

**Option 2: Use Netlify/Vercel**
- Both support custom headers via `_headers` or `vercel.json` files
- See configuration files in this directory

### Netlify

Use the `_headers` file in the root of your `docs` folder:
```
/.well-known/apple-app-site-association
  Content-Type: application/json

/.well-known/assetlinks.json
  Content-Type: application/json
```

### Vercel

Use the `vercel.json` file (already created in `.well-known/` directory).

### Apache (.htaccess)

If you have Apache, use the `.htaccess` file (already created):
```apache
<Files "apple-app-site-association">
    Header set Content-Type "application/json"
</Files>
```

**Note:** Requires `mod_headers` to be enabled.

### Nginx

Add to your Nginx config:
```nginx
location /.well-known/apple-app-site-association {
    default_type application/json;
    add_header Content-Type application/json;
    add_header Access-Control-Allow-Origin *;
}

location /.well-known/assetlinks.json {
    default_type application/json;
    add_header Content-Type application/json;
    add_header Access-Control-Allow-Origin *;
}
```

### Cloudflare Pages

Add a `_headers` file in your `docs` folder (already created).

## Testing

After configuring, test with:

```bash
# Check Content-Type header
curl -I https://getorbyt.com/.well-known/apple-app-site-association

# Should return:
# Content-Type: application/json
# HTTP/1.1 200 OK
```

## Common Issues

**Issue: Returns 404**
- Ensure files are in `.well-known/` directory
- Check file permissions
- Verify deployment includes `.well-known` folder

**Issue: Returns HTML (404 page)**
- Server is serving a 404 page instead of the file
- Check server configuration
- Ensure file path is correct

**Issue: Wrong Content-Type**
- Server is defaulting to `text/html`
- Add header configuration (see above)
- Some hosts require specific file extensions - try renaming if needed

**Issue: Returns 301/302 Redirect**
- Apple requires direct 200 response, no redirects
- Check if your hosting platform redirects `.well-known` paths
- May need to configure server to not redirect

## Quick Fix for GitHub Pages

If you're using GitHub Pages and can't set headers:

1. **Temporary workaround:** Some validators are lenient if the JSON is valid
2. **Better solution:** Use Cloudflare in front of GitHub Pages and set headers via Workers
3. **Best solution:** Switch to Netlify or Vercel which support headers natively

# Header System Documentation

This directory contains the static site that serves header data for the Orbyt app's explore page.

## Structure

- `api/headers.json` - Contains the header data in JSON format
- `orbyt_header1.png` - Header image file

## Adding New Headers

To add a new header:

1. **Add the image file** to the `docs/` directory (e.g., `my_header.png`)

2. **Update the JSON data** in `api/headers.json`:
   ```json
   {
     "headers": [
       {
         "id": "unique_header_id",
         "imageUrl": "../my_header.png",
         "destinationUrl": "https://example.com",
         "title": "Header Title",
         "description": "Header description"
       }
     ]
   }
   ```

3. **Image specifications**:
   - Format: PNG
   - Aspect ratio: 9:16 (portrait)
   - Recommended size: 1920x1080 pixels
   - The image will be displayed in the top quarter of the explore page

## API Endpoint

The headers are served from: `https://orbyt.app/api/headers.json`

## Integration

The Orbyt app fetches this data and displays headers in a horizontal scrollable banner at the top of the explore page. Headers are clickable and will open the destination URL.

## Caching

The app caches header data for 5 minutes to improve performance and reduce server load.

# Vercel Deployment Fix - White Page Error

## Issues Fixed

### 1. **Service Worker Asset Interception Error**
**Problem:** Service worker was throwing errors when trying to cache assets, causing the browser to fail loading CSS/JS files.

**Error:** 
```
Failed to load 'https://www.monday.com.vn/assets/index-C4IzNwp_.js'. 
A ServiceWorker intercepted the request and encountered an unexpected error.
```

**Solution:** Updated `dist/sw.js` to:
- Skip API requests from service worker (let them go through network only)
- Better error handling in fetch event listener
- Return empty response on network failure instead of throwing errors
- Cache assets only on successful responses (status 200)

### 2. **MIME Type Error**
**Problem:** Server was serving `index.html` for CSS/JS asset requests instead of the actual files.

**Error:**
```
The stylesheet https://www.monday.com.vn/assets/index-DRY34qrE.css 
was not loaded because its MIME type, "text/html", is not "text/css".
```

**Solution:** Updated `server.ts` to:
- Use `express.static()` to properly serve static files with correct MIME types
- Only fallback to `index.html` for routes that don't match actual files or asset extensions
- Check for file extensions (.js, .css, .png, etc.) and return 404 instead of serving index.html

### 3. **Vercel Configuration Issue**
**Problem:** Previous `vercel.json` used static deployment config instead of Node.js serverless.

**Solution:** Updated `vercel.json` to:
- Use `builds` array with `@vercel/node` builder
- Simple `routes` array that routes all requests through `server.ts`
- Let the Express server handle all routing logic, including static files and SPA fallback

## Files Modified

### 1. `server.ts`
```typescript
// Now properly serves static files with correct MIME types
app.use(express.static(distPath, {
  maxAge: '1y',
  etag: false
}));

// Only serves index.html for non-API, non-asset routes
app.get('*', (req, res) => {
  // Skip asset files and API routes
  if (url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)) {
    return res.status(404).send('Not found');
  }
  // Serve index.html for SPA routes
  res.sendFile(indexPath);
});
```

### 2. `dist/sw.js` (Service Worker)
```javascript
// Skip API requests
if (event.request.url.includes('/api/')) {
  return; // Don't intercept
}

// Better error handling
fetch(event.request)
  .catch(err => {
    // Return empty response instead of throwing
    return new Response('', { status: 404 });
  });
```

### 3. `vercel.json`
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.ts",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.ts"
    }
  ]
}
```

## How It Works Now

1. **Vercel** receives request
2. **Routes all requests** through `server.ts`
3. **Express Server**:
   - Checks if it's a static file in `dist/assets/` → serves with correct MIME type
   - Checks if it's an API route (`/api/*`) → returns 404 or error
   - Checks if it has a file extension → returns 404
   - Otherwise → serves `index.html` (SPA fallback)
4. **React Router** handles client-side routing in browser
5. **Service Worker**:
   - Skips API requests
   - Caches assets for offline support
   - Returns proper responses on network errors

## Testing Checklist

- [x] Build succeeds locally: `npm run build`
- [x] All assets are in `dist/` folder
- [x] Server runs locally: `npm run dev`
- [ ] Deploy to Vercel
- [ ] Check in browser console for errors
- [ ] Verify assets load (CSS, JS, images)
- [ ] Test navigation (should not show blank page)
- [ ] Test API calls
- [ ] Check Network tab in DevTools for MIME types

## Key Points

1. **MIME Types are automatic** when using `express.static()` - no need to configure them manually
2. **Service Worker should not throw errors** - always return a response
3. **Asset routes must be excluded** from SPA fallback, otherwise CSS/JS will load as HTML
4. **Vercel serverless** works best with simple route configurations that delegate to the server

## Rollback Instructions

If issues persist, you can temporarily disable the service worker:
1. In `index.html`, comment out the service worker registration
2. Or modify `main.tsx` to skip service worker registration

```typescript
// In src/main.tsx
// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('/sw.js');
// }
```

## Related Files

- `src/main.tsx` - Registers service worker
- `index.html` - Service worker registration and viewport config
- `package.json` - Build and dev scripts
- `vite.config.ts` - Build configuration


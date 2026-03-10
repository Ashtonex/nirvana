# NIRVANA MOBILE BUILD GUIDE

## Option 1: Build APK that connects to Vercel (Recommended)

1. Add static export for mobile build:
   Edit next.config.ts and add `output: 'export'`

2. Build Next.js:
   npm run build

3. Add to Capacitor and build:
   npx cap add android
   npx cap sync android
   npx cap open android

4. In Android Studio: Build → Generate Signed APK

## Option 2: Build without modifying next.config

Use a separate build script that toggles output mode:

```bash
# Build for mobile
echo "output: 'export'" >> next.config.ts
npm run build
npx cap sync android
# Build APK in Android Studio

# Restore for Vercel (remove the line)
# Then git push to Vercel
```

## Option 3: Progressive Web App (PWA)

The app already has basic PWA support (service worker + manifest).
- Users can "Install" from browser
- Works offline with service worker caching

## Quick Start (do this now):

1. Edit next.config.ts to add `output: 'export'`
2. npm run build
3. npx cap sync android
4. npx cap open android
5. In Android Studio: Build → Build APK

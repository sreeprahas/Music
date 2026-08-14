# Electron Configuration Guide

## Getting Started with Electron

This project is now configured to run as both a web app and an Electron desktop application.

### Development

**Web Development:**
```bash
npm run dev
```

**Electron Development:**
```bash
npm run electron:dev
```

This will start the Next.js dev server and open Electron once it's ready.

### Building

**Build Web App:**
```bash
npm run build
```

**Build Electron App:**
```bash
npm run electron:build
```

This will create installers for:
- Windows: `.exe` installer and portable executable
- macOS: `.dmg` and `.zip`
- Linux: `.AppImage` and `.deb`

### File Structure

- `electron-main.ts` - Main Electron process
- `electron-preload.ts` - Preload script for secure IPC
- `electron.js` - Entry point for Electron
- `electron-builder.config.js` - Build configuration
- `dist/` - Compiled Electron files (created during build)

### IPC (Inter-Process Communication)

Use the `window.electronAPI` object to communicate from the renderer process:

```typescript
// Get app version
const version = await window.electronAPI.getAppVersion();

// Get app path
const appPath = await window.electronAPI.getAppPath();
```

### Configuration

- **App ID**: `com.musicapp`
- **Product Name**: `Music`
- **Main Process**: `dist/electron-main.js`

Modify `electron-builder.config.js` to customize the build output.

### Environment Variables

For signing builds:
- `WIN_CERTIFICATE_FILE` - Path to Windows code signing certificate
- `WIN_CERTIFICATE_PASSWORD` - Password for certificate
- `MAC_IDENTITY` - macOS code signing identity

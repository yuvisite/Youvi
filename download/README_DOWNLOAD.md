# YouVi Download Manager

Download videos from YouTube, Mover.uz, and other platforms directly from your browser.

## Setup (One-time)

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Choose LTS version
   - Install with default settings

2. **Install yt-dlp** (for YouTube and most platforms)
   - Windows: `winget install yt-dlp`
   - Or download from: https://github.com/yt-dlp/yt-dlp#installation

## Usage

### Step 1: Start the Server

**Windows:**
- Double-click `START_DOWNLOAD_SERVER.bat`

**Or manually:**
```bash
node download-server.js
```

You should see:
```
╔════════════════════════════════════════════════════════╗
║                                                        ║
║          YouVi Download Server is running!            ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

  Server:  http://localhost:3000
```

### Step 2: Open the Download Page

- Open `youvi_download.html` in your browser
- Or navigate to it from the main YouVi interface

### Step 3: Download Videos

1. Select platform (YouTube, Mover.uz, etc.)
2. Paste video URL
3. Add tags (optional, with autocomplete)
4. Click "Select Folder" and enter the full path where you want to save
5. Click "Download / Generate Commands"
6. Wait for download to complete

## Supported Platforms

### Direct Download (via server):
- ✅ YouTube (requires yt-dlp)
- ✅ Mover.uz
- ✅ Niconico (requires yt-dlp)
- ✅ Bilibili (requires yt-dlp)
- ✅ TikTok (requires yt-dlp)
- ✅ Odysee (requires yt-dlp)
- ✅ Iwara (requires yt-dlp)
- ✅ Vimeo (requires yt-dlp)
- ✅ Dailymotion (requires yt-dlp)
- ⏳ Mix.tj (coming soon)

### YouTube Extras:
- Comments (JSON)
- Danmaku (from comments)
- Live Chat (as danmaku)

## Troubleshooting

### "Download server not running"
- Make sure you started `download-server.js` first
- Check that port 3000 is not in use

### "yt-dlp not found"
- Install yt-dlp: https://github.com/yt-dlp/yt-dlp#installation
- Make sure it's in your PATH

### Download fails
- Check the server console for error messages
- Make sure the output path exists and is writable
- Try the URL in yt-dlp directly to test: `yt-dlp <url>`

## How It Works

1. Browser sends download request to local Node.js server (localhost:3000)
2. Server calls yt-dlp or downloads directly (for mover.uz)
3. Video saves to your chosen folder
4. Metadata saved as `.info.json` file with tags

## Privacy

- Everything runs locally on your computer
- No data sent to external servers
- No tracking or analytics

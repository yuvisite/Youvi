/**
 * YouVi Download Server
 * Simple Node.js backend for handling video downloads with yt-dlp
 * 
 * Usage:
 *   node download-server.js
 * 
 * Then open youvi_download.html in your browser
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;

/** Force yt-dlp (and embedded Python) to use UTF-8; unbuffer so progress/logs stream in real time. */
const UTF8_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' };

/** Current download progress for GET /progress (phase, percent 0-100, message). */
let downloadProgress = { phase: 'idle', percent: 0, message: '' };

/** Live logs during active download; GET /progress returns these so client can stream console. */
let downloadLogs = [];

/**
 * Get yt-dlp format string based on quality selection
 */
function getFormatString(quality) {
    const formats = {
        'best': 'bestvideo+bestaudio/best',
        '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
        '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
        '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
        '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
        'audio': 'bestaudio/best'
    };
    
    return formats[quality] || formats['best'];
}

/**
 * Detect platform from video URL
 */
function detectPlatform(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'YouTube';
    if (urlLower.includes('nicovideo.jp')) return 'niconico';
    if (urlLower.includes('bilibili.com')) return 'Bilibili';
    if (urlLower.includes('tiktok.com')) return 'TikTok';
    if (urlLower.includes('odysee.com')) return 'Odysee';
    if (urlLower.includes('vimeo.com')) return 'Vimeo';
    if (urlLower.includes('dailymotion.com')) return 'Dailymotion';
    if (urlLower.includes('mover.uz')) return 'Mover.uz';
    return 'Unknown';
}

// Maximum request body size (1 MB) to prevent memory exhaustion
const MAX_BODY_SIZE = 1 * 1024 * 1024;

// Allowed CORS origins (localhost only)
const ALLOWED_ORIGINS = [
    'http://localhost', 'https://localhost',
    'http://127.0.0.1', 'https://127.0.0.1',
    'null'  // local file:// pages send Origin: null
];

function getCorsHeaders(req) {
    const origin = req?.headers?.origin || '';
    const isAllowed = origin === 'null' ||
        ALLOWED_ORIGINS.some(allowed => origin === allowed || origin.startsWith(allowed + ':'));
    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : 'http://localhost',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
}

/**
 * Validate that outputPath is an absolute path and normalize it.
 * Rejects paths with suspicious patterns.
 */
function validateOutputPath(outputPath) {
    if (!outputPath || typeof outputPath !== 'string') return null;
    const normalized = path.resolve(outputPath);
    // Must be an absolute path (Windows: C:\..., Unix: /...)
    if (!path.isAbsolute(normalized)) return null;
    // Reject paths targeting system directories
    const dangerous = ['/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys',
                       'C:\\Windows', 'C:\\Program Files', 'C:\\ProgramData'];
    const normLower = normalized.toLowerCase().replace(/\//g, '\\');
    for (const d of dangerous) {
        if (normLower.startsWith(d.toLowerCase().replace(/\//g, '\\'))) return null;
    }
    return normalized;
}

/**
 * Validate a video URL — must be http/https and from a known domain.
 */
function validateVideoUrl(url, expectedPlatform) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        // Block requests to private/internal IPs
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
            host.startsWith('192.168.') || host.startsWith('10.') ||
            host.startsWith('172.16.') || host.endsWith('.local')) {
            return false;
        }
        // For mover platform, validate domain
        if (expectedPlatform === 'mover') {
            return host === 'mover.uz' || host === 'www.mover.uz' || host === 'v.mover.uz';
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Sanitize a filename for Windows (remove only illegal chars, preserve emoji & Unicode)
 */
function sanitizeFilename(name) {
    if (!name) return 'video';
    // Remove only truly illegal filename characters: < > : " / \ | ? *
    // Keep emoji, Unicode, and other safe chars
    let safe = name.replace(/[<>:"\\/\\|?*]/g, '_');
    // Normalize spaces
    safe = safe.replace(/\s+/g, ' ').trim();
    // Handle Windows reserved names
    const reserved = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;
    if (reserved.test(safe)) safe = '_' + safe;
    // Truncate to reasonable length (preserves multi-byte emoji)
    if (safe.length > 200) safe = safe.substring(0, 200);
    return safe || 'video';
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    const corsHeaders = getCorsHeaders(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }

    // Health check endpoint
    if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ status: 'ok', message: 'YouVi Download Server is running' }));
        return;
    }

    // Download endpoint
    if (pathname === '/download' && req.method === 'POST') {
        let body = '';
        let bodySize = 0;
        let aborted = false;
        
        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_SIZE) {
                aborted = true;
                res.writeHead(413, corsHeaders);
                res.end(JSON.stringify({ error: 'Request body too large' }));
                req.destroy();
                return;
            }
            body += chunk.toString();
        });

        req.on('end', async () => {
            if (aborted) return;
            try {
                const data = JSON.parse(body);
                const { url: videoUrl, outputPath, tags, platform, options } = data;

                if (!videoUrl || !outputPath) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ error: 'Missing required fields: url, outputPath' }));
                    return;
                }

                // Validate output path
                const safePath = validateOutputPath(outputPath);
                if (!safePath) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ error: 'Invalid output path. Must be an absolute path to a safe directory.' }));
                    return;
                }

                // Validate video URL
                if (!validateVideoUrl(videoUrl, platform)) {
                    res.writeHead(400, corsHeaders);
                    res.end(JSON.stringify({ error: 'Invalid video URL. Must be a valid http/https URL from a supported platform.' }));
                    return;
                }

                // Handle different platforms
                if (platform === 'mover') {
                    await downloadMover(videoUrl, safePath, tags, corsHeaders, res);
                } else {
                    // Use yt-dlp for all other platforms
                    await downloadWithYtDlp(videoUrl, safePath, tags, options, corsHeaders, res);
                }

            } catch (error) {
                console.error('Error:', error);
                res.writeHead(500, corsHeaders);
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }

    // Get download progress endpoint (also returns live logs so client can stream console)
    if (pathname === '/progress' && req.method === 'GET') {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...downloadProgress, logs: downloadLogs }));
        return;
    }

    // 404 for unknown routes
    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Set server-level timeout to prevent hung connections
server.timeout = 600000; // 10 minutes max for downloads

/**
 * Download video using yt-dlp
 */
async function downloadWithYtDlp(videoUrl, outputPath, tags, options, corsHeaders, res) {
    const outputTemplate = path.join(outputPath, '%(title)s.%(ext)s');
    
    // Build format string based on quality selection
    const formatString = getFormatString(options?.quality || 'best');
    
    // Capture all console logs for this request and for live streaming via GET /progress
    const logs = [];
    downloadLogs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const pushLog = (type, args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        const entry = { type, message: msg, timestamp: new Date().toISOString() };
        logs.push(entry);
        downloadLogs.push(entry);
        return msg;
    };
    console.log = (...args) => {
        pushLog('info', args);
        originalLog.apply(console, args);
    };
    console.error = (...args) => {
        pushLog('error', args);
        originalError.apply(console, args);
    };

    // Detect platform and log details
    const platform = detectPlatform(videoUrl);
    console.log(`→ Platform detected: ${platform}`);
    console.log(`→ Video URL: ${videoUrl}`);
    console.log(`→ Output path: ${outputPath}`);
    console.log(`→ Quality: ${options?.quality || 'best'}`);
    if (tags) console.log(`→ Tags: ${tags}`);
    
    // Platform-specific info
    if (platform === 'niconico') {
        console.log('→ Niconico download notes:');
        console.log('  • May require login for some videos (use --cookies if needed)');
        console.log('  • Comments will be fetched from Niconico separately');
        console.log('  • Some videos may have regional restrictions');
    } else if (platform === 'Mover.uz') {
        console.log('→ Mover.uz download notes:');
        console.log('  • Using yt-dlp extractor (direct download deprecated)');
        console.log('  • Video quality depends on what Mover.uz provides');
    }
    
    const args = [
        '-f', formatString,
        '-o', outputTemplate,
        '--no-playlist',
        '--no-restrict-filenames',  // Keep full Unicode in filenames (JP, RU, emoji, etc.)
        '--write-info-json',  // Write yt-dlp's info JSON
        '--print', 'after_move:filepath',
        '--js-runtimes', 'nodejs'  // Use Node.js for YouTube JS extraction
        // Do not use --windows-filenames so Unicode (e.g. テレパシー能力者) is preserved
    ];

    // Add metadata if tags provided
    if (tags) {
        args.push('--add-metadata', '--metadata', `comment=${tags}`);
    }

    // Add download options
    // Comments are fetched separately after download (--write-comments fails with video download due to YouTube bugs)

    if (options?.downloadSubtitles) {
        args.push('--write-subs', '--sub-lang', 'en,ru');
    }

    args.push(videoUrl);

    console.log('Running yt-dlp:', args.join(' '));

    // Try different yt-dlp commands (yt-dlp.exe on Windows, yt-dlp on Unix)
    const ytdlpCommands = ['yt-dlp', 'yt-dlp.exe'];
    let ytdlp = null;
    let lastError = null;

    for (const cmd of ytdlpCommands) {
        try {
            ytdlp = spawn(cmd, args, { encoding: 'utf8', env: UTF8_ENV });
            break;
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    if (!ytdlp) {
        console.log = originalLog;
        console.error = originalError;
        
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ 
            error: 'Failed to start yt-dlp. Make sure it is installed and in your PATH.',
            details: lastError?.message,
            installUrl: 'https://github.com/yt-dlp/yt-dlp#installation',
            logs: logs
        }));
        return;
    }

    let output = '';
    let errorOutput = '';

    downloadProgress = { phase: 'video', percent: 0, message: 'Downloading video...' };

    ytdlp.stdout.setEncoding('utf8');
    ytdlp.stderr.setEncoding('utf8');

    ytdlp.stdout.on('data', (data) => {
        output += data;
        console.log(data);
    });

    // Match [download] ... 45.2% in any line (yt-dlp can send multiple lines per chunk)
    const percentRe = /\[download\][^\n]*?(\d+\.?\d*)%/g;
    ytdlp.stderr.on('data', (data) => {
        errorOutput += data;
        console.error(data);
        const str = String(data);
        let match;
        let lastPct = downloadProgress.percent;
        while ((match = percentRe.exec(str)) !== null) {
            const p = Math.min(100, parseFloat(match[1]));
            if (p >= lastPct) lastPct = p;
        }
        if (lastPct !== downloadProgress.percent) {
            downloadProgress.percent = lastPct;
            downloadProgress.message = `Downloading video... ${lastPct.toFixed(1)}%`;
        }
    });

    ytdlp.on('close', async (code) => {
        if (code === 0) {
            console.log('→ Video download completed successfully');
            downloadProgress = { phase: 'metadata', percent: 100, message: 'Creating metadata...' };

            // Create YouVi-compatible metadata
            try {
                const downloadedPath = extractDownloadedPath(output);
                const metaContext = await createYouviMetadata(outputPath, tags, videoUrl, downloadedPath);
                await createYouviSidecarData(outputPath, videoUrl, metaContext, options);

                downloadProgress = { phase: 'idle', percent: 100, message: '' };

                console.log('');
                console.log('=== Download Summary ===');
                console.log(`✓ Video: Downloaded and saved`);
                if (options?.downloadComments) console.log(`✓ Comments: ${metaContext ? 'Processed' : 'Skipped'}`);
                if (options?.downloadDanmaku) console.log(`✓ Danmaku: ${metaContext ? 'Processed' : 'Skipped'}`);
                if (tags) console.log(`✓ Tags: Applied`);
                console.log('=======================');
            } catch (metaError) {
                console.error('Failed to create YouVi metadata:', metaError);
                downloadProgress = { phase: 'idle', percent: 0, message: '' };
            }

            // Restore console
            console.log = originalLog;
            console.error = originalError;

            res.writeHead(200, corsHeaders);
            res.end(JSON.stringify({ 
                success: true, 
                message: 'Download completed successfully',
                output: output,
                logs: logs
            }));
        } else {
            downloadProgress = { phase: 'idle', percent: 0, message: '' };
            // Restore console
            console.log = originalLog;
            console.error = originalError;

            res.writeHead(500, corsHeaders);
            res.end(JSON.stringify({ 
                error: 'Download failed',
                details: errorOutput || output,
                exitCode: code,
                logs: logs
            }));
        }
    });

    ytdlp.on('error', (error) => {
        downloadProgress = { phase: 'idle', percent: 0, message: '' };
        // Restore console
        console.log = originalLog;
        console.error = originalError;

        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ 
            error: 'Failed to run yt-dlp. Make sure it is installed and in your PATH.',
            details: error.message,
            installUrl: 'https://github.com/yt-dlp/yt-dlp#installation',
            logs: logs
        }));
    });
}

/**
 * Create YouVi-compatible metadata file
 * Format: .metadata/videoname.meta.json
 */
async function createYouviMetadata(outputPath, tags, videoUrl, downloadedPath) {
    try {
        const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

        const resolvedNames = resolveVideoNames(outputPath, downloadedPath);
        if (!resolvedNames) {
            console.warn('No downloaded file found to create metadata');
            return null;
        }

        const { videoFileName, videoBaseName } = resolvedNames;
        const infoFile = path.join(outputPath, `${videoBaseName}.info.json`);
        let ytdlpInfo = null;
        if (fs.existsSync(infoFile)) {
            ytdlpInfo = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
            try {
                fs.unlinkSync(infoFile);
            } catch (e) {
            }
        }

        // Create .metadata directory
        const metadataDir = path.join(outputPath, '.metadata');
        if (!fs.existsSync(metadataDir)) {
            fs.mkdirSync(metadataDir, { recursive: true });
        }

        // Create YouVi metadata structure
        const youviMetadata = {
            tags: tagArray,
            description: ytdlpInfo?.description || '',
            uploader: ytdlpInfo?.uploader || ytdlpInfo?.channel || '',
            uploadDate: ytdlpInfo?.upload_date || '',
            duration: ytdlpInfo?.duration || 0,
            viewCount: ytdlpInfo?.view_count || 0,
            likeCount: ytdlpInfo?.like_count || 0,
            thumbnail: ytdlpInfo?.thumbnail || '',
            url: videoUrl,
            title: ytdlpInfo?.title || videoBaseName,
            created: Date.now(),
            views: 0,
            danmakuCount: 0
        };

        // Save YouVi metadata
        const metaFilePath = path.join(metadataDir, `${videoFileName}.meta.json`);
        fs.writeFileSync(metaFilePath, JSON.stringify(youviMetadata, null, 2), 'utf8');
        
        console.log(`✓ Created YouVi metadata: ${metaFilePath}`);

        return { videoFileName, videoBaseName, ytdlpInfo };

    } catch (error) {
        console.error('Error creating YouVi metadata:', error);
        throw error;
    }
}

async function createYouviSidecarData(outputPath, videoUrl, metaContext, options) {
    if (!metaContext || !metaContext.videoFileName) {
        console.log('⚠ Skipping sidecar data: no metaContext');
        return;
    }

    const { videoFileName, videoBaseName, ytdlpInfo } = metaContext;
    const metaDir = path.join(outputPath, '.metadata');
    if (!fs.existsSync(metaDir)) {
        fs.mkdirSync(metaDir, { recursive: true });
    }

    let danmakuItems = [];

    if (options?.downloadComments || options?.downloadDanmaku) {
        if (downloadProgress.phase === 'metadata') {
            downloadProgress.message = 'Fetching comments...';
        }
        console.log(`→ Fetching comments for: ${videoBaseName}`);
        const ytdlpComments = await fetchCommentsWithYtDlp(videoUrl);
        console.log(`  Found ${ytdlpComments.length} raw comments`);
        
        const cleanedComments = filterYtdlpComments(ytdlpComments);
        console.log(`  After filtering: ${cleanedComments.length} comments`);
        
        const youviComments = convertYtdlpComments(cleanedComments);
        const totalWithReplies = countCommentsDeep(youviComments);
        console.log(`  Converted: ${youviComments.length} top-level, ${totalWithReplies} total with replies`);

        if (options?.downloadComments && youviComments.length) {
            if (downloadProgress.phase === 'metadata') downloadProgress.message = 'Saving comments...';
            const commentsPath = path.join(metaDir, `${videoFileName}.comments.json`);
            fs.writeFileSync(commentsPath, JSON.stringify(youviComments, null, 2), 'utf8');
            console.log(`✓ Created YouVi comments: ${commentsPath}`);
        } else if (options?.downloadComments) {
            console.log('⚠ No comments to save');
        }

        if (options?.downloadDanmaku && cleanedComments.length) {
            danmakuItems = danmakuItems.concat(convertCommentsToDanmaku(cleanedComments));
            console.log(`  Extracted ${danmakuItems.length} danmaku from comments`);
        } else if (options?.downloadDanmaku) {
            console.log('⚠ No timestamped comments for danmaku');
        }

    }

    if (options?.downloadLiveChat) {
        if (downloadProgress.phase === 'metadata') downloadProgress.message = 'Fetching live chat...';
        try {
            const liveChatDanmaku = await downloadLiveChatDanmaku(videoUrl);
            if (liveChatDanmaku.length) {
                danmakuItems = danmakuItems.concat(liveChatDanmaku);
            }
        } catch (error) {
            console.warn('Failed to fetch live chat:', error.message);
        }
    }

    if (danmakuItems.length) {
        if (downloadProgress.phase === 'metadata') downloadProgress.message = 'Saving danmaku...';
        danmakuItems.sort((a, b) => (a.time || 0) - (b.time || 0));
        const danmakuPath = path.join(metaDir, `${videoFileName}.danmaku.json`);
        fs.writeFileSync(danmakuPath, JSON.stringify(danmakuItems, null, 2), 'utf8');
        console.log(`✓ Created YouVi danmaku: ${danmakuPath} (${danmakuItems.length} items)`);
    } else if (options?.downloadDanmaku || options?.downloadLiveChat) {
        console.log('⚠ No danmaku items to save');
    }

    if (options?.downloadDescription && ytdlpInfo?.description) {
        if (downloadProgress.phase === 'metadata') downloadProgress.message = 'Saving description...';
        const descPath = path.join(metaDir, `${videoFileName}.description.txt`);
        fs.writeFileSync(descPath, ytdlpInfo.description, 'utf8');
        console.log(`✓ Created description: ${descPath}`);
    }
}

/**
 * Fetch comments separately using yt-dlp --skip-download
 * This avoids the "Incomplete data received" bug that occurs when downloading video + comments together
 */
function fetchCommentsWithYtDlp(videoUrl) {
    return new Promise((resolve) => {
        const tmpDir = path.join(os.tmpdir(), `ytdlp-comments-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });

        const args = [
            '--write-comments',
            '--write-info-json',
            '--skip-download',
            '--no-warnings',
            '--extractor-args', 'youtube:max_comments=all,all,all,all',
            '--js-runtimes', 'nodejs',
            '-o', path.join(tmpDir, '%(id)s.%(ext)s'),
            videoUrl
        ];

        console.log('  → Running yt-dlp for comments:', args.join(' '));

        const ytdlpCommands = ['yt-dlp', 'yt-dlp.exe'];
        let proc = null;

        for (const cmd of ytdlpCommands) {
            try {
                proc = spawn(cmd, args, { env: UTF8_ENV });
                break;
            } catch (e) {
                continue;
            }
        }

        if (!proc) {
            console.log('  ⚠ Could not start yt-dlp for comments');
            resolve([]);
            return;
        }

        proc.stdout.on('data', (data) => console.log('  [comments]', data.toString().trim()));
        proc.stderr.on('data', (data) => console.error('  [comments]', data.toString().trim()));

        proc.on('close', (code) => {
            try {
                // Find the .info.json file in tmpDir
                const files = fs.readdirSync(tmpDir);
                const infoFile = files.find(f => f.endsWith('.info.json'));
                
                if (infoFile) {
                    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, infoFile), 'utf8'));
                    const comments = data.comments || [];
                    console.log(`  → Fetched ${comments.length} comments from yt-dlp`);
                    
                    // Cleanup tmp
                    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
                    resolve(comments);
                    return;
                }
            } catch (e) {
                console.log(`  ⚠ Error reading comments: ${e.message}`);
            }

            // Cleanup tmp
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
            resolve([]);
        });

        proc.on('error', () => {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
            resolve([]);
        });
    });
}

function loadYtdlpComments(outputPath, videoBaseName, ytdlpInfo) {
    // Try loading from info.json first
    if (ytdlpInfo && Array.isArray(ytdlpInfo.comments)) {
        console.log(`  \u2192 Found ${ytdlpInfo.comments.length} comments in info.json`);
        return { comments: ytdlpInfo.comments, sourcePath: null };
    }

    // Try loading from separate comments file
    const commentsPath = path.join(outputPath, `${videoBaseName}.comments.json`);
    console.log(`  \u2192 Checking for comments file: ${commentsPath}`);
    
    if (!fs.existsSync(commentsPath)) {
        console.log(`  \u26a0 Comments file not found`);
        return { comments: [], sourcePath: null };
    }

    try {
        const data = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
        if (Array.isArray(data)) {
            console.log(`  \u2192 Loaded ${data.length} comments from file`);
            return { comments: data, sourcePath: commentsPath };
        }
        if (data && Array.isArray(data.comments)) {
            console.log(`  \u2192 Loaded ${data.comments.length} comments from file (nested)`);
            return { comments: data.comments, sourcePath: commentsPath };
        }
    } catch (e) {
        console.log(`  \u26a0 Failed to parse comments file: ${e.message}`);
        return { comments: [], sourcePath: null };
    }

    console.log(`  \u26a0 Comments file has invalid format`);
    return { comments: [], sourcePath: null };
}

/**
 * Build a threaded comment tree from flat yt-dlp comments (mirrors Python build_comment_tree)
 */
function convertYtdlpComments(ytdlpComments) {
    if (!Array.isArray(ytdlpComments)) return [];

    const commentDict = {};
    const result = [];

    // First pass — create all comment objects
    for (const c of ytdlpComments) {
        const cId = c?.id;
        if (!cId) continue;

        const text = stripLeadingMentions(String(c?.text || c?.content || '').trim());
        if (!text) continue;

        // Try multiple timestamp field names that yt-dlp might use
        const rawTimestamp = c?.timestamp || c?._time_text || c?.time_text || c?.created || c?.timestamp_usec;

        const item = {
            id: String(cId),
            nick: String(c?.author || c?.uploader || c?.uploader_id || 'Anon').replace(/^@/, ''),
            text,
            created: normalizeTimestamp(rawTimestamp),
            replies: []
        };

        // Likes — check properly (0 is valid)
        if (typeof c?.like_count === 'number') item.likes = c.like_count;

        // Extra fields (matching Python script)
        if (c?.author_id) item.author_id = c.author_id;
        if (c?.author_thumbnail) item.author_thumbnail = c.author_thumbnail;
        if (c?.author_is_uploader) item.is_uploader = true;

        commentDict[cId] = item;
    }

    // Second pass — link replies via parent field
    for (const c of ytdlpComments) {
        const cId = c?.id;
        const parentId = c?.parent;
        if (!cId || !commentDict[cId]) continue;

        if (parentId && parentId !== 'root' && commentDict[parentId]) {
            commentDict[parentId].replies.push(commentDict[cId]);
        } else {
            result.push(commentDict[cId]);
        }
    }

    return result;
}

function countCommentsDeep(comments) {
    let total = comments.length;
    for (const c of comments) {
        if (c.replies?.length) total += countCommentsDeep(c.replies);
    }
    return total;
}

function filterYtdlpComments(ytdlpComments) {
    if (!Array.isArray(ytdlpComments)) return [];

    return ytdlpComments.filter(comment => {
        const text = String(comment?.text || comment?.content || '');
        return text && !containsBannedPhrases(text);
    });
}

function containsBannedPhrases(text) { // очистка комментов от пропаганды и оскорблений русского происхождения
    const normalized = text.toLowerCase();

    // Character substitution maps for l33tspeak evasion detection
    const charMap = {
        'о': '[оo0οо]',
        'а': '[аa@а]',
        'е': '[еe3е]',
        'и': '[иi1і]',
        'у': '[уy]',
        'с': '[сc]',
        'р': '[рp]',
        'х': '[хx]',
        'з': '[зz3]',
        'в': '[вb]',
        'н': '[нh]',
        'т': '[тt]',
        'л': '[лl]',
        'д': '[дd]'
    };

    const filterList = [
        // Деградирующие этнонимы
        'хохл',
        'хохлы',
        'хохлов',
        'хохлам',
        'хохляндия',
        'хохлостан',
        'укроп',
        'укропы',
        'укропов',
        'укры',
        'свидомит',
        'бандеровц',
        'бандерлог',
        'ватник',
        'ватники',
        'колорад',
        
        // Искажения топонимов
        'усраина',
        'окраина',
        'незалежная',
        
        // Военная пропаганда
        'сво',
        'денацификация',
        'демилитаризация',
        'вагнер',
        'лднр',
        'днр',  
        'лнр',
        
        // Сленг пропаганды
        'хунта',
        'зеля',
        'гей-парад',
        'содомия',
        'пендосы',
        'пиндосы',
        'пендосия',
        'америкосы',
        'гейропа',
        'нацик',
        
        // Z-символика
        'zа победу',
        'zа россию',
        'zов',
        'слава россии',
    ];

    // Convert banned terms to regex patterns with character substitutions
    const patterns = filterList.map(term => {
        let pattern = term.split('').map(char => {
            const lower = char.toLowerCase();
            return charMap[lower] || char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        
        // Add word boundaries for terms with Cyrillic or Latin letters
        if (/^[а-яёіїєa-z]/i.test(term)) {
            pattern = `\\b${pattern}`;
        }
        if (/[а-яёіїєa-z]$/i.test(term)) {
            pattern = `${pattern}\\b`;
        }
        
        return new RegExp(pattern, 'iu');
    });

    // Test against all patterns
    return patterns.some(pattern => pattern.test(normalized));
}

function stripLeadingMentions(text) {
    return text.replace(/^(@\S+\s+)+/u, '').trim();
}

function convertCommentsToDanmaku(ytdlpComments) {
    if (!Array.isArray(ytdlpComments)) return [];

    const colors = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff69b4'];
    const timePattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;
    const nowMs = Date.now();

    const danmaku = [];
    ytdlpComments.forEach((comment, index) => {
        const text = String(comment?.text || comment?.content || '');
        const match = text.match(timePattern);
        if (!match) return;

        const timeSec = parseTimestamp(match[1]);
        if (timeSec === null) return;

        const cleanText = text.replace(timePattern, '').trim();
        if (!cleanText) return;

        const color = Math.random() < 0.2 ? colors[Math.floor(Math.random() * colors.length)] : '#ffffff';

        danmaku.push({
            id: String(nowMs + index),
            text: cleanText,
            time: timeSec,
            color,
            size: 'normal',
            position: 'scroll',
            created: nowMs + index,
            shown: false
        });
    });

    return danmaku;
}

function parseTimestamp(ts) {
    const parts = ts.split(':').map(v => Number.parseInt(v, 10));
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
}

function normalizeTimestamp(value) {
    if (!value) return Date.now();
    
    // Handle string timestamps (e.g., "2 years ago", "1 month ago")
    if (typeof value === 'string') return Date.now();
    
    const num = Number(value);
    if (Number.isNaN(num)) return Date.now();
    
    // Timestamps > 1e12 are likely in milliseconds (e.g., 1707700000000)
    // Timestamps < 1e12 are likely in seconds (e.g., 1707700000)
    // Current time in seconds is ~1.7 billion (2024-2026)
    return num > 1e12 ? num : num * 1000;
}

async function downloadLiveChatDanmaku(videoUrl) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youvi-livechat-'));
    const args = [
        '--write-subs',
        '--sub-langs', 'live_chat',
        '--skip-download',
        '--no-warnings',
        '-o', path.join(tempDir, '%(id)s.%(ext)s'),
        videoUrl
    ];

    const result = await runYtDlp(args, { cwd: tempDir });
    if (result.code !== 0) {
        throw new Error(result.stderr || 'yt-dlp live chat failed');
    }

    const chatFile = fs.readdirSync(tempDir).find(name => name.includes('live_chat') && name.endsWith('.json'));
    if (!chatFile) return [];

    const lines = fs.readFileSync(path.join(tempDir, chatFile), 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

    const nowMs = Date.now();
    const danmaku = [];

    lines.forEach((line, index) => {
        try {
            const obj = JSON.parse(line);
            const replayAction = obj.replayChatItemAction;
            if (!replayAction) return;

            const innerActions = replayAction.actions || [];
            innerActions.forEach(inner => {
                const addAction = inner.addChatItemAction;
                const item = addAction && addAction.item;
                const renderer = item && item.liveChatTextMessageRenderer;
                if (!renderer) return;

                const runs = (renderer.message && renderer.message.runs) || [];
                const text = runs.map(run => run.text || '').join('');
                if (!text.trim()) return;

                const offsetMs = Number.parseInt(replayAction.videoOffsetTimeMsec || '0', 10);
                const timeSec = Number.isNaN(offsetMs) ? 0 : offsetMs / 1000;
                const color = renderer.authorBadges ? '#ffd700' : '#ffffff';

                danmaku.push({
                    id: String(nowMs + index),
                    text,
                    time: timeSec,
                    color,
                    size: 'normal',
                    position: 'scroll',
                    created: nowMs + index,
                    shown: false
                });
            });
        } catch (e) {
            return;
        }
    });

    return danmaku;
}

function runYtDlp(args, spawnOptions = {}) {
    return new Promise((resolve, reject) => {
        const ytdlpCommands = ['yt-dlp', 'yt-dlp.exe'];
        let lastError = null;
        const options = { ...spawnOptions, env: { ...UTF8_ENV, ...spawnOptions.env } };

        const trySpawn = (index) => {
            if (index >= ytdlpCommands.length) {
                reject(lastError || new Error('Failed to start yt-dlp'));
                return;
            }

            let child = null;
            try {
                child = spawn(ytdlpCommands[index], args, options);
            } catch (error) {
                lastError = error;
                trySpawn(index + 1);
                return;
            }

            let stdout = '';
            let stderr = '';
            child.stdout.on('data', data => { stdout += data.toString(); });
            child.stderr.on('data', data => { stderr += data.toString(); });
            child.on('error', error => {
                lastError = error;
                trySpawn(index + 1);
            });
            child.on('close', code => resolve({ stdout, stderr, code }));
        };

        trySpawn(0);
    });
}

function extractDownloadedPath(output) {
    if (!output) return null;
    const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (isLikelyMediaPath(line)) {
            return line;
        }
    }

    return null;
}

function isLikelyMediaPath(line) {
    return /\.(mp4|mkv|webm|m4a|mp3)$/i.test(line) && (line.includes('\\') || line.includes('/'));
}

function resolveVideoNames(outputPath, downloadedPath) {
    // Prefer actual filename from filesystem so metadata names match the real file (full Unicode).
    // yt-dlp's printed path can be sanitized/wrong encoding on Windows, losing JP/RU/emoji.
    const newest = findNewestVideoFileName(outputPath);
    if (newest) {
        return {
            videoFileName: newest,
            videoBaseName: path.parse(newest).name
        };
    }
    if (downloadedPath) {
        return {
            videoFileName: path.basename(downloadedPath),
            videoBaseName: path.parse(downloadedPath).name
        };
    }
    return null;
}

function findNewestVideoFileName(outputPath) {
    const files = fs.readdirSync(outputPath, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => ({
            name: entry.name,
            stat: fs.statSync(path.join(outputPath, entry.name))
        }))
        .filter(entry => /\.(mp4|mkv|webm|m4a|mp3)$/i.test(entry.name));

    if (!files.length) return null;

    files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return files[0].name;
}

/**
 * Download video from mover.uz
 */
async function downloadMover(videoUrl, outputPath, tags, corsHeaders, res) {
    // Capture all console logs for this request
    const logs = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        logs.push({ type: 'info', message: msg, timestamp: new Date().toISOString() });
        originalLog.apply(console, args);
    };
    console.error = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        logs.push({ type: 'error', message: msg, timestamp: new Date().toISOString() });
        originalError.apply(console, args);
    };
    
    try {
        const https = require('https');
        
        console.log('→ Platform detected: Mover.uz');
        console.log('→ Video URL:', videoUrl);
        console.log('→ Output path:', outputPath);
        
        // Validate mover.uz domain
        try {
            const parsedUrl = new URL(videoUrl);
            const host = parsedUrl.hostname.toLowerCase();
            if (host !== 'mover.uz' && host !== 'www.mover.uz') {
                throw new Error('URL must be from mover.uz domain');
            }
        } catch (urlErr) {
            if (urlErr.message.includes('mover.uz')) throw urlErr;
            throw new Error('Invalid mover.uz URL');
        }

        // Extract video ID
        const match = videoUrl.match(/\/watch\/([a-zA-Z0-9_-]+)/);
        if (!match) {
            throw new Error('Invalid mover.uz URL format');
        }
        
        const videoId = match[1];
        
        // Fetch page to get title
        let title = videoId;
        try {
            console.log('→ Fetching video metadata...');
            const pageHtml = await fetchUrl(videoUrl);
            
            // Try multiple patterns to extract title
            let titleMatch = pageHtml.match(/<title>([^<]+)<\/title>/);
            if (titleMatch && titleMatch[1]) {
                let extractedTitle = titleMatch[1].replace(' - Mover.uz', '').trim();
                
                // Reject if it looks like an error page
                if (!extractedTitle.match(/^(403|404|500|Forbidden|Not Found|Error)/i)) {
                    title = sanitizeFilename(extractedTitle);
                    console.log('→ Video title:', title);
                } else {
                    console.warn('⚠ Got error page, using video ID as title');
                }
            } else {
                console.warn('⚠ Could not extract title, using video ID');
            }
        } catch (e) {
            console.warn('⚠ Could not fetch title:', e.message);
        }

        const outputFile = path.join(outputPath, `${title}.mp4`);
        
        // Try different quality variants in order: _h (720p), _m (360p)
        const qualityVariants = ['_h', '_m'];
        let downloadUrl = null;
        
        console.log('→ Testing quality variants...');
        for (const variant of qualityVariants) {
            const qualityLabel = variant === '_h' ? '720p' : '360p';
            const testUrl = `https://v.mover.uz/${videoId}${variant}.mp4`;
            try {
                const exists = await testMoverUrl(testUrl);
                if (exists) {
                    downloadUrl = testUrl;
                    console.log(`✓ Found working URL: ${variant}.mp4 (${qualityLabel})`);
                    break;
                }
            } catch (e) {
                console.log(`  × ${variant}.mp4 (${qualityLabel}) not available`);
            }
        }
        
        if (!downloadUrl) {
            throw new Error('No working video quality found. Video may have been removed or is geo-restricted.');
        }
        
        console.log('→ Starting download...');
        console.log(`  From: ${downloadUrl}`);
        console.log(`  To: ${outputFile}`);

        // Download video with proper headers
        const file = fs.createWriteStream(outputFile);
        let downloadedBytes = 0;
        
        const options = {
            headers: {
                'Referer': 'https://mover.uz/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            }
        };
        
        https.get(downloadUrl, options, (response) => {
            if (response.statusCode !== 200 && response.statusCode !== 206) {
                file.close();
                fs.unlinkSync(outputFile);
                throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`);
            }

            const totalBytes = parseInt(response.headers['content-length'] || '0');
            console.log(`→ File size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                    if (downloadedBytes % (5 * 1024 * 1024) < chunk.length) { // Log every ~5MB
                        console.log(`→ Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
                    }
                }
            });
            
            response.pipe(file);

            file.on('finish', async () => {
                file.close();
                console.log('✓ Download completed');
                
                // Create .metadata directory
                const metadataDir = path.join(outputPath, '.metadata');
                if (!fs.existsSync(metadataDir)) {
                    fs.mkdirSync(metadataDir, { recursive: true });
                }

                // Parse tags
                const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

                // Create YouVi metadata
                const metadata = {
                    tags: tagArray,
                    description: '',
                    uploader: 'Mover.uz',
                    uploadDate: '',
                    duration: 0,
                    viewCount: 0,
                    likeCount: 0,
                    thumbnail: '',
                    url: videoUrl,
                    title: title,
                    platform: 'mover',
                    created: Date.now(),
                    views: 0,
                    danmakuCount: 0,
                    videoUrl: downloadUrl
                };
                
                const metaFile = path.join(metadataDir, `${title}.mp4.meta.json`);
                fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf8');
                
                console.log(`✓ Created YouVi metadata: ${metaFile}`);
                console.log('');
                console.log('=== Download Summary ===');
                console.log(`✓ Video: ${title}.mp4`);
                console.log(`✓ Size: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
                if (tags) console.log(`✓ Tags: Applied`);
                console.log('=======================');
                
                // Restore console
                console.log = originalLog;
                console.error = originalError;
                
                res.writeHead(200, corsHeaders);
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Download completed successfully',
                    filename: `${title}.mp4`,
                    logs: logs
                }));
            });
        }).on('error', (error) => {
            file.close();
            try { fs.unlinkSync(outputFile); } catch (e) {}
            throw error;
        });

    } catch (error) {
        console.error('✗ Download failed:', error.message);
        
        // Restore console
        console.log = originalLog;
        console.error = originalError;
        
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ 
            error: error.message,
            logs: logs
        }));
    }
}

/**
 * Test if a Mover.uz URL is accessible
 */
function testMoverUrl(url) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const options = {
            method: 'HEAD',
            headers: {
                'Referer': 'https://mover.uz/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        
        https.request(url, options, (res) => {
            resolve(res.statusCode === 200 || res.statusCode === 206);
        }).on('error', reject).end();
    });
}

/**
 * Helper function to fetch URL content with proper headers.
 * Limits redirect depth and validates redirect targets.
 */
function fetchUrl(url, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
            return reject(new Error('Too many redirects'));
        }
        
        // Validate URL to prevent SSRF
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return reject(new Error('Only http/https URLs are allowed'));
            }
            const host = parsed.hostname.toLowerCase();
            if (host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
                host.startsWith('192.168.') || host.startsWith('10.') ||
                host.startsWith('172.16.') || host.endsWith('.local')) {
                return reject(new Error('Internal URLs are not allowed'));
            }
        } catch (e) {
            return reject(new Error('Invalid URL'));
        }
        
        const https = require('https');
        const options = {
            headers: {
                'Referer': 'https://mover.uz/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            }
        };
        
        https.get(url, options, (res) => {
            // Handle redirects with depth limit
            if (res.statusCode === 301 || res.statusCode === 302) {
                const location = res.headers.location;
                if (!location) return reject(new Error('Redirect without Location header'));
                return fetchUrl(location, maxRedirects - 1).then(resolve).catch(reject);
            }
            
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            
            // Limit response size (5 MB max for HTML pages)
            const maxSize = 5 * 1024 * 1024;
            let data = '';
            let size = 0;
            res.on('data', chunk => {
                size += chunk.length;
                if (size > maxSize) {
                    res.destroy();
                    reject(new Error('Response too large'));
                    return;
                }
                data += chunk;
            });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

server.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║                                                        ║');
    console.log('║          YouVi Download Server is running!            ║');
    console.log('║                                                        ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Server:  http://localhost:${PORT}`);
    console.log(`  Health:  http://localhost:${PORT}/health`);
    console.log('');
    console.log('  Now open youvi_download.html in your browser');
    console.log('');
    console.log('  Press Ctrl+C to stop the server');
    console.log('');
});

/* 
   Youvi Player - Copyright (C) 2026 Yuvisite 
   This program is free software: you can redistribute it and/or modify 
   it under the terms of the GNU General Public License as published by 
   the Free Software Foundation, either version 3 of the License, or 
   (at your option) any later version. 
  
   This program is distributed in the hope that it will be useful, 
   but WITHOUT ANY WARRANTY; without even the implied warranty of 
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
   GNU General Public License for more details. 
  
   You should have received a copy of the GNU General Public License 
   along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * Youvi Download Manager
 * Downloads videos via local Node.js server
 */

'use strict';

let selectedPath = '';
let tagAutocomplete = null;
let activeDownloadServerBase = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initializeI18n();
    applyPlatformFromUrl();
    initializeEventListeners();
    await initializeTagSystem();
    updatePlatformOptions();
    checkServerStatus();
    highlightDownloadSidebarLink();
});

function initializeI18n() {
    const langSwitcher = document.getElementById('langSwitcher');
    if (langSwitcher && typeof i18n !== 'undefined') {
        // Set dropdown to current language from localStorage
        const currentLang = i18n.getCurrentLanguage();
        langSwitcher.value = currentLang;
        
        // Listen for language changes
        langSwitcher.addEventListener('change', async (e) => {
            const newLang = e.target.value;
            await i18n.setLanguage(newLang);
            
            updatePlatformOptions();
            // Re-check server status to update with new language
            checkServerStatus();
        });
    } else if (typeof i18n === 'undefined') {
        console.warn('[Download] i18n not available');
    }
}

function initializeEventListeners() {
    document.getElementById('generateBtn').addEventListener('click', handleDownload);
    
    // Platform button handlers: update URL with platform when chosen
    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const platform = e.currentTarget.dataset.platform;
            updatePlatformInUrl(platform);
            updatePlatformOptions();
            highlightDownloadSidebarLink();
        });
    });
}

function getPlatformFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('platform') || null;
}

function applyPlatformFromUrl() {
    const platform = getPlatformFromUrl();
    if (!platform) return;
    const btn = document.querySelector(`.platform-btn[data-platform="${platform}"]`);
    if (btn) {
        document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
}

function updatePlatformInUrl(platform) {
    const url = new URL(window.location.href);
    if (platform && platform !== 'youtube') {
        url.searchParams.set('platform', platform);
    } else {
        url.searchParams.delete('platform');
    }
    const newUrl = url.pathname + (url.search ? url.search : '');
    window.history.replaceState(null, '', newUrl);
}

function highlightDownloadSidebarLink() {
    const platform = getPlatformFromUrl();
    document.querySelectorAll('.sidebar a[href*="youvi_download.html"]').forEach(link => {
        link.classList.remove('active');
        const href = (link.getAttribute('href') || '').split('?')[0];
        const query = (link.getAttribute('href') || '').includes('?') ? (link.getAttribute('href') || '').split('?')[1] : '';
        const linkPlatform = query ? new URLSearchParams(query).get('platform') : null;
        const isMainLink = href.endsWith('youvi_download.html') && !linkPlatform;
        if (platform ? linkPlatform === platform : isMainLink) {
            link.classList.add('active');
        }
    });
}

async function initializeTagSystem() {
    try {
        if (typeof window.tagDatabaseManager === 'undefined') {
            console.warn('[Download] Tag database manager not available');
            return;
        }

        const dirHandle = await window.YouviShared.getYouviDirectory();
        if (!dirHandle) {
            console.warn('[Download] No directory access for tags');
            return;
        }

        try {
            const permission = await dirHandle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                const requested = await dirHandle.requestPermission({ mode: 'read' });
                if (requested !== 'granted') {
                    console.warn('[Download] Directory permission denied for tag autocomplete');
                    return;
                }
            }
        } catch (permErr) {
            console.warn('[Download] Failed to verify directory permission for tags:', permErr);
            return;
        }

        await window.tagDatabaseManager.initialize(dirHandle);
        await ensureTagDatabaseHasData();
        
        const tagInput = document.getElementById('videoTags');
        if (tagInput && typeof window.TagInputAutocomplete !== 'undefined') {
            tagAutocomplete = new window.TagInputAutocomplete(tagInput, {
                minChars: 1,
                debounceDelay: 150,
                maxResults: 10
            });
            console.log('[Download] Tag autocomplete initialized');
        }
    } catch (err) {
        console.warn('[Download] Failed to initialize tag system:', err);
    }
}

async function ensureTagDatabaseHasData() {
    try {
        if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) return;
        const existing = window.tagDatabaseManager.getAllTags();
        if (Array.isArray(existing) && existing.length > 0) return;
        if (typeof window.AutocompleteDataLoader === 'undefined') {
            console.warn('[Download] AutocompleteDataLoader not available for tag DB bootstrap');
            return;
        }

        const loaded = await window.AutocompleteDataLoader.loadData();
        const videos = Array.isArray(loaded?.videos) ? loaded.videos : [];
        if (!videos.length) return;

        const counts = new Map();
        videos.forEach(video => {
            const tags = Array.isArray(video?.tags) ? video.tags : [];
            tags.forEach(raw => {
                const tag = String(raw || '').trim();
                if (!tag) return;
                counts.set(tag, (counts.get(tag) || 0) + 1);
            });
        });

        if (!counts.size) return;

        const ops = Array.from(counts.entries()).map(([tagName, count]) => ({
            tagName,
            options: { usageCount: count, incrementUsage: false }
        }));

        await window.tagDatabaseManager.addTagsBatch(ops);
        console.log('[Download] Tag database bootstrapped from videos:', ops.length);
    } catch (e) {
        console.warn('[Download] Failed to bootstrap tag database:', e);
    }
}

function normalizeServerBase(base) {
    return String(base || '').trim().replace(/\/+$/, '');
}

function getCustomDownloadServerBase() {
    const runtimeValue = typeof window !== 'undefined' ? (window.YOUVI_DOWNLOAD_SERVER_URL || window.__YOUVI_DOWNLOAD_SERVER__) : '';
    if (runtimeValue) return normalizeServerBase(runtimeValue);

    try {
        const stored = localStorage.getItem('youvi_download_server_url');
        if (stored) return normalizeServerBase(stored);
    } catch (e) {
    }

    return '';
}

function getDownloadServerCandidates() {
    const candidates = [];
    const addCandidate = (value) => {
        const normalized = normalizeServerBase(value);
        if (!normalized) return;
        if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    addCandidate(getCustomDownloadServerBase());

    const protocol = window.location.protocol;
    const hostname = window.location.hostname;

    if (protocol !== 'file:') {
        addCandidate(window.location.origin);

        // Support reverse proxy setups such as nginx -> node backend
        addCandidate(`${window.location.origin}/download-api`);

        if (protocol === 'http:' && hostname) {
            addCandidate(`http://${hostname}:3000`);
        }
    }

    // Keep file://, loopback, and custom local HTTP aliases working
    if (protocol === 'file:' || protocol === 'http:' || hostname === 'localhost' || hostname === '127.0.0.1') {
        addCandidate('http://localhost:3000');
        addCandidate('http://127.0.0.1:3000');
    }

    return candidates;
}

function buildDownloadServerUrl(base, path) {
    const normalizedBase = normalizeServerBase(base);
    const normalizedPath = String(path || '').startsWith('/') ? path : `/${path || ''}`;
    return `${normalizedBase}${normalizedPath}`;
}

async function probeDownloadServer(force = false) {
    if (activeDownloadServerBase && !force) {
        return activeDownloadServerBase;
    }

    const candidates = getDownloadServerCandidates();
    for (const candidate of candidates) {
        try {
            const response = await fetch(buildDownloadServerUrl(candidate, '/health'));
            const health = await response.json().catch(() => null);
            if (response.ok && health && health.status === 'ok') {
                activeDownloadServerBase = candidate;
                return activeDownloadServerBase;
            }
        } catch (error) {
        }
    }

    activeDownloadServerBase = null;
    return null;
}

async function checkServerStatus() {
    const statusEl = document.getElementById('serverStatus');
    const statusText = statusEl.querySelector('span:last-child');
    
    try {
        const base = await probeDownloadServer(true);
        if (base) {
            statusEl.className = 'server-status online';
            statusText.setAttribute('data-i18n', 'download.serverOnline');
            if (window.i18n) {
                statusText.textContent = i18n.t('download.serverOnline', 'Server Online');
            } else {
                statusText.textContent = 'Server Online';
            }
            statusEl.title = base;
            return;
        }

        statusEl.className = 'server-status offline';
        statusText.setAttribute('data-i18n', 'download.serverOffline');
        if (window.i18n) {
            statusText.textContent = i18n.t('download.serverOffline', 'Server Offline');
        } else {
            statusText.textContent = 'Server Offline';
        }
        statusEl.title = '';
    } catch (error) {
        statusEl.className = 'server-status offline';
        statusText.setAttribute('data-i18n', 'download.serverOffline');
        if (window.i18n) {
            statusText.textContent = i18n.t('download.serverOffline', 'Server Offline');
        } else {
            statusText.textContent = 'Server Offline';
        }
        statusEl.title = '';
    }
}

function updatePlatformOptions() {
    const activeBtn = document.querySelector('.platform-btn.active');
    const platform = activeBtn ? activeBtn.dataset.platform : 'youtube';
    const platformLimitedItems = document.querySelectorAll('.platform-limited');
    const platformNote = document.getElementById('platformNote');

    platformLimitedItems.forEach(item => {
        const supportedPlatforms = String(item.dataset.platforms || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);

        const enabled = !supportedPlatforms.length || supportedPlatforms.includes(platform);
        item.classList.toggle('enabled', enabled);

        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.disabled = !enabled;
            if (!enabled) checkbox.checked = false;
        }
    });

    updateCommentsLabel(platform);
    updateDanmakuLabel(platform);
    platformNote.textContent = getPlatformNoteText(platform);
    updateUrlPlaceholder(platform);
}

function updateCommentsLabel(platform) {
    const commentsLabel = document.querySelector('label[for="downloadComments"]');
    if (!commentsLabel) return;

    if (platform === 'niconico') {
        commentsLabel.textContent = 'Comments (same timed danmaku, saved as comments)';
        return;
    }

    if (window.i18n) {
        commentsLabel.textContent = i18n.t('download.optionComments', 'Comments (JSON)');
        return;
    }

    commentsLabel.textContent = 'Comments (JSON)';
}

function updateDanmakuLabel(platform) {
    const danmakuLabel = document.querySelector('label[for="downloadDanmaku"]');
    if (!danmakuLabel) return;

    if (platform === 'niconico') {
        danmakuLabel.textContent = 'Danmaku (native comments track)';
        return;
    }

    if (platform === 'bilibili') {
        danmakuLabel.textContent = 'Danmaku (native XML track)';
        return;
    }

    if (window.i18n) {
        danmakuLabel.textContent = i18n.t('download.optionDanmaku', 'Danmaku (from comments)');
        return;
    }

    danmakuLabel.textContent = 'Danmaku (from comments)';
}

function getPlatformNoteText(platform) {
    if (platform === 'niconico') {
        return 'Niconico has one native timed comments/danmaku stream here: Comments saves it as Youvi comments list, Danmaku saves the same stream as overlay danmaku.';
    }

    if (platform === 'bilibili') {
        return 'Bilibili can import native XML danmaku. Regular site comments are not downloaded here.';
    }

    return '';
}

function updateUrlPlaceholder(platform) {
    const urlInput = document.getElementById('videoUrl');
    const placeholders = {
        'youtube': 'https://youtube.com/watch?v=...',
        'niconico': 'https://www.nicovideo.jp/watch/sm...',
        'bilibili': 'https://www.bilibili.com/video/BV...',
        'tiktok': 'https://www.tiktok.com/@user/video/...',
        'odysee': 'https://odysee.com/@channel/video-title:...',
        'iwara': 'https://www.iwara.tv/video/...',
        'vimeo': 'https://vimeo.com/...',
        'dailymotion': 'https://www.dailymotion.com/video/...',
        'mover': 'https://mover.uz/watch/...',
        'mix': 'https://mix.tj/video/...'
    };
    urlInput.placeholder = placeholders[platform] || 'Enter video URL';
}

async function handleDownload() {
    const url = document.getElementById('videoUrl').value.trim();
    const tags = document.getElementById('videoTags').value.trim();
    selectedPath = document.getElementById('pathInput').value.trim();
    const activeBtn = document.querySelector('.platform-btn.active');
    const platform = activeBtn ? activeBtn.dataset.platform : 'youtube';
    
    if (!url) {
        showStatus('Please enter a video URL', 'error');
        return;
    }
    
    if (!selectedPath) {
        showStatus('Please enter an absolute save path', 'error');
        return;
    }
    
    const downloadVideo = document.getElementById('downloadVideo').checked;
    const downloadComments = document.getElementById('downloadComments').checked;
    const downloadDanmaku = document.getElementById('downloadDanmaku').checked;
    const downloadLiveChat = document.getElementById('downloadLiveChat').checked;
    const downloadDescription = document.getElementById('downloadDescription').checked;
    const videoQuality = document.getElementById('videoQuality').value;

    if (!downloadVideo) {
        showStatus('Please select video download', 'error');
        return;
    }

    // Check if server is running
    const serverBase = await probeDownloadServer();
    if (!serverBase) {
        showStatus('❌ Download server not running or not reachable from this page', 'error');
        return;
    }

    // Clear console and show it
    const consoleOutput = document.getElementById('consoleOutput');
    consoleOutput.innerHTML = '';
    consoleOutput.classList.add('active');

    const progressBlock = document.getElementById('downloadProgressBlock');
    const progressLabel = document.getElementById('downloadProgressLabel');
    const progressBar = document.getElementById('downloadProgressBar');
    progressBlock.style.display = 'block';
    progressLabel.textContent = typeof i18n !== 'undefined' ? i18n.t('download.progressVideo', 'Downloading video...') : 'Downloading video...';
    progressBar.style.width = '0%';

    let lastLogCount = 0;
    let progressInterval;
    progressInterval = setInterval(async () => {
        try {
            const pr = await fetch(buildDownloadServerUrl(serverBase, '/progress'));
            if (!pr.ok) return;
            const data = await pr.json();
            const pct = (data.phase === 'metadata' ? (data.percent ?? 100) : data.percent) || 0;
            progressBar.style.width = Math.min(100, pct) + '%';
            if (data.message) progressLabel.textContent = data.message;
            if (data.logs && data.logs.length > lastLogCount) {
                for (let i = lastLogCount; i < data.logs.length; i++) {
                    addConsoleLog(data.logs[i].message, data.logs[i].type || 'info');
                }
                lastLogCount = data.logs.length;
            }
            if (data.phase === 'idle') clearInterval(progressInterval);
        } catch (e) {}
    }, 400);

    addConsoleLog('Starting download...', 'info');
    showStatus('Downloading...', 'info');

    try {
        const response = await fetch(buildDownloadServerUrl(serverBase, '/download'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                outputPath: selectedPath,
                tags: tags,
                platform: platform,
                options: {
                    downloadComments: downloadComments,
                    downloadDanmaku: downloadDanmaku,
                    downloadLiveChat: downloadLiveChat,
                    downloadDescription: downloadDescription,
                    downloadSubtitles: false,
                    quality: videoQuality
                }
            })
        });

        clearInterval(progressInterval);
        progressBar.style.width = response.ok ? '100%' : '0%';
        if (response.ok) {
            progressLabel.textContent = typeof i18n !== 'undefined' ? i18n.t('download.progressDone', 'Done') : 'Done';
            setTimeout(() => { progressBlock.style.display = 'none'; }, 1500);
        } else {
            progressBlock.style.display = 'none';
        }

        const result = await response.json();

        if (response.ok && result.success) {
            // Append any server logs not yet shown by the progress poll
            if (result.logs && Array.isArray(result.logs) && result.logs.length > lastLogCount) {
                for (let i = lastLogCount; i < result.logs.length; i++) {
                    addConsoleLog(result.logs[i].message, result.logs[i].type || 'info');
                }
            }
            addConsoleLog(`✓ Download complete: ${result.filename || 'video'}`, 'success');
            showStatus(`✓ Download complete: ${result.filename || 'video'}`, 'success');
            
            if (result.output) {
                const lines = result.output.split('\n');
                lines.forEach(line => {
                    if (line.trim()) addConsoleLog(line, 'info');
                });
            }
        } else {
            if (result.logs && Array.isArray(result.logs) && result.logs.length > lastLogCount) {
                for (let i = lastLogCount; i < result.logs.length; i++) {
                    addConsoleLog(result.logs[i].message, result.logs[i].type || 'info');
                }
            }
            addConsoleLog(`✗ Download failed: ${result.error || 'Unknown error'}`, 'error');
            showStatus(`❌ Download failed: ${result.error || 'Unknown error'}`, 'error');
            
            if (result.details) {
                addConsoleLog('Details:', 'error');
                addConsoleLog(result.details, 'error');
            }
            if (result.installUrl) {
                addConsoleLog(`Install yt-dlp: ${result.installUrl}`, 'info');
            }
        }
        
    } catch (error) {
        console.error('Download error:', error);
        clearInterval(progressInterval);
        progressBlock.style.display = 'none';
        addConsoleLog(`✗ Request failed: ${error.message}`, 'error');
        showStatus(`❌ Download failed: ${error.message}`, 'error');
    }
}

function addConsoleLog(message, type = 'info') {
    const consoleOutput = document.getElementById('consoleOutput');
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message status-${type}`;
    statusEl.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
}

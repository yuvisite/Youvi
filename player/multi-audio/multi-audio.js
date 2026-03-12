/**
 * Multi-Audio Track Module for MKV Files
 * Uses FFmpeg.wasm to extract and switch between audio tracks
 * Supports File System Access API for localhost usage
 */

const MULTI_AUDIO_DEBUG = false;
const maDebug = {
    log: (...args) => { if (MULTI_AUDIO_DEBUG) maDebug.log('[MultiAudio]', ...args); },
    warn: (...args) => { if (MULTI_AUDIO_DEBUG) console.warn('[MultiAudio]', ...args); },
    error: (...args) => { console.error('[MultiAudio]', ...args); }
};

maDebug.log('Loading multi-audio.js script...');

/**
 * Shared FFmpeg singleton loader.
 * Ensures only one FFmpeg instance and one wasm download across
 * multi-audio and subtitles managers.
 */
window._sharedFFmpeg = window._sharedFFmpeg || {
    instance: null,
    loadPromise: null,

    async get() {
        if (this.instance) return this.instance;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = this._load();
        return this.loadPromise;
    },

    async _load() {
        const ffmpegBasePath = 'player/multi-audio/fmpeg12';

        if (!window.FFmpegUtil) {
            const utilScript = document.createElement('script');
            utilScript.src = `${ffmpegBasePath}/ffmpeg-util.min.js`;
            await new Promise((resolve, reject) => {
                utilScript.onload = resolve;
                utilScript.onerror = reject;
                document.head.appendChild(utilScript);
            });
        }

        if (!window.FFmpegWASM) {
            const script = document.createElement('script');
            script.src = `${ffmpegBasePath}/ffmpeg.min.js`;
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        let attempts = 0;
        while (!window.FFmpegWASM && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.FFmpegWASM) {
            throw new Error('FFmpeg library failed to load after 5 seconds');
        }

        const { FFmpeg } = window.FFmpegWASM;
        const ffmpeg = new FFmpeg();
        const baseURL = new URL(ffmpegBasePath + '/', document.baseURI).href;

        await ffmpeg.load({
            coreURL: baseURL + 'ffmpeg-core.js',
            wasmURL: baseURL + 'ffmpeg-core.wasm'
        });

        this.instance = ffmpeg;
        return ffmpeg;
    }
};

class MultiAudioTrackManager {
    constructor(videoElement) {
        maDebug.log('[MultiAudio] Constructor called with video element:', videoElement);
        this.video = videoElement;
        this.ffmpeg = null;
        this.audioTracks = [];
        this.currentAudioIndex = -1;
        this.audioElements = [];
        this.isProcessing = false;
        this.originalVideoFile = null;
        this.videoFileName = '';
        this.videoFileHandle = null;
        this.tracksDirectoryHandle = null;
        
        this.cachedTracks = new Map();
        this.cacheDB = null;
        this.inputFileName = 'input.mkv';
        this.blobURLs = [];
        maDebug.log('[MultiAudio] Blob URL tracking initialized');
        
        this.syncInterval = null;
        this.syncListeners = [];
        
        this.state = {
            loaded: false,
            tracksExtracted: false,
            currentTrack: 0,
            totalTracks: 0
        };
        
        this.uiContainer = null;
        this.trackSelector = null;
        
        this.init();
        this.initCacheDB();
    }

    async init() {
        try {
            await this.loadLocalFFmpeg();
            
            this.ffmpeg.on('log', ({ type, message }) => {
                maDebug.log(`[FFmpeg ${type}]`, message);
            });
            
            this.ffmpeg.on('progress', ({ progress, time }) => {
                maDebug.log(`[FFmpeg Progress] ${(progress * 100).toFixed(2)}%`);
                this.updateProgressUI(progress);
            });
            
            this.state.loaded = true;
            maDebug.log('[MultiAudio] FFmpeg loaded successfully');
            
            if (typeof i18n !== 'undefined' && i18n.subscribe) {
                i18n.subscribe(() => {
                    const btn = document.getElementById('audioTracksBtn');
                    if (btn) {
                        btn.title = i18n.t('player.audioTracksKey', 'Audio Tracks (A)');
                    }
                    this.updateMenuOptions();
                });
            }
            
        } catch (error) {
            console.error('[MultiAudio] Failed to load FFmpeg:', error);
            this.showError('Failed to load FFmpeg. Please refresh the page.');
        }
    }

    /**
     * Create blob URL and track it for cleanup
     */
    createTrackedBlobURL(blob) {
        const url = URL.createObjectURL(blob);
        this.blobURLs.push(url);
        maDebug.log(`[MultiAudio] Created blob URL (total: ${this.blobURLs.length}):`, url);
        return url;
    }

    /**
     * Revoke all tracked blob URLs
     */
    revokeAllBlobURLs() {
        maDebug.log(`[MultiAudio] Revoking ${this.blobURLs.length} blob URLs...`);
        this.blobURLs.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn('[MultiAudio] Failed to revoke URL:', url, e);
            }
        });
        this.blobURLs = [];
        maDebug.log('[MultiAudio] All blob URLs revoked');
    }

    /**
     * Revoke single blob URL and remove from tracking
     */
    revokeBlobURL(url) {
        if (!url) return;
        
        try {
            URL.revokeObjectURL(url);
            const index = this.blobURLs.indexOf(url);
            if (index > -1) {
                this.blobURLs.splice(index, 1);
            }
            maDebug.log(`[MultiAudio] Revoked blob URL (remaining: ${this.blobURLs.length})`);
        } catch (e) {
            console.warn('[MultiAudio] Failed to revoke URL:', url, e);
        }
    }

    /**
     * Cleanup audio element and its resources
     */
    cleanupAudioElement(audioElement) {
        if (!audioElement) return;
        
        try {
            audioElement.pause();
            
            if (audioElement.src && audioElement.src.startsWith('blob:')) {
                this.revokeBlobURL(audioElement.src);
            }
            
            audioElement.src = '';
            audioElement.load();
            
            if (audioElement.parentNode) {
                audioElement.parentNode.removeChild(audioElement);
            }
            
            maDebug.log('[MultiAudio] Audio element cleaned up');
        } catch (e) {
            console.warn('[MultiAudio] Failed to cleanup audio element:', e);
        }
    }

    /**
     * Clean up FFmpeg virtual file system
     */
    async cleanupFFmpegFS() {
        if (!this.ffmpeg) return;
        
        try {
            maDebug.log('[MultiAudio] Cleaning up FFmpeg virtual FS...');
            
            const files = await this.ffmpeg.listDir('/');
            maDebug.log('[MultiAudio] Files in FFmpeg FS:', files.length);
            
            for (const file of files) {
                if (file.isDir) continue;
                if (file.name === this.inputFileName) {
                    maDebug.log('[MultiAudio] Keeping input file:', file.name);
                    continue;
                }
                try {
                    await this.ffmpeg.deleteFile(file.name);
                    maDebug.log('[MultiAudio] Deleted:', file.name);
                } catch (e) {
                    console.warn('[MultiAudio] Failed to delete:', file.name, e);
                }
            }
            
            maDebug.log('[MultiAudio] FFmpeg FS cleaned');
        } catch (error) {
            console.warn('[MultiAudio] Failed to clean FFmpeg FS:', error);
        }
    }

    /**
     * Clean up temporary FFmpeg files after extraction
     */
    async cleanupTempFiles() {
        if (!this.ffmpeg) return;
        
        try {
            const tempFiles = ['video_only.mp4', 'output.mp4'];
            
            for (let i = 0; i < 10; i++) {
                tempFiles.push(`audio_${i}.mp4`);
                tempFiles.push(`audio_${i}.mka`);
            }
            
            for (const fileName of tempFiles) {
                try {
                    await this.ffmpeg.deleteFile(fileName);
                    maDebug.log('[MultiAudio] Deleted temp file:', fileName);
                } catch (e) {
                }
            }
        } catch (error) {
            console.warn('[MultiAudio] Failed to cleanup temp files:', error);
        }
    }

    /**
     * Initialize IndexedDB for track caching
     */
    async initCacheDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MultiAudioTracksCache', 1);
            
            request.onerror = () => {
                console.warn('[MultiAudio] IndexedDB not available, caching disabled');
                resolve(null);
            };
            
            request.onsuccess = (event) => {
                this.cacheDB = event.target.result;
                maDebug.log('[MultiAudio] Cache database initialized');
                resolve(this.cacheDB);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('tracks')) {
                    const objectStore = db.createObjectStore('tracks', { keyPath: 'key' });
                    objectStore.createIndex('videoName', 'videoName', { unique: false });
                    maDebug.log('[MultiAudio] Created tracks object store');
                }
            };
        });
    }

    /**
     * Load FFmpeg from local files (v0.12) — uses shared singleton
     */
    async loadLocalFFmpeg() {
        maDebug.log('[MultiAudio] Loading local FFmpeg v0.12 via shared singleton...');
        this.ffmpeg = await window._sharedFFmpeg.get();
        maDebug.log('[MultiAudio] Local FFmpeg v0.12 core loaded successfully');
        return true;
    }

    /**
     * Load MKV file using File System Access API
     */
    async loadMKVFromFileSystem() {
        try {
            if (!window.showOpenFilePicker) {
                throw new Error('File System Access API not supported');
            }

            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Video Files',
                    accept: {
                        'video/*': ['.mkv', '.mp4', '.webm', '.avi']
                    }
                }],
                multiple: false
            });

            const file = await fileHandle.getFile();
            this.originalVideoFile = file;
            this.videoFileName = file.name;
            this.videoFileHandle = fileHandle;
            
            maDebug.log(`[MultiAudio] Loaded file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
            
            await this.initTracksDirectory();
            
            await this.analyzeAudioTracks(file);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[MultiAudio] Error loading file:', error);
                this.showError('Failed to load file: ' + error.message);
            }
        }
    }

    /**
     * Initialize tracks/ directory next to video file
     */
    async initTracksDirectory() {
        try {
            const parentHandle = await this.videoFileHandle.getParent?.();
            
            if (!parentHandle) {
                console.warn('[MultiAudio] Cannot access parent directory (File System Access API limitation)');
                return;
            }
            
            this.tracksDirectoryHandle = await parentHandle.getDirectoryHandle('.tracks', { create: true });
            maDebug.log('[MultiAudio] Tracks directory initialized (.tracks/)');
            
        } catch (error) {
            console.warn('[MultiAudio] Failed to init tracks directory:', error);
            maDebug.log('[MultiAudio] Will use IndexedDB cache only');
        }
    }

    /**
     * Check if extracted track exists on disk
     */
    async checkDiskCache(trackIndex) {
        if (!this.tracksDirectoryHandle) return null;
        
        try {
            const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
            const trackFileName = `${baseName}_track${trackIndex}.mp4`;
            
            let fileHandle;
            if (typeof this.tracksDirectoryHandle.getFileHandle === 'function') {
                fileHandle = await this.tracksDirectoryHandle.getFileHandle(trackFileName);
            } else if (typeof this.tracksDirectoryHandle.getFile === 'function') {
                fileHandle = await this.tracksDirectoryHandle.getFile(trackFileName);
            } else {
                console.warn('[MultiAudio] Unsupported directory handle type');
                return null;
            }
            
            const file = await (fileHandle.getFile ? fileHandle.getFile() : fileHandle);
            
            maDebug.log(`[MultiAudio] Found cached track on disk: ${trackFileName}`);
            return file;
            
        } catch (error) {
            maDebug.log(`[MultiAudio] Track ${trackIndex} not found in cache:`, error.message);
            return null;
        }
    }

    /**
     * Save extracted track to disk
     */
    async saveToDisk(trackIndex, audioBlob) {
        if (!this.tracksDirectoryHandle) {
            maDebug.log('[MultiAudio] No tracks directory, skipping disk save');
            return false;
        }
        
        try {
            const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
            const trackFileName = `${baseName}_track${trackIndex}.mp4`;
            
            let fileHandle;
            if (typeof this.tracksDirectoryHandle.getFileHandle === 'function') {
                fileHandle = await this.tracksDirectoryHandle.getFileHandle(trackFileName, { create: true });
                const writable = await fileHandle.createWritable();
                
                await writable.write(audioBlob);
                await writable.close();
            } else {
                console.warn('[MultiAudio] Directory handle does not support writing');
                return false;
            }
            
            maDebug.log(`[MultiAudio] Saved track to disk: ${trackFileName}`);
            return true;
            
        } catch (error) {
            console.warn('[MultiAudio] Failed to save track to disk:', error);
            return false;
        }
    }

    /**
     * Load video-only file from disk cache
     */
    async checkVideoCache() {
        if (!this.tracksDirectoryHandle) return null;
        
        try {
            const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
            const videoFileName = `${baseName}_video.mp4`;
            
            let fileHandle;
            if (typeof this.tracksDirectoryHandle.getFileHandle === 'function') {
                fileHandle = await this.tracksDirectoryHandle.getFileHandle(videoFileName);
            } else if (typeof this.tracksDirectoryHandle.getFile === 'function') {
                fileHandle = await this.tracksDirectoryHandle.getFile(videoFileName);
            } else {
                return null;
            }
            
            const file = await (fileHandle.getFile ? fileHandle.getFile() : fileHandle);
            
            maDebug.log(`[MultiAudio] Found cached video on disk: ${videoFileName}`);
            return file;
            
        } catch (error) {
            return null;
        }
    }

    /**
     * Save video-only file to disk
     */
    async saveVideoToDisk(videoBlob) {
        if (!this.tracksDirectoryHandle) {
            maDebug.log('[MultiAudio] No tracks directory, skipping video save');
            return false;
        }
        
        try {
            const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
            const videoFileName = `${baseName}_video.mp4`;
            
            if (typeof this.tracksDirectoryHandle.getFileHandle === 'function') {
                const fileHandle = await this.tracksDirectoryHandle.getFileHandle(videoFileName, { create: true });
                const writable = await fileHandle.createWritable();
                
                await writable.write(videoBlob);
                await writable.close();
                
                maDebug.log(`[MultiAudio] Saved video to disk: ${videoFileName}`);
                return true;
            } else {
                console.warn('[MultiAudio] Directory handle does not support writing');
                return false;
            }
            
        } catch (error) {
            console.warn('[MultiAudio] Failed to save video to disk:', error);
            return false;
        }
    }

    /**
     * Analyze audio tracks in the video file
     */
    async analyzeAudioTracks(file) {
        if (!this.state.loaded) {
            console.warn('[MultiAudio] FFmpeg not loaded yet');
            return;
        }

        this.isProcessing = true;
        this.showStatus('Analyzing audio tracks...');

        try {
            maDebug.log('[MultiAudio] 📥 Reading file into memory...');
            maDebug.log('[MultiAudio] File size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
            
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            maDebug.log('[MultiAudio] ✅ File read complete, writing to FFmpeg virtual FS...');
            
            try {
                await this.ffmpeg.deleteFile(this.inputFileName);
                maDebug.log('[MultiAudio] Deleted old input file');
            } catch (e) {
            }
            
            this.inputFileName = 'input.mkv';
            await this.ffmpeg.writeFile(this.inputFileName, uint8Array);
            
            maDebug.log('[MultiAudio] ✅ File written to FFmpeg, detecting audio streams...');
            
            this.audioTracks = await this.detectAudioStreams(this.inputFileName);
            
            maDebug.log('[MultiAudio] ✅ Audio streams detected:', this.audioTracks.length);
            
            this.state.totalTracks = this.audioTracks.length;
            
            if (this.audioTracks.length > 0) {
                maDebug.log(`[MultiAudio] Found ${this.audioTracks.length} audio track(s)`);
                maDebug.log('[MultiAudio] ℹ️ Tracks ready for extraction on demand (default: disabled)');
                
                this.updateAudioButton();
                
            } else {
                console.warn('[MultiAudio] ⚠️ No audio tracks found in file');
                this.showError('No audio tracks found in file');
            }
            
            await this.cleanupTempFiles();
            
        } catch (error) {
            console.error('[MultiAudio] ❌ Error analyzing tracks:', error);
            console.error('[MultiAudio] Error stack:', error.stack);
            this.showError('Failed to analyze audio tracks: ' + error.message);
        } finally {
            this.isProcessing = false;
            maDebug.log('[MultiAudio] 🏁 analyzeAudioTracks finished');
        }
    }

    /**
     * Detect audio streams in the input file
     */
/**
     * Detect audio streams in the input file
     */
    async detectAudioStreams(inputFileName) {
        const tracks = [];
        
        maDebug.log('[MultiAudio] 🔍 Detecting audio streams in:', inputFileName);
        
        let ffmpegOutput = '';
        
        const logHandler = ({ type, message }) => {
            if (type === 'stderr') {
                ffmpegOutput += message + '\n';
            }
        };
        
        this.ffmpeg.on('log', logHandler);
        
        try {
            maDebug.log('[MultiAudio] 🎬 Running ffmpeg -i to probe file...');
            await this.ffmpeg.exec(['-i', inputFileName]);
            maDebug.log('[MultiAudio] ✅ FFmpeg probe complete');
        } catch (error) {
            maDebug.log('[MultiAudio] ℹ️ FFmpeg probe "failed" as expected (this is normal)');
        }
        
        this.ffmpeg.off('log', logHandler);
        
        maDebug.log('[MultiAudio] 📋 FFmpeg output received, parsing...');
        maDebug.log('[MultiAudio] Output length:', ffmpegOutput.length, 'chars');
        
        const lines = ffmpegOutput.split('\n');
        let audioIndex = 0;
        
        maDebug.log('[MultiAudio] 🔎 Parsing', lines.length, 'lines of FFmpeg output...');
        
        for (const line of lines) {
            const streamMatch = line.match(/Stream #\d+:(\d+)(?:\((\w+)\))?: Audio: (\w+)/);
            
            if (streamMatch) {
                const streamIndex = parseInt(streamMatch[1]);
                const language = streamMatch[2] || 'unknown';
                const codec = streamMatch[3] || 'unknown';
                
                tracks.push({
                    index: audioIndex,
                    streamIndex: streamIndex,
                    type: 'audio',
                    label: `Audio Track ${audioIndex + 1}${language !== 'unknown' ? ` (${language})` : ''}`,
                    language: language,
                    codec: codec
                });
                
                maDebug.log(`[MultiAudio] Found audio stream ${audioIndex}: Stream #0:${streamIndex}, ${codec}, ${language}`);
                audioIndex++;
            }
        }
        
        maDebug.log(`[MultiAudio] Total audio streams found: ${tracks.length}`);
        return tracks;
    }

    /**
     * Extract all audio tracks as separate files
     */
async extractAllAudioTracks(inputFileName) {
    this.showStatus('Extracting video...');
    
    await this.ffmpeg.exec([
        '-i', inputFileName, 
        '-map', '0:v:0',
        '-c:v', 'copy',
        '-an',
        'video_only.mp4'
    ]);
    
    const videoData = await this.ffmpeg.readFile('video_only.mp4');
    const videoBlob = new Blob([videoData.buffer], { type: 'video/mp4' });
    this.video.src = this.createTrackedBlobURL(videoBlob);
    
    for (let i = 0; i < this.audioTracks.length; i++) {
        this.showStatus(`Extracting audio ${i + 1}/${this.audioTracks.length}...`);
        
        const audioFileName = `audio_${i}.mp4`;
        const codec = this.audioTracks[i].codec.toLowerCase();
        const browserCompatible = ['aac', 'mp3', 'opus'].includes(codec);
        
        if (browserCompatible) {
            await this.ffmpeg.exec([
                '-i', inputFileName,
                '-map', `0:${this.audioTracks[i].streamIndex}`,
                '-c:a', 'copy',
                '-vn',
                audioFileName
            ]);
        } else {
            await this.ffmpeg.exec([
                '-i', inputFileName,
                '-map', `0:${this.audioTracks[i].streamIndex}`,
                '-c:a', 'aac',
                '-b:a', '192k',
                '-vn',
                audioFileName
            ]);
        }
        
        const audioData = await this.ffmpeg.readFile(audioFileName);
        const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp4' });
        const audioURL = this.createTrackedBlobURL(audioBlob);
        
        const audioElement = new Audio(audioURL);
        audioElement.volume = this.video.volume;
        audioElement.muted = true;
        audioElement.preload = 'auto';
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
            audioElement.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
            audioElement.onerror = () => { clearTimeout(timeout); reject(new Error('Load failed')); };
            audioElement.load();
        });
        
        this.audioElements.push(audioElement);
        await this.ffmpeg.deleteFile(audioFileName);
    }
    
    this.setupAudioSync();
    this.state.tracksExtracted = true;
    this.showStatus('Ready');
}

    /**
     * Extract a single audio track (on-demand with caching)
     */
    async extractSingleAudioTrack(inputFileName, trackIndex) {
        maDebug.log(`[MultiAudio] 🎵 extractSingleAudioTrack called - track ${trackIndex}`);
        
        if (trackIndex < 0 || trackIndex >= this.audioTracks.length) {
            console.error(`[MultiAudio] ❌ Invalid track index: ${trackIndex}`);
            return;
        }

        maDebug.log(`[MultiAudio] 💾 Checking DISK cache for track ${trackIndex}...`);
        const diskCachedFile = await this.checkDiskCache(trackIndex);
        if (diskCachedFile) {
            maDebug.log(`[MultiAudio] ✅ Using disk-cached track ${trackIndex}`);
            
            if (this.audioElements[trackIndex]) {
                this.cleanupAudioElement(this.audioElements[trackIndex]);
            }
            
            const audioURL = this.createTrackedBlobURL(diskCachedFile);
            const audioElement = new Audio(audioURL);
            audioElement.volume = this.video.volume;
            audioElement.muted = true;
            audioElement.preload = 'auto';
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
                audioElement.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
                audioElement.onerror = () => { clearTimeout(timeout); reject(new Error('Load failed')); };
                audioElement.load();
            });
            
            this.audioElements[trackIndex] = audioElement;
            this.setupAudioSync();
            this.showStatus('Ready');
            maDebug.log(`[MultiAudio] ✅ Disk-cached track ${trackIndex} loaded`);
            return;
        }

        maDebug.log(`[MultiAudio] 📦 Checking IndexedDB cache for track ${trackIndex}...`);
        const cacheKey = `${this.videoFileName}_track_${trackIndex}`;
        const cachedTrack = await this.loadCachedTrack(cacheKey);
        
        if (cachedTrack) {
            maDebug.log(`[MultiAudio] ✅ Using IndexedDB-cached track ${trackIndex}`);
            this.audioElements[trackIndex] = cachedTrack.audioElement;
            
            if (trackIndex === 0 && cachedTrack.videoURL) {
                this.video.src = cachedTrack.videoURL;
            }
            
            this.setupAudioSync();
            this.showStatus('Ready');
            maDebug.log(`[MultiAudio] ✅ IndexedDB-cached track ${trackIndex} loaded`);
            return;
        }

        maDebug.log(`[MultiAudio] 🔧 No cache found, extracting track ${trackIndex} with FFmpeg...`);
        this.showStatus(`Extracting ${trackIndex === 0 ? 'video and first audio track' : this.audioTracks[trackIndex].label}...`);
        
        if (!this.video.src || !this.video.src.startsWith('blob:')) {
            const cachedVideo = await this.checkVideoCache();
            
            if (cachedVideo) {
                maDebug.log('[MultiAudio] Using disk-cached video');
                
                if (this.video.src && this.video.src.startsWith('blob:')) {
                    this.revokeBlobURL(this.video.src);
                }
                
                this.video.src = this.createTrackedBlobURL(cachedVideo);
            } else {
                await this.ffmpeg.exec([
                    '-i', inputFileName, 
                    '-map', '0:v:0',
                    '-c:v', 'copy',
                    '-an',
                    'video_only.mp4'
                ]);
                
                const videoData = await this.ffmpeg.readFile('video_only.mp4');
                const videoBlob = new Blob([videoData.buffer], { type: 'video/mp4' });
                
                if (this.video.src && this.video.src.startsWith('blob:')) {
                    this.revokeBlobURL(this.video.src);
                }
                
                this.video.src = this.createTrackedBlobURL(videoBlob);
                
                await this.ffmpeg.deleteFile('video_only.mp4');
                
                await this.saveVideoToDisk(videoBlob);
                
                await this.saveCachedTrack(`${this.videoFileName}_video`, { 
                    audioBlob: videoBlob
                });
            }
        }
        
        const codec = this.audioTracks[trackIndex].codec.toLowerCase();
        
        let audioFileName, outputCodec, outputFormat;
        
        if (codec === 'flac') {
            audioFileName = `audio_${trackIndex}.mka`;
            outputCodec = 'copy';
            outputFormat = 'matroska';
            maDebug.log(`[MultiAudio] FLAC detected - using MKA container with copy (instant)`);
        } else if (['aac', 'mp3', 'opus', 'vorbis'].includes(codec)) {
            audioFileName = `audio_${trackIndex}.mp4`;
            outputCodec = 'copy';
            outputFormat = 'mp4';
            maDebug.log(`[MultiAudio] ${codec.toUpperCase()} detected - copying (instant)`);
        } else {
            audioFileName = `audio_${trackIndex}.mp4`;
            outputCodec = 'aac';
            outputFormat = 'mp4';
            maDebug.log(`[MultiAudio] ${codec.toUpperCase()} detected - transcoding to AAC`);
        }
        
        this.showStatus(`Extracting ${this.audioTracks[trackIndex].label}${outputCodec === 'copy' ? ' (instant copy)' : ' (transcoding)'}...`);
        
        if (outputCodec === 'copy') {
            await this.ffmpeg.exec([
                '-i', inputFileName,
                '-map', `0:${this.audioTracks[trackIndex].streamIndex}`,
                '-c:a', 'copy',
                '-vn',
                '-f', outputFormat,
                audioFileName
            ]);
        } else {
            await this.ffmpeg.exec([
                '-i', inputFileName,
                '-map', `0:${this.audioTracks[trackIndex].streamIndex}`,
                '-c:a', 'aac',
                '-b:a', '192k',
                '-vn',
                '-f', outputFormat,
                audioFileName
            ]);
        }
        
        const audioData = await this.ffmpeg.readFile(audioFileName);
        const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp4' });
        
        if (this.audioElements[trackIndex]) {
            this.cleanupAudioElement(this.audioElements[trackIndex]);
        }
        
        const audioURL = this.createTrackedBlobURL(audioBlob);
        
        const audioElement = new Audio(audioURL);
        audioElement.volume = this.video.volume;
        audioElement.muted = true;
        audioElement.preload = 'auto';
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
            audioElement.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
            audioElement.onerror = () => { clearTimeout(timeout); reject(new Error('Load failed')); };
            audioElement.load();
        });
        
        this.audioElements[trackIndex] = audioElement;
        
        await this.ffmpeg.deleteFile(audioFileName);
        
        await this.saveToDisk(trackIndex, audioBlob);
        
        await this.saveCachedTrack(cacheKey, { 
            audioBlob,
            trackIndex
        });
        
        this.setupAudioSync();
        this.showStatus('Ready');
    }

    /**
     * Extract single track (video + audio)
     */
    async extractSingleTrack(inputFileName) {
        this.showStatus('Processing video...');
        
        try {
        await this.ffmpeg.exec([
            '-i', inputFileName,
            '-map', `0:${this.audioTracks[i].streamIndex}`,
            '-vn',
            '-c:a', 'copy',
            audioFileName
        ]);
            const outputData = await this.ffmpeg.readFile('output.mp4');
            const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
            const outputURL = this.createTrackedBlobURL(outputBlob);
            
            this.video.src = outputURL;
            
            this.state.tracksExtracted = true;
            this.showStatus('Ready');
            
            await this.ffmpeg.deleteFile(inputFileName);
            await this.ffmpeg.deleteFile('output.mp4');
            
        } catch (error) {
            console.error('[MultiAudio] Error processing video:', error);
            this.showError('Failed to process video');
        }
    }

    /**
     * Setup audio synchronization with video
     */
    setupAudioSync() {
        if (this.audioElements.length === 0) return;

        if (this.syncListeners) {
            this.syncListeners.forEach(({ event, handler }) => {
                this.video.removeEventListener(event, handler);
            });
        }
        this.syncListeners = [];

        const playHandler = () => {
            this.audioElements.forEach(audio => {
                if (audio && !audio.muted) {
                    audio.play().catch(e => console.warn('Audio play failed:', e));
                }
            });
        };
        this.video.addEventListener('play', playHandler);
        this.syncListeners.push({ event: 'play', handler: playHandler });

        const pauseHandler = () => {
            this.audioElements.forEach(audio => {
                if (audio) audio.pause();
            });
        };
        this.video.addEventListener('pause', pauseHandler);
        this.syncListeners.push({ event: 'pause', handler: pauseHandler });

        const seekedHandler = () => {
            this.audioElements.forEach(audio => {
                if (audio) {
                    audio.currentTime = this.video.currentTime;
                }
            });
        };
        this.video.addEventListener('seeked', seekedHandler);
        this.syncListeners.push({ event: 'seeked', handler: seekedHandler });

        const volumeHandler = () => {
            this.audioElements.forEach(audio => {
                if (audio) {
                    audio.volume = this.video.volume;
                }
            });
        };
        this.video.addEventListener('volumechange', volumeHandler);
        this.syncListeners.push({ event: 'volumechange', handler: volumeHandler });

        const rateHandler = () => {
            this.audioElements.forEach(audio => {
                if (audio) {
                    audio.playbackRate = this.video.playbackRate;
                }
            });
        };
        this.video.addEventListener('ratechange', rateHandler);
        this.syncListeners.push({ event: 'ratechange', handler: rateHandler });
    }

    /**
     * Switch to a different audio track
     */
    async switchAudioTrack(trackIndex) {
        if (trackIndex < -1 || trackIndex >= this.audioTracks.length) {
            console.warn(`[MultiAudio] Invalid track index: ${trackIndex} (available: -1 to ${this.audioTracks.length - 1})`);
            return;
        }

        if (trackIndex === -1) {
            maDebug.log('[MultiAudio] Disabling all audio tracks');
            
            this.audioElements.forEach((audio) => {
                if (audio) {
                    audio.muted = true;
                    audio.pause();
                }
            });
            
            this.video.muted = false;
            
            this.currentAudioIndex = -1;
            this.state.currentTrack = -1;
            
            maDebug.log('[MultiAudio] All audio tracks disabled - using video native audio');
            this.updateTrackSelectorUI();
            
            window.dispatchEvent(new CustomEvent('audioTrackChanged', {
                detail: { trackIndex: -1, totalTracks: this.audioTracks.length, disabled: true }
            }));
            
            return;
        }

        if (!this.audioElements[trackIndex]) {
            this.showExtractionNotification(`Генерация дорожки ${trackIndex + 1}...`);
            
            try {
                await this.extractSingleAudioTrack(this.inputFileName, trackIndex);
                this.hideExtractionNotification();
            } catch (error) {
                this.hideExtractionNotification();
                console.error('[MultiAudio] Failed to extract track:', error);
                this.showError('Ошибка генерации дорожки');
                return;
            }
        }

        this.video.muted = true;

        this.audioElements.forEach((audio, idx) => {
            if (audio) {
                audio.muted = (idx !== trackIndex);
                if (idx === trackIndex) {
                    audio.currentTime = this.video.currentTime;
                    if (!this.video.paused) {
                        audio.play().catch(e => console.warn('Audio play failed:', e));
                    }
                }
            }
        });

        this.currentAudioIndex = trackIndex;
        this.state.currentTrack = trackIndex;
        
        maDebug.log(`[MultiAudio] Switched to track ${trackIndex + 1} of ${this.audioTracks.length}`);
        
        this.updateTrackSelectorUI();
        
        window.dispatchEvent(new CustomEvent('audioTrackChanged', {
            detail: { trackIndex, totalTracks: this.audioTracks.length }
        }));
    }

    /**
     * Show extraction notification on video player
     */
    showExtractionNotification(message) {
        this.hideExtractionNotification();

        const notification = document.createElement('div');
        notification.id = 'multiAudioNotification';
        notification.style.cssText = `
            position: absolute;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 25;
            pointer-events: none;
        `;
        notification.textContent = message;

        const videoContainer = document.getElementById('videoContainer');
        if (videoContainer) {
            videoContainer.appendChild(notification);
        }
    }

    /**
     * Hide extraction notification
     */
    hideExtractionNotification() {
        const notification = document.getElementById('multiAudioNotification');
        if (notification) {
            notification.remove();
        }
    }

    /**
     * Create UI controls - separate button in player controls with settings-like menu
     */
    createUI() {
        maDebug.log('[MultiAudio] createUI called');
        
        const controlsContainer = document.querySelector('.video-controls');
        if (!controlsContainer) {
            console.warn('[MultiAudio] Controls container not found');
            return;
        }

        const existingBtn = document.getElementById('audioTracksBtn');
        if (existingBtn) {
            maDebug.log('[MultiAudio] Audio button already exists, updating');
            this.updateAudioButton();
            return;
        }

        const audioBtn = document.createElement('button');
        audioBtn.type = 'button';
        audioBtn.id = 'audioTracksBtn';
        audioBtn.className = 'control-btn';
        audioBtn.title = 'Аудио дорожки';
        
        audioBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-audio-waveform-icon lucide-audio-waveform">
                <path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>
            </svg>
        `;
        
        const menu = document.createElement('div');
        menu.id = 'audioTracksMenu';
        menu.className = 'settings-menu';
        
        const mainMenu = document.createElement('div');
        mainMenu.className = 'settings-main-menu';
        mainMenu.id = 'audioTracksMainMenu';
        
        this.updateMenuOptions(mainMenu);
        
        menu.appendChild(mainMenu);

        audioBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isVisible = menu.classList.contains('show');
            
            const settingsMenu = document.getElementById('settingsMenu');
            if (settingsMenu) {
                settingsMenu.classList.remove('show');
            }
            
            if (isVisible) {
                menu.classList.remove('show');
            } else {
                menu.classList.add('show');
            }
        });

        document.addEventListener('click', (e) => {
            if (!audioBtn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });

        const container = document.createElement('div');
        container.className = 'settings-container';
        container.style.cssText = 'position: relative; display: inline-block; z-index: 99999 !important; isolation: isolate;';
        container.appendChild(audioBtn);
        container.appendChild(menu);

        const settingsContainer = controlsContainer.querySelector('.settings-container');
        if (settingsContainer) {
            controlsContainer.insertBefore(container, settingsContainer);
        } else {
            controlsContainer.appendChild(container);
        }

        maDebug.log('[MultiAudio] UI created successfully');
    }

    /**
     * Update menu options (settings-style menu)
     */
    updateMenuOptions(mainMenu) {
        if (!mainMenu) {
            mainMenu = document.getElementById('audioTracksMainMenu');
        }
        if (!mainMenu) return;

        mainMenu.innerHTML = '';

        if (this.audioTracks.length === 0) {
            const noTracks = document.createElement('button');
            noTracks.type = 'button';
            noTracks.className = 'settings-tab';
            noTracks.style.cssText = 'cursor: default; opacity: 0.6;';
            noTracks.innerHTML = `
                <span>Нет дорожек</span>
                <span class="settings-tab-value">—</span>
            `;
            mainMenu.appendChild(noTracks);
            return;
        }

        const disabledOption = document.createElement('button');
        disabledOption.type = 'button';
        disabledOption.className = 'settings-option';
        if (this.currentAudioIndex === -1) {
            disabledOption.classList.add('active');
        }
        disabledOption.textContent = 'Выключено';
        
        disabledOption.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.switchAudioTrack(-1);
            
            const menu = document.getElementById('audioTracksMenu');
            if (menu) {
                menu.classList.remove('show');
            }
        });
        
        mainMenu.appendChild(disabledOption);

        this.audioTracks.forEach((track, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'settings-option';
            if (index === this.currentAudioIndex) {
                option.classList.add('active');
            }
            option.textContent = track.label;
            
            option.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.switchAudioTrack(index);
                
                const menu = document.getElementById('audioTracksMenu');
                if (menu) {
                    menu.classList.remove('show');
                }
            });
            
            mainMenu.appendChild(option);
        });
    }

    /**
     * Update audio button (just refresh menu options)
     */
    updateAudioButton() {
        const audioBtn = document.getElementById('audioTracksBtn');
        if (!audioBtn) return;
        
        const isMKV = this.videoFileName && this.videoFileName.toLowerCase().endsWith('.mkv');
        const container = audioBtn.parentElement;
        
        if (container) {
            if (isMKV && this.audioTracks.length > 0) {
                container.style.display = 'inline-block';
            } else {
                container.style.display = 'none';
            }
        }
        
        if (isMKV) {
            this.updateMenuOptions();
        }
    }

    /**
     * Update track selector UI
     */
    /**
     * Update track selector UI after switching
     */
    updateTrackSelectorUI() {
        this.updateAudioButton();
    }

    /**
     * Show status message
     */
    showStatus(message) {
        maDebug.log(`[MultiAudio] ${message}`);
        
        const statusEl = document.getElementById('multiAudioStatus');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error(`[MultiAudio] ${message}`);
        
        alert(`Multi-Audio Error: ${message}`);
    }

    /**
     * Update progress UI
     */
    updateProgressUI(progress) {
        const progressBar = document.getElementById('multiAudioProgress');
        if (progressBar) {
            progressBar.style.width = `${progress * 100}%`;
        }
    }

    /**
     * Save extracted track to cache (metadata only - blobs stored on disk)
     */
    async saveCachedTrack(cacheKey, data) {
        if (!this.cacheDB) return;
        
        try {
            const transaction = this.cacheDB.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            
            const cacheData = {
                key: cacheKey,
                videoName: this.videoFileName,
                trackIndex: data.trackIndex,
                timestamp: Date.now(),
                hasDiskCache: !!this.tracksDirectoryHandle,
                fileSize: data.audioBlob?.size || 0
            };
            
            await new Promise((resolve, reject) => {
                const request = store.put(cacheData);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            maDebug.log(`[MultiAudio] Cached track metadata: ${cacheKey} (${cacheData.fileSize} bytes)`);
        } catch (error) {
            console.warn('[MultiAudio] Failed to cache track metadata:', error);
        }
    }

    /**
     * Load extracted track from cache (disk only - IndexedDB is metadata only now)
     */
    async loadCachedTrack(cacheKey) {
        if (!this.cacheDB) return null;
        
        try {
            const transaction = this.cacheDB.transaction(['tracks'], 'readonly');
            const store = transaction.objectStore('tracks');
            
            const cacheData = await new Promise((resolve, reject) => {
                const request = store.get(cacheKey);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (!cacheData) return null;
            
            const cacheAge = Date.now() - cacheData.timestamp;
            const maxAge = 7 * 24 * 60 * 60 * 1000;
            
            if (cacheAge > maxAge) {
                maDebug.log(`[MultiAudio] Cache expired for: ${cacheKey}`);
                await this.deleteCachedTrack(cacheKey);
                return null;
            }
            
            maDebug.log(`[MultiAudio] Cache metadata found for: ${cacheKey}, check disk for actual file`);
            return null;
            
        } catch (error) {
            console.warn('[MultiAudio] Failed to load cached track:', error);
            return null;
        }
    }

    /**
     * Delete cached track
     */
    async deleteCachedTrack(cacheKey) {
        if (!this.cacheDB) return;
        
        try {
            const transaction = this.cacheDB.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            
            await new Promise((resolve, reject) => {
                const request = store.delete(cacheKey);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            maDebug.log(`[MultiAudio] Deleted cached track: ${cacheKey}`);
        } catch (error) {
            console.warn('[MultiAudio] Failed to delete cached track:', error);
        }
    }

    /**
     * Clear all cached tracks for current video
     */
    async clearVideoCache() {
        if (!this.cacheDB) return;
        
        try {
            const transaction = this.cacheDB.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            const index = store.index('videoName');
            
            const keys = await new Promise((resolve, reject) => {
                const request = index.getAllKeys(this.videoFileName);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            for (const key of keys) {
                await this.deleteCachedTrack(key);
            }
            
            maDebug.log(`[MultiAudio] Cleared cache for video: ${this.videoFileName}`);
        } catch (error) {
            console.warn('[MultiAudio] Failed to clear video cache:', error);
        }
    }

    /**
     * Cleanup resources
     */
    async destroy() {
        maDebug.log('[MultiAudio] Starting complete cleanup...');
        
        this.audioElements.forEach(audio => {
            this.cleanupAudioElement(audio);
        });
        this.audioElements = [];
        
        if (this.video.src && this.video.src.startsWith('blob:')) {
            this.revokeBlobURL(this.video.src);
            this.video.src = '';
        }
        
        this.revokeAllBlobURLs();
        
        await this.cleanupTempFiles();
        await this.cleanupFFmpegFS();
        
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        
        if (this.syncListeners) {
            this.syncListeners.forEach(({ event, handler }) => {
                this.video.removeEventListener(event, handler);
            });
            this.syncListeners = [];
        }

        if (this.uiContainer) {
            this.uiContainer.remove();
        }

        this.audioTracks = [];
        this.cachedTracks.clear();
        
        maDebug.log('[MultiAudio] Complete cleanup finished');
    }
}

if (typeof window !== 'undefined') {
    window.MultiAudioTrackManager = MultiAudioTrackManager;
    maDebug.log('[MultiAudio] MultiAudioTrackManager class loaded and attached to window');
}
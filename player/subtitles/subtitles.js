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
 * Subtitle Track Module for Video Player
 * Supports:
 * - MKV embedded subtitles (ASS/SRT/VTT)
 * - External subtitle files (ASS/SRT/VTT)
 * - ASS styling and positioning
 * Uses FFmpeg.wasm for MKV subtitle extraction
 */

const SUBTITLES_DEBUG = false;
const subDebug = {
    log: (...args) => { if (SUBTITLES_DEBUG) console.log('[Subtitles]', ...args); },
    warn: (...args) => { if (SUBTITLES_DEBUG) console.warn('[Subtitles]', ...args); },
    error: (...args) => { console.error('[Subtitles]', ...args); }
};

subDebug.log('Loading subtitles.js script...');

class SubtitleTrackManager {
    constructor(videoElement) {
        subDebug.log('Constructor called with video element:', videoElement);
        this.video = videoElement;
        this.ffmpeg = null;
        this.subtitleTracks = [];
        this.currentSubtitleIndex = -1;
        this.isProcessing = false;
        this.videoFileName = '';
        this.subsDirectoryHandle = null;
        
        this.subtitleContainer = null;
        this.currentSubtitles = [];
        this.assStyles = {};
        this.assInfo = {};
        this.displayedSubtitles = new Set();
        this.animationFrame = null;
        
        this.state = {
            loaded: false,
            tracksExtracted: false,
            totalTracks: 0
        };
        
        this.uiContainer = null;
        
        this.init();
    }

    async init() {
        this.createSubtitleContainer();
        
        if (typeof i18n !== 'undefined' && i18n.subscribe) {
            i18n.subscribe(() => {
                const btn = document.getElementById('subtitleTracksBtn');
                if (btn) {
                    btn.title = i18n.t('player.subtitlesKey', 'Subtitles (C)');
                }
                this.updateMenuOptions();
            });
        }
        
        if (window.multiAudioManager && window.multiAudioManager.ffmpeg) {
            this.ffmpeg = window.multiAudioManager.ffmpeg;
            this.state.loaded = true;
            subDebug.log('Using shared FFmpeg instance from multi-audio');
        } else {
            await this.loadFFmpeg();
        }
    }


    /**
     * Create subtitle display container
     */
    createSubtitleContainer() {
        const videoContainer = this.video.closest('.video-container') || 
                               this.video.closest('.video-player') ||
                               this.video.parentElement;
        
        if (!videoContainer) {
            subDebug.warn('Video container not found');
            return;
        }

        let container = videoContainer.querySelector('.subtitle-container');
        if (container) {
            this.subtitleContainer = container;
        } else {
            container = document.createElement('div');
            container.className = 'subtitle-container';
            
            videoContainer.appendChild(container);
            this.subtitleContainer = container;
            
            subDebug.log('Subtitle container created');
        }
        
        this.setupControlsObserver();
        this.setupResizeObserver();
    }

    /**
     * Watch for video controls show/hide to move subtitles
     */
    setupControlsObserver() {
        if (this.controlsObserver) return;
        
        const videoContainer = this.video.closest('.video-container');
        if (!videoContainer) return;
        
        const controls = videoContainer.querySelector('.video-controls');
        if (!controls) return;
        
        this.updateSubtitlePosition(controls);
        
        this.controlsObserver = new MutationObserver(() => {
            this.updateSubtitlePosition(controls);
        });
        
        this.controlsObserver.observe(controls, { 
            attributes: true, 
            attributeFilter: ['class'] 
        });
    }

    /**
     * Setup resize observer to rescale subtitles on size change
     */
    setupResizeObserver() {
        if (this.resizeObserver) return;
        
        const videoContainer = this.video.closest('.video-container');
        if (!videoContainer) return;
        
        let resizeTimeout = null;
        let lastWidth = videoContainer.clientWidth;
        let lastHeight = videoContainer.clientHeight;
        
        this.resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            
            const newWidth = entry.contentRect.width;
            const newHeight = entry.contentRect.height;
            
            if (Math.abs(newWidth - lastWidth) > 5 || Math.abs(newHeight - lastHeight) > 5) {
                lastWidth = newWidth;
                lastHeight = newHeight;
                
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    subDebug.log('Resize detected, redrawing...');
                    this.redrawSubtitles();
                }, 100);
            }
        });
        
        this.resizeObserver.observe(videoContainer);
        
        this.fullscreenHandler = () => {
            setTimeout(() => {
                subDebug.log('Fullscreen change, redrawing...');
                this.redrawSubtitles();
            }, 200);
        };
        document.addEventListener('fullscreenchange', this.fullscreenHandler);
        document.addEventListener('webkitfullscreenchange', this.fullscreenHandler);
        
        if (!this.bodyObserver) {
            let lastBodyClass = document.body.className;
            let bodyDebounce = null;
            
            this.bodyObserver = new MutationObserver((mutations) => {
                const newClass = document.body.className;
                if (newClass === lastBodyClass) return;
                
                const relevantClasses = ['cinema', 'fullscreen', 'theater', 'expanded'];
                const oldHas = relevantClasses.some(c => lastBodyClass.includes(c));
                const newHas = relevantClasses.some(c => newClass.includes(c));
                
                lastBodyClass = newClass;
                
                if (oldHas !== newHas) {
                    if (bodyDebounce) clearTimeout(bodyDebounce);
                    bodyDebounce = setTimeout(() => {
                        subDebug.log('Body mode change, redrawing...');
                        this.redrawSubtitles();
                    }, 200);
                }
            });
            
            this.bodyObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        if (!this.containerObserver) {
            let lastContainerClass = videoContainer.className;
            let containerDebounce = null;
            
            this.containerObserver = new MutationObserver((mutations) => {
                const newClass = videoContainer.className;
                if (newClass === lastContainerClass) return;
                
                const relevantClasses = ['fullscreen', 'theater', 'expanded', 'cinema', 'pip'];
                const oldHas = relevantClasses.some(c => lastContainerClass.includes(c));
                const newHas = relevantClasses.some(c => newClass.includes(c));
                
                lastContainerClass = newClass;
                
                if (oldHas !== newHas) {
                    if (containerDebounce) clearTimeout(containerDebounce);
                    containerDebounce = setTimeout(() => {
                        subDebug.log('Container mode change, redrawing...');
                        this.redrawSubtitles();
                    }, 200);
                }
            });
            
            this.containerObserver.observe(videoContainer, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
        
        subDebug.log('Resize observer setup complete');
    }

    /**
     * Redraw current subtitles (for resize/mode changes)
     */
    redrawSubtitles() {
        if (this.currentSubtitleIndex === -1 || !this.subtitleContainer) return;
        if (this.currentSubtitles.length === 0) return;
        
        this.displayedSubtitles.clear();
        this.subtitleContainer.innerHTML = '';
        
        const currentTime = this.video.currentTime;
        const activeSubtitles = [];
        
        for (let i = 0; i < this.currentSubtitles.length; i++) {
            const sub = this.currentSubtitles[i];
            if (currentTime >= sub.start && currentTime <= sub.end) {
                activeSubtitles.push({ ...sub, index: i });
            }
        }
        
        activeSubtitles.sort((a, b) => a.layer - b.layer);
        
        for (const sub of activeSubtitles) {
            this.displayedSubtitles.add(sub.index);
            this.renderSubtitle(sub);
        }
    }

    /**
     * Update subtitle container position based on controls visibility
     */
    updateSubtitlePosition(controls) {
        if (!this.subtitleContainer || !controls) return;
        
        const isHidden = controls.classList.contains('autohide');
        
        if (isHidden) {
            this.subtitleContainer.classList.remove('controls-visible');
        } else {
            this.subtitleContainer.classList.add('controls-visible');
        }
    }

    /**
     * Load FFmpeg for subtitle extraction — uses shared singleton
     */
    async loadFFmpeg() {
        try {
            if (!window._sharedFFmpeg) {
                subDebug.warn('Shared FFmpeg loader not available, MKV subtitle extraction disabled');
                return;
            }

            this.ffmpeg = await window._sharedFFmpeg.get();

            this.ffmpeg.on('log', ({ type, message }) => {
                if (type === 'stderr' && message.includes('Stream')) {
                    subDebug.log(`[FFmpeg]`, message);
                }
            });

            this.state.loaded = true;
            subDebug.log('FFmpeg loaded successfully via shared singleton');

        } catch (error) {
            console.error('[Subtitles] Failed to load FFmpeg:', error);
        }
    }

    /**
     * Analyze subtitle tracks in MKV file
     */
    async analyzeSubtitleTracks(file) {
        const cachedTracks = await this.checkCachedSubtitles();
        if (cachedTracks.length > 0) {
            subDebug.log(`Found ${cachedTracks.length} cached subtitle(s), skipping FFmpeg analysis`);
            for (const cached of cachedTracks) {
                this.subtitleTracks.push(cached);
            }
            this.state.totalTracks = this.subtitleTracks.length;
            
            await this.loadCachedFonts();
            
            this.createUI();
            return;
        }

        if (!this.state.loaded || !this.ffmpeg) {
            subDebug.warn('FFmpeg not loaded');
            return;
        }

        this.isProcessing = true;
        subDebug.log('Analyzing subtitle tracks with FFmpeg...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            try {
                await this.ffmpeg.deleteFile('input_sub.mkv');
            } catch (e) {}
            
            await this.ffmpeg.writeFile('input_sub.mkv', uint8Array);
            
            const { subtitles, fonts } = await this.detectStreamsAndFonts('input_sub.mkv');
            
            if (fonts.length > 0) {
                await this.extractAndLoadFonts(fonts);
                subDebug.log('Loaded fonts:', Array.from(this.loadedFonts?.keys() || []));
            }
            
            for (const track of subtitles) {
                this.subtitleTracks.push(track);
            }
            
            this.state.totalTracks = this.subtitleTracks.length;
            
            if (this.subtitleTracks.length > 0) {
                subDebug.log(`Found ${this.subtitleTracks.length} subtitle track(s)`);
                this.createUI();
            } else {
                subDebug.log('No subtitle tracks found in MKV');
            }

        } catch (error) {
            console.error('[Subtitles] Error analyzing tracks:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Detect subtitle streams and font attachments in file
     */
    async detectStreamsAndFonts(inputFileName) {
        const subtitles = [];
        const fonts = [];
        let ffmpegOutput = '';
        
        const logHandler = ({ type, message }) => {
            if (type === 'stderr') {
                ffmpegOutput += message + '\n';
            }
        };
        
        this.ffmpeg.on('log', logHandler);
        
        try {
            await this.ffmpeg.exec(['-i', inputFileName]);
        } catch (e) {
        }
        
        this.ffmpeg.off('log', logHandler);
        
        const lines = ffmpegOutput.split('\n');
        let subIndex = 0;
        let attachmentIndex = 0;
        
        for (const line of lines) {
            const streamMatch = line.match(/Stream #\d+:(\d+)(?:\((\w+)\))?: Subtitle: (\w+)/i);
            
            if (streamMatch) {
                const streamIndex = parseInt(streamMatch[1]);
                const language = streamMatch[2] || 'unknown';
                const codec = streamMatch[3] || 'unknown';
                
                subtitles.push({
                    index: subIndex,
                    streamIndex: streamIndex,
                    type: 'subtitle',
                    label: `${typeof i18n !== 'undefined' ? i18n.t('player.subtitles', 'Subtitles') : 'Subtitles'} ${subIndex + 1}${language !== 'unknown' ? ` (${language.toUpperCase()})` : ''}`,
                    language: language,
                    codec: codec.toLowerCase(),
                    source: 'mkv'
                });
                
                subDebug.log(`Found subtitle stream ${subIndex}: Stream #0:${streamIndex}, ${codec}, ${language}`);
                subIndex++;
            }
            
            const attachMatch = line.match(/Stream #\d+:(\d+).*Attachment:\s*(\w+)/i);
            if (attachMatch) {
                attachmentIndex = parseInt(attachMatch[1]);
            }
            
            const filenameMatch = line.match(/filename\s*:\s*(.+\.(?:ttf|otf|ttc|woff|woff2))/i);
            if (filenameMatch) {
                fonts.push({
                    streamIndex: attachmentIndex,
                    filename: filenameMatch[1].trim()
                });
                subDebug.log(`Found font attachment: ${filenameMatch[1].trim()}`);
            }
        }
        
        return { subtitles, fonts };
    }

    /**
     * Extract fonts from MKV and load them
     */
    async extractAndLoadFonts(fonts) {
        subDebug.log(`Extracting ${fonts.length} fonts...`);
        
        this.loadedFonts = this.loadedFonts || new Map();
        
        for (const font of fonts) {
            try {
                const outputFile = font.filename;
                
                try {
                    await this.ffmpeg.exec([
                        '-dump_attachment:t', '',
                        '-i', 'input_sub.mkv',
                        '-y'
                    ]);
                } catch (e) {
                }
                
                let fontData;
                try {
                    fontData = await this.ffmpeg.readFile(outputFile);
                } catch (e) {
                    subDebug.warn(`Could not read font file: ${outputFile}`);
                    continue;
                }
                
                if (fontData && fontData.length > 0) {
                    const fontBlob = new Blob([fontData.buffer], { type: 'font/ttf' });
                    const fontUrl = URL.createObjectURL(fontBlob);
                    
                    const fontFamily = await this.getFontFamilyName(fontData, font.filename);
                    
                    try {
                        const fontFace = new FontFace(fontFamily, `url(${fontUrl})`);
                        await fontFace.load();
                        document.fonts.add(fontFace);
                        
                        this.loadedFonts.set(fontFamily.toLowerCase(), fontFamily);
                        this.loadedFonts.set(font.filename.toLowerCase(), fontFamily);
                        
                        subDebug.log(`Loaded font: "${fontFamily}" from ${font.filename}`);
                        
                        await this.saveFontToCache(font.filename, fontData, fontFamily);
                    } catch (e) {
                        subDebug.warn(`Failed to load font ${fontFamily}:`, e);
                    }
                    
                    try {
                        await this.ffmpeg.deleteFile(outputFile);
                    } catch (e) {}
                }
            } catch (error) {
                subDebug.warn(`Failed to extract font ${font.filename}:`, error);
            }
        }
    }

    /**
     * Get font family name from font file data
     */
    async getFontFamilyName(fontData, filename) {
        try {
            const view = new DataView(fontData.buffer);
            
            const signature = view.getUint32(0);
            if (signature !== 0x00010000 && signature !== 0x4F54544F) {
                return filename.replace(/\.[^.]+$/, '');
            }
            
            const numTables = view.getUint16(4);
            let nameTableOffset = 0;
            
            for (let i = 0; i < numTables; i++) {
                const tableOffset = 12 + i * 16;
                const tag = String.fromCharCode(
                    view.getUint8(tableOffset),
                    view.getUint8(tableOffset + 1),
                    view.getUint8(tableOffset + 2),
                    view.getUint8(tableOffset + 3)
                );
                
                if (tag === 'name') {
                    nameTableOffset = view.getUint32(tableOffset + 8);
                    break;
                }
            }
            
            if (nameTableOffset === 0) {
                return filename.replace(/\.[^.]+$/, '');
            }
            
            const nameCount = view.getUint16(nameTableOffset + 2);
            const stringOffset = nameTableOffset + view.getUint16(nameTableOffset + 4);
            
            for (let i = 0; i < nameCount; i++) {
                const recordOffset = nameTableOffset + 6 + i * 12;
                const platformID = view.getUint16(recordOffset);
                const nameID = view.getUint16(recordOffset + 6);
                const length = view.getUint16(recordOffset + 8);
                const offset = view.getUint16(recordOffset + 10);
                
                if (nameID === 1 || nameID === 4) {
                    const nameStart = stringOffset + offset;
                    let name = '';
                    
                    if (platformID === 3) {
                        for (let j = 0; j < length; j += 2) {
                            const charCode = view.getUint16(nameStart + j);
                            if (charCode > 0) name += String.fromCharCode(charCode);
                        }
                    } else {
                        for (let j = 0; j < length; j++) {
                            const charCode = view.getUint8(nameStart + j);
                            if (charCode > 0) name += String.fromCharCode(charCode);
                        }
                    }
                    
                    if (name && name.length > 0) {
                        return name;
                    }
                }
            }
        } catch (e) {
            subDebug.warn('Error parsing font name:', e);
        }
        
        return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }

    /**
     * Save font to .subs cache folder
     */
    async saveFontToCache(filename, data, fontFamily) {
        if (!this.subsDirectoryHandle) return;
        
        try {
            const fileHandle = await this.subsDirectoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            
            try {
                let mappings = {};
                try {
                    const mapHandle = await this.subsDirectoryHandle.getFileHandle('_fontmap.json');
                    const mapFile = await mapHandle.getFile();
                    mappings = JSON.parse(await mapFile.text());
                } catch (e) {}
                
                mappings[filename] = fontFamily;
                
                const mapHandle = await this.subsDirectoryHandle.getFileHandle('_fontmap.json', { create: true });
                const mapWritable = await mapHandle.createWritable();
                await mapWritable.write(JSON.stringify(mappings));
                await mapWritable.close();
            } catch (e) {}
            
            subDebug.log(`Cached font: ${filename} -> ${fontFamily}`);
        } catch (e) {
            subDebug.warn(`Failed to cache font: ${filename}`, e);
        }
    }

    /**
     * Load fonts from .subs cache folder
     */
    async loadCachedFonts() {
        if (!this.subsDirectoryHandle) return;
        
        this.loadedFonts = this.loadedFonts || new Map();
        
        let fontMappings = {};
        try {
            const mapHandle = await this.subsDirectoryHandle.getFileHandle('_fontmap.json');
            const mapFile = await mapHandle.getFile();
            fontMappings = JSON.parse(await mapFile.text());
        } catch (e) {}
        
        try {
            for await (const entry of this.subsDirectoryHandle.values()) {
                if (entry.kind !== 'file') continue;
                
                const filename = entry.name;
                if (!filename.toLowerCase().match(/\.(ttf|otf|ttc|woff|woff2)$/)) continue;
                
                try {
                    const file = await entry.getFile();
                    const fontUrl = URL.createObjectURL(file);
                    
                    let fontFamily = fontMappings[filename];
                    if (!fontFamily) {
                        const data = new Uint8Array(await file.arrayBuffer());
                        fontFamily = await this.getFontFamilyName(data, filename);
                    }
                    
                    const fontFace = new FontFace(fontFamily, `url(${fontUrl})`);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                    
                    this.loadedFonts.set(fontFamily.toLowerCase(), fontFamily);
                    this.loadedFonts.set(filename.toLowerCase(), fontFamily);
                    
                    subDebug.log(`Loaded cached font: "${fontFamily}"`);
                } catch (e) {
                    subDebug.warn(`Failed to load cached font: ${entry.name}`, e);
                }
            }
        } catch (e) {
            subDebug.warn('Error loading cached fonts:', e);
        }
    }

    /**
     * Check for cached subtitle files in .subs folder
     */
    async checkCachedSubtitles() {
        const tracks = [];
        if (!this.subsDirectoryHandle) return tracks;
        
        const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
        
        try {
            for await (const entry of this.subsDirectoryHandle.values()) {
                if (entry.kind !== 'file') continue;
                
                const fileName = entry.name;
                if (!fileName.startsWith(baseName + '_track')) continue;
                
                const trackMatch = fileName.match(/_track(\d+)\.(ass|srt)$/i);
                if (!trackMatch) continue;
                
                const trackIndex = parseInt(trackMatch[1]);
                const ext = trackMatch[2].toLowerCase();
                
                const file = await entry.getFile();
                
                tracks.push({
                    index: trackIndex,
                    streamIndex: trackIndex,
                    type: 'subtitle',
                    label: `${typeof i18n !== 'undefined' ? i18n.t('player.subtitles', 'Subtitles') : 'Subtitles'} ${trackIndex + 1} (${typeof i18n !== 'undefined' ? i18n.t('player.cached', 'cached') : 'cached'})`,
                    language: 'unknown',
                    codec: ext === 'ass' ? 'ass' : 'srt',
                    source: 'cached',
                    file: file,
                    fileName: fileName
                });
                
                subDebug.log(`Found cached subtitle: ${fileName}`);
            }
        } catch (e) {
            subDebug.warn('Error reading cached subtitles:', e);
        }
        
        tracks.sort((a, b) => a.index - b.index);
        return tracks;
    }


    /**
     * Check for external subtitle files in the same directory
     */
    async checkExternalSubtitles(dirHandle, videoName) {
        if (!dirHandle) return;
        
        const baseName = videoName.replace(/\.[^/.]+$/, '');
        const subtitleExtensions = ['.ass', '.srt', '.vtt', '.ssa'];
        
        try {
            for await (const entry of dirHandle.values()) {
                if (entry.kind !== 'file') continue;
                
                const fileName = entry.name.toLowerCase();
                const isSubtitle = subtitleExtensions.some(ext => fileName.endsWith(ext));
                
                if (!isSubtitle) continue;
                
                const subBaseName = entry.name.replace(/\.[^/.]+$/, '').toLowerCase();
                const videoBaseLower = baseName.toLowerCase();
                
                if (subBaseName === videoBaseLower || 
                    subBaseName.startsWith(videoBaseLower + '.') ||
                    subBaseName.startsWith(videoBaseLower + '_') ||
                    subBaseName.startsWith(videoBaseLower + '-')) {
                    
                    let language = 'unknown';
                    const langMatch = entry.name.match(/[._-]([a-z]{2,3})\.[^.]+$/i);
                    if (langMatch) {
                        language = langMatch[1].toLowerCase();
                    }
                    
                    const ext = entry.name.split('.').pop().toLowerCase();
                    const codec = ext === 'ssa' ? 'ass' : ext;
                    
                    const file = await entry.getFile();
                    
                    this.subtitleTracks.push({
                        index: this.subtitleTracks.length,
                        streamIndex: -1,
                        type: 'subtitle',
                        label: `${entry.name}${language !== 'unknown' ? ` (${language.toUpperCase()})` : ''}`,
                        language: language,
                        codec: codec,
                        source: 'external',
                        file: file,
                        fileName: entry.name
                    });
                    
                    subDebug.log(`Found external subtitle: ${entry.name}`);
                }
            }
            
            this.state.totalTracks = this.subtitleTracks.length;
            
            if (this.subtitleTracks.length > 0) {
                this.createUI();
            }
            
        } catch (error) {
            subDebug.warn('Error checking external subtitles:', error);
        }
    }

    /**
     * Initialize .subs directory for caching
     */
    async initSubsDirectory(dirHandle) {
        if (!dirHandle) return null;
        
        try {
            this.subsDirectoryHandle = await dirHandle.getDirectoryHandle('.subs', { create: true });
            subDebug.log('Subs cache directory initialized (.subs/)');
            return this.subsDirectoryHandle;
        } catch (e) {
            subDebug.warn('Cannot create .subs/ directory:', e);
            return null;
        }
    }

    /**
     * Get cached subtitle file name
     */
    getCachedSubFileName(trackIndex) {
        const track = this.subtitleTracks[trackIndex];
        if (!track) return null;
        
        const baseName = this.videoFileName.replace(/\.[^/.]+$/, '');
        const ext = track.codec === 'ass' || track.codec === 'ssa' ? 'ass' : 'srt';
        return `${baseName}_track${trackIndex}.${ext}`;
    }

    /**
     * Check if subtitle is cached on disk
     */
    async checkSubtitleCache(trackIndex) {
        if (!this.subsDirectoryHandle) return null;
        
        const fileName = this.getCachedSubFileName(trackIndex);
        if (!fileName) return null;
        
        try {
            const fileHandle = await this.subsDirectoryHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const text = await file.text();
            subDebug.log(`Loaded cached subtitle: ${fileName}`);
            return text;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save subtitle to disk cache
     */
    async saveSubtitleToCache(trackIndex, text) {
        if (!this.subsDirectoryHandle) return false;
        
        const fileName = this.getCachedSubFileName(trackIndex);
        if (!fileName) return false;
        
        try {
            const fileHandle = await this.subsDirectoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(text);
            await writable.close();
            subDebug.log(`Saved subtitle to cache: ${fileName}`);
            return true;
        } catch (e) {
            subDebug.warn('Failed to save subtitle to cache:', e);
            return false;
        }
    }

    /**
     * Extract subtitle track from MKV (with caching)
     */
    async extractSubtitleTrack(trackIndex) {
        const track = this.subtitleTracks[trackIndex];
        if (!track) return null;
        
        if ((track.source === 'external' || track.source === 'cached') && track.file) {
            const text = await track.file.text();
            return text;
        }
        
        const cached = await this.checkSubtitleCache(trackIndex);
        if (cached) {
            return cached;
        }
        
        if (!this.ffmpeg || !this.state.loaded) {
            subDebug.warn('FFmpeg not available for extraction');
            return null;
        }
        
        subDebug.log(`Extracting track ${trackIndex}...`);
        
        try {
            const outputExt = track.codec === 'ass' || track.codec === 'ssa' ? 'ass' : 'srt';
            const outputFile = `subtitle_${trackIndex}.${outputExt}`;
            
            await this.ffmpeg.exec([
                '-i', 'input_sub.mkv',
                '-map', `0:${track.streamIndex}`,
                '-c:s', track.codec === 'ass' || track.codec === 'ssa' ? 'copy' : 'srt',
                outputFile
            ]);
            
            const data = await this.ffmpeg.readFile(outputFile);
            const text = new TextDecoder().decode(data);
            
            await this.ffmpeg.deleteFile(outputFile);
            
            await this.saveSubtitleToCache(trackIndex, text);
            
            subDebug.log(`Extracted ${text.length} bytes`);
            return text;
            
        } catch (error) {
            console.error(`[Subtitles] Failed to extract track ${trackIndex}:`, error);
            return null;
        }
    }

    /**
     * Switch to a subtitle track
     */
    async switchSubtitleTrack(trackIndex) {
        subDebug.log(`Switching to track ${trackIndex}`);
        
        this.stopSubtitleDisplay();
        this.clearSubtitles();
        
        if (trackIndex === -1) {
            this.currentSubtitleIndex = -1;
            this.updateUI();
            return;
        }
        
        const track = this.subtitleTracks[trackIndex];
        if (!track) {
            subDebug.warn(`Track ${trackIndex} not found`);
            return;
        }
        
        const subtitleText = await this.extractSubtitleTrack(trackIndex);
        if (!subtitleText) {
            subDebug.warn('Failed to load subtitle content');
            return;
        }
        
        if (track.codec === 'ass' || track.codec === 'ssa') {
            this.parseASS(subtitleText);
        } else {
            this.parseSRT(subtitleText);
        }
        
        this.currentSubtitleIndex = trackIndex;
        this.startSubtitleDisplay();
        this.updateUI();
        
        subDebug.log(`Now showing: ${track.label}`);
    }


    /**
     * Parse ASS/SSA subtitle format
     */
    parseASS(text) {
        this.currentSubtitles = [];
        this.assStyles = {};
        this.assInfo = {};
        
        const lines = text.split(/\r?\n/);
        let section = '';
        let formatFields = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                section = trimmed.slice(1, -1).toLowerCase();
                continue;
            }
            
            if (section === 'script info') {
                const match = trimmed.match(/^([^:]+):\s*(.*)$/);
                if (match) {
                    this.assInfo[match[1].toLowerCase()] = match[2];
                }
                continue;
            }
            
            if (section === 'v4+ styles' || section === 'v4 styles') {
                if (trimmed.startsWith('Format:')) {
                    formatFields = trimmed.substring(7).split(',').map(f => f.trim().toLowerCase());
                } else if (trimmed.startsWith('Style:')) {
                    const values = this.parseASSLine(trimmed.substring(6), formatFields.length);
                    const style = {};
                    formatFields.forEach((field, i) => {
                        style[field] = values[i] || '';
                    });
                    if (style.name) {
                        this.assStyles[style.name] = style;
                    }
                }
                continue;
            }
            
            if (section === 'events') {
                if (trimmed.startsWith('Format:')) {
                    formatFields = trimmed.substring(7).split(',').map(f => f.trim().toLowerCase());
                } else if (trimmed.startsWith('Dialogue:')) {
                    const values = this.parseASSLine(trimmed.substring(9), formatFields.length);
                    const event = {};
                    formatFields.forEach((field, i) => {
                        event[field] = values[i] || '';
                    });
                    
                    const start = this.parseASSTime(event.start);
                    const end = this.parseASSTime(event.end);
                    
                    if (!isNaN(start) && !isNaN(end)) {
                        this.currentSubtitles.push({
                            start: start,
                            end: end,
                            text: event.text || '',
                            style: event.style || 'Default',
                            layer: parseInt(event.layer) || 0,
                            marginL: parseInt(event.marginl) || 0,
                            marginR: parseInt(event.marginr) || 0,
                            marginV: parseInt(event.marginv) || 0,
                            effect: event.effect || ''
                        });
                    }
                }
            }
        }
        
        this.currentSubtitles.sort((a, b) => a.start - b.start);
        
        subDebug.log(`Parsed ${this.currentSubtitles.length} ASS events, ${Object.keys(this.assStyles).length} styles`);
    }

    /**
     * Parse ASS line respecting commas in text field
     */
    parseASSLine(line, fieldCount) {
        const values = [];
        let current = '';
        let count = 0;
        
        for (let i = 0; i < line.length; i++) {
            if (line[i] === ',' && count < fieldCount - 1) {
                values.push(current.trim());
                current = '';
                count++;
            } else {
                current += line[i];
            }
        }
        values.push(current.trim());
        
        return values;
    }

    /**
     * Parse ASS timestamp (h:mm:ss.cc)
     */
    parseASSTime(timeStr) {
        if (!timeStr) return NaN;
        const match = timeStr.match(/(\d+):(\d+):(\d+)\.(\d+)/);
        if (!match) return NaN;
        
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const centiseconds = parseInt(match[4]);
        
        return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    }

    /**
     * Parse SRT subtitle format
     */
    parseSRT(text) {
        this.currentSubtitles = [];
        this.assStyles = {};
        
        this.assStyles['Default'] = {
            name: 'Default',
            fontname: 'Arial',
            fontsize: '48',
            primarycolour: '&H00FFFFFF',
            outlinecolour: '&H00000000',
            outline: '2',
            shadow: '1',
            alignment: '2',
            marginl: '20',
            marginr: '20',
            marginv: '20'
        };
        
        const blocks = text.split(/\r?\n\r?\n/);
        
        for (const block of blocks) {
            const lines = block.trim().split(/\r?\n/);
            if (lines.length < 2) continue;
            
            let timingLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('-->')) {
                    timingLine = i;
                    break;
                }
            }
            
            if (timingLine === -1) continue;
            
            const timing = lines[timingLine].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
            if (!timing) continue;
            
            const start = parseInt(timing[1]) * 3600 + parseInt(timing[2]) * 60 + parseInt(timing[3]) + parseInt(timing[4]) / 1000;
            const end = parseInt(timing[5]) * 3600 + parseInt(timing[6]) * 60 + parseInt(timing[7]) + parseInt(timing[8]) / 1000;
            
            const textLines = lines.slice(timingLine + 1);
            const text = textLines.join('\n');
            
            if (text) {
                this.currentSubtitles.push({
                    start: start,
                    end: end,
                    text: text,
                    style: 'Default',
                    layer: 0
                });
            }
        }
        
        this.currentSubtitles.sort((a, b) => a.start - b.start);
        subDebug.log(`Parsed ${this.currentSubtitles.length} SRT events`);
    }


    /**
     * Start subtitle display loop
     */
    startSubtitleDisplay() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        const update = () => {
            this.updateSubtitleDisplay();
            this.animationFrame = requestAnimationFrame(update);
        };
        
        this.animationFrame = requestAnimationFrame(update);
    }

    /**
     * Stop subtitle display loop
     */
    stopSubtitleDisplay() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Update subtitle display based on current video time
     */
    updateSubtitleDisplay() {
        if (!this.subtitleContainer || this.currentSubtitleIndex === -1) return;
        
        const currentTime = this.video.currentTime;
        const activeSubtitles = [];
        
        for (let i = 0; i < this.currentSubtitles.length; i++) {
            const sub = this.currentSubtitles[i];
            if (currentTime >= sub.start && currentTime <= sub.end) {
                activeSubtitles.push({ ...sub, index: i });
            }
        }
        
        const activeIndices = new Set(activeSubtitles.map(s => s.index));
        const needsUpdate = activeIndices.size !== this.displayedSubtitles.size ||
                           [...activeIndices].some(i => !this.displayedSubtitles.has(i));
        
        if (!needsUpdate) return;
        
        this.subtitleContainer.innerHTML = '';
        this.displayedSubtitles = activeIndices;
        
        activeSubtitles.sort((a, b) => a.layer - b.layer);
        
        for (const sub of activeSubtitles) {
            this.renderSubtitle(sub);
        }
    }

    /**
     * Render a single subtitle
     */
    renderSubtitle(sub) {
        const style = this.assStyles[sub.style] || this.assStyles['Default'] || {};
        
        const element = document.createElement('div');
        element.className = 'subtitle-line';
        
        this.currentSubPos = null;
        this.currentSubAlign = null;
        this.currentSubRotation = null;
        this.currentSubScale = null;
        this.currentSubFontSize = null;
        
        const html = this.renderASSText(sub.text, style);
        element.innerHTML = html;
        
        this.applySubtitlePosition(element, style, sub);
        
        this.subtitleContainer.appendChild(element);
    }

    /**
     * Render ASS text with inline tags
     */
    renderASSText(text, baseStyle) {
        this.currentSubPos = null;
        this.currentSubAlign = null;
        this.currentSubRotation = null;
        this.currentSubScale = null;
        
        let result = text.replace(/\\N/g, '<br>').replace(/\\n/g, '<br>');
        
        result = result.replace(/\{([^}]+)\}/g, (match, tags) => {
            let spanStyle = '';
            let spanOpen = false;
            
            const posMatch = tags.match(/\\pos\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i);
            if (posMatch) {
                this.currentSubPos = {
                    x: parseFloat(posMatch[1]),
                    y: parseFloat(posMatch[2])
                };
            }
            
            const anMatch = tags.match(/\\an(\d)/);
            if (anMatch) {
                this.currentSubAlign = parseInt(anMatch[1]);
            }
            
            const aMatch = tags.match(/\\a(\d+)/);
            if (aMatch && !anMatch) {
                const oldAlign = parseInt(aMatch[1]);
                if (oldAlign <= 3) this.currentSubAlign = oldAlign;
                else if (oldAlign <= 7) this.currentSubAlign = oldAlign + 2;
                else if (oldAlign <= 11) this.currentSubAlign = oldAlign - 5;
            }
            
            const frzMatch = tags.match(/\\frz?\s*(-?[\d.]+)/);
            if (frzMatch) {
                this.currentSubRotation = parseFloat(frzMatch[1]);
            }
            
            const fscxMatch = tags.match(/\\fscx\s*([\d.]+)/);
            const fscyMatch = tags.match(/\\fscy\s*([\d.]+)/);
            if (fscxMatch || fscyMatch) {
                this.currentSubScale = {
                    x: fscxMatch ? parseFloat(fscxMatch[1]) / 100 : 1,
                    y: fscyMatch ? parseFloat(fscyMatch[1]) / 100 : 1
                };
            }
            
            const tagMatches = tags.match(/\\[a-zA-Z0-9]+[^\\]*/g) || [];
            
            for (const tag of tagMatches) {
                if (tag.match(/\\b(\d+)/)) {
                    const bMatch = tag.match(/\\b(\d+)/);
                    const weight = parseInt(bMatch[1]);
                    if (weight === 0) {
                        spanStyle += 'font-weight:normal;';
                    } else if (weight === 1) {
                        spanStyle += 'font-weight:bold;';
                    } else {
                        spanStyle += `font-weight:${weight};`;
                    }
                    spanOpen = true;
                }
                else if (tag.startsWith('\\i1')) {
                    spanStyle += 'font-style:italic;';
                    spanOpen = true;
                } else if (tag.startsWith('\\i0')) {
                    spanStyle += 'font-style:normal;';
                    spanOpen = true;
                }
                else if (tag.startsWith('\\u1')) {
                    spanStyle += 'text-decoration:underline;';
                    spanOpen = true;
                }
                else if (tag.startsWith('\\s1')) {
                    spanStyle += 'text-decoration:line-through;';
                    spanOpen = true;
                }
                else if (tag.match(/\\1?c&H([0-9A-Fa-f]+)&?/)) {
                    const colorMatch = tag.match(/\\1?c&H([0-9A-Fa-f]+)&?/);
                    if (colorMatch) {
                        const color = this.assColorToCSS(colorMatch[1]);
                        spanStyle += `color:${color};`;
                        spanOpen = true;
                    }
                }
                else if (tag.match(/\\fs([\d.]+)/)) {
                    const sizeMatch = tag.match(/\\fs([\d.]+)/);
                    if (sizeMatch) {
                        this.currentSubFontSize = parseFloat(sizeMatch[1]);
                    }
                }
                else if (tag.match(/\\fn([^\\}]+)/)) {
                    const fontMatch = tag.match(/\\fn([^\\}]+)/);
                    if (fontMatch) {
                        spanStyle += `font-family:"${fontMatch[1].trim()}",sans-serif;`;
                        spanOpen = true;
                    }
                }
            }
            
            if (spanOpen && spanStyle) {
                return `<span style="${spanStyle}">`;
            }
            return '';
        });
        
        const openSpans = (result.match(/<span/g) || []).length;
        const closeSpans = (result.match(/<\/span>/g) || []).length;
        for (let i = 0; i < openSpans - closeSpans; i++) {
            result += '</span>';
        }
        
        return result;
    }

    /**
     * Convert ASS color to CSS
     */
    assColorToCSS(assColor) {
        let color = assColor.replace(/&H/gi, '').replace(/&/g, '');
        
        while (color.length < 6) color = '0' + color;
        
        let b, g, r, a = 255;
        
        if (color.length >= 8) {
            a = 255 - parseInt(color.substring(0, 2), 16);
            b = parseInt(color.substring(2, 4), 16);
            g = parseInt(color.substring(4, 6), 16);
            r = parseInt(color.substring(6, 8), 16);
        } else {
            b = parseInt(color.substring(0, 2), 16);
            g = parseInt(color.substring(2, 4), 16);
            r = parseInt(color.substring(4, 6), 16);
        }
        
        if (a < 255) {
            return `rgba(${r},${g},${b},${(a/255).toFixed(2)})`;
        }
        return `rgb(${r},${g},${b})`;
    }

    /**
     * Apply subtitle positioning based on ASS style
     */
    applySubtitlePosition(element, style, sub) {
        const containerRect = this.subtitleContainer.getBoundingClientRect();
        
        const containerWidth = containerRect.width || this.video.clientWidth || 640;
        const containerHeight = containerRect.height || this.video.clientHeight || 360;
        
        const playResY = parseInt(this.assInfo.playresy) || 288;
        const playResX = parseInt(this.assInfo.playresx) || 384;
        
        const scaleX = containerWidth / playResX;
        const scaleY = containerHeight / playResY;
        const scaleFactor = Math.min(scaleX, scaleY);
        
        if (!this._scaleLogged) {
            subDebug.log(`Scale: container=${containerWidth}x${containerHeight}, playRes=${playResX}x${playResY}, factor=${scaleFactor.toFixed(2)}`);
            this._scaleLogged = true;
        }
        
        const baseFontSize = this.currentSubFontSize || parseInt(style.fontsize) || 20;
        const fontSize = Math.max(10, Math.round(baseFontSize * scaleFactor * 0.75));
        
        const primaryColor = style.primarycolour ? this.assColorToCSS(style.primarycolour) : '#ffffff';
        const outlineColor = style.outlinecolour ? this.assColorToCSS(style.outlinecolour) : '#000000';
        const outlineBase = parseFloat(style.outline) || 2;
        const outline = Math.max(1, Math.min(3, Math.round(outlineBase * scaleFactor * 0.4)));
        
        let fontName = style.fontname || 'Arial';
        
        if (this.loadedFonts && this.loadedFonts.has(fontName.toLowerCase())) {
            fontName = this.loadedFonts.get(fontName.toLowerCase());
        }
        
        element.style.cssText = `
            position: absolute;
            font-family: "${fontName}", "Segoe UI", Arial, sans-serif;
            font-size: ${fontSize}px;
            color: ${primaryColor};
            text-shadow: 
                ${outline}px 0 0 ${outlineColor},
                -${outline}px 0 0 ${outlineColor},
                0 ${outline}px 0 ${outlineColor},
                0 -${outline}px 0 ${outlineColor};
            white-space: pre-wrap;
            line-height: 1.2;
            padding: 1px 4px;
        `;
        
        if (style.bold === '-1' || style.bold === '1') {
            element.style.fontWeight = 'bold';
        }
        if (style.italic === '-1' || style.italic === '1') {
            element.style.fontStyle = 'italic';
        }
        
        let transforms = [];
        
        if (this.currentSubPos) {
            const posX = this.currentSubPos.x * scaleX;
            const posY = this.currentSubPos.y * scaleY;
            
            const alignment = this.currentSubAlign || parseInt(style.alignment) || 2;
            const row = Math.ceil(alignment / 3);
            const col = ((alignment - 1) % 3) + 1;
            
            element.style.left = `${posX}px`;
            element.style.top = `${posY}px`;
            
            if (col === 1) {
                element.style.textAlign = 'left';
            } else if (col === 2) {
                transforms.push('translateX(-50%)');
                element.style.textAlign = 'center';
            } else {
                transforms.push('translateX(-100%)');
                element.style.textAlign = 'right';
            }
            
            if (row === 1) {
                transforms.push('translateY(-100%)');
            } else if (row === 2) {
                transforms.push('translateY(-50%)');
            }
            
        } else {
            const alignment = this.currentSubAlign || parseInt(style.alignment) || 2;
            
            const marginL = Math.round((sub.marginL || parseInt(style.marginl) || 10) * scaleFactor * 0.5);
            const marginR = Math.round((sub.marginR || parseInt(style.marginr) || 10) * scaleFactor * 0.5);
            const marginV = Math.round((sub.marginV || parseInt(style.marginv) || 15) * scaleFactor * 0.5);
            
            element.style.maxWidth = `calc(100% - ${marginL + marginR + 20}px)`;
            
            const row = Math.ceil(alignment / 3);
            const col = ((alignment - 1) % 3) + 1;
            
            if (row === 1) {
                element.style.bottom = `${Math.max(5, marginV)}px`;
            } else if (row === 2) {
                element.style.top = '50%';
                transforms.push('translateY(-50%)');
            } else {
                element.style.top = `${marginV}px`;
            }
            
            if (col === 1) {
                element.style.left = `${marginL}px`;
                element.style.textAlign = 'left';
            } else if (col === 2) {
                element.style.left = '50%';
                transforms.push('translateX(-50%)');
                element.style.textAlign = 'center';
            } else {
                element.style.right = `${marginR}px`;
                element.style.textAlign = 'right';
            }
        }
        
        if (this.currentSubRotation !== null) {
            transforms.push(`rotate(${-this.currentSubRotation}deg)`);
        }
        
        if (this.currentSubScale) {
            transforms.push(`scale(${this.currentSubScale.x}, ${this.currentSubScale.y})`);
        }
        
        if (transforms.length > 0) {
            element.style.transform = transforms.join(' ');
        }
    }

    /**
     * Clear all displayed subtitles
     */
    clearSubtitles() {
        if (this.subtitleContainer) {
            this.subtitleContainer.innerHTML = '';
        }
        this.displayedSubtitles.clear();
        this.currentSubtitles = [];
        this.assStyles = {};
    }


    /**
     * Create UI controls
     */
    createUI() {
        subDebug.log('createUI called');
        
        const controlsContainer = document.querySelector('.video-controls');
        if (!controlsContainer) {
            subDebug.warn('Controls container not found');
            return;
        }

        const existingBtn = document.getElementById('subtitleTracksBtn');
        if (existingBtn) {
            subDebug.log('Subtitle button already exists, updating');
            this.updateUI();
            return;
        }

        const subtitleBtn = document.createElement('button');
        subtitleBtn.type = 'button';
        subtitleBtn.id = 'subtitleTracksBtn';
        subtitleBtn.className = 'control-btn';
        subtitleBtn.title = typeof i18n !== 'undefined' ? i18n.t('player.subtitlesKey', 'Subtitles (C)') : 'Subtitles (C)';
        subtitleBtn.setAttribute('data-i18n-title', 'player.subtitlesKey');
        
        subtitleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M7 8h4"/>
                <path d="M13 8h4"/>
                <path d="M7 12h2"/>
                <path d="M11 12h6"/>
                <path d="M7 16h10"/>
            </svg>
        `;
        
        const menu = document.createElement('div');
        menu.id = 'subtitleTracksMenu';
        menu.className = 'settings-menu';
        
        const mainMenu = document.createElement('div');
        mainMenu.className = 'settings-main-menu';
        mainMenu.id = 'subtitleTracksMainMenu';
        
        this.updateMenuOptions(mainMenu);
        menu.appendChild(mainMenu);

        subtitleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const settingsMenu = document.getElementById('settingsMenu');
            const audioMenu = document.getElementById('audioTracksMenu');
            if (settingsMenu) settingsMenu.classList.remove('show');
            if (audioMenu) audioMenu.classList.remove('show');
            
            menu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!subtitleBtn.contains(e.target) && !menu.contains(e.target)) {
                menu.classList.remove('show');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (this.currentSubtitleIndex === -1 && this.subtitleTracks.length > 0) {
                    this.switchSubtitleTrack(0);
                } else {
                    this.switchSubtitleTrack(-1);
                }
            }
        });

        const container = document.createElement('div');
        container.className = 'settings-container';
        container.id = 'subtitleTracksContainer';
        container.style.cssText = 'position: relative; display: inline-block; z-index: 99999 !important; isolation: isolate;';
        container.appendChild(subtitleBtn);
        container.appendChild(menu);

        const audioContainer = document.getElementById('audioTracksBtn')?.parentElement;
        const settingsContainer = controlsContainer.querySelector('.settings-container');
        
        if (audioContainer) {
            controlsContainer.insertBefore(container, audioContainer);
        } else if (settingsContainer) {
            controlsContainer.insertBefore(container, settingsContainer);
        } else {
            controlsContainer.appendChild(container);
        }

        subDebug.log('UI created successfully');
    }

    /**
     * Update menu options
     */
    updateMenuOptions(mainMenu) {
        if (!mainMenu) {
            mainMenu = document.getElementById('subtitleTracksMainMenu');
        }
        if (!mainMenu) return;

        mainMenu.innerHTML = '';

        const offOption = document.createElement('button');
        offOption.type = 'button';
        offOption.className = 'settings-option';
        if (this.currentSubtitleIndex === -1) {
            offOption.classList.add('active');
        }
        offOption.textContent = typeof i18n !== 'undefined' ? i18n.t('playerSettings.off', 'Off') : 'Off';
        
        offOption.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.switchSubtitleTrack(-1);
            document.getElementById('subtitleTracksMenu')?.classList.remove('show');
        });
        
        mainMenu.appendChild(offOption);

        this.subtitleTracks.forEach((track, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'settings-option';
            if (index === this.currentSubtitleIndex) {
                option.classList.add('active');
            }
            
            const fileLabel = typeof i18n !== 'undefined' ? i18n.t('player.file', 'File') : 'File';
            const sourceLabel = track.source === 'external' ? `[${fileLabel}] ` : '[MKV] ';
            option.textContent = sourceLabel + track.label;
            
            option.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.switchSubtitleTrack(index);
                document.getElementById('subtitleTracksMenu')?.classList.remove('show');
            });
            
            mainMenu.appendChild(option);
        });

        const separator = document.createElement('div');
        separator.className = 'settings-sub-separator';
        separator.style.cssText = 'height: 1px; background: rgba(255,255,255,0.1); margin: 4px 0;';
        mainMenu.appendChild(separator);

        const loadOption = document.createElement('button');
        loadOption.type = 'button';
        loadOption.className = 'settings-option';
        loadOption.textContent = typeof i18n !== 'undefined' ? i18n.t('player.loadFile', 'Load file...') : 'Load file...';
        
        loadOption.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.openSubtitleFilePicker();
            document.getElementById('subtitleTracksMenu')?.classList.remove('show');
        });
        
        mainMenu.appendChild(loadOption);
    }

    /**
     * Open file picker for subtitle files
     */
    async openSubtitleFilePicker() {
        try {
            if (window.showOpenFilePicker) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'Subtitle Files',
                        accept: {
                            'text/plain': ['.srt', '.ass', '.ssa', '.vtt']
                        }
                    }],
                    multiple: false
                });
                
                const file = await fileHandle.getFile();
                await this.loadSubtitleFile(file);
                
                const newIndex = this.subtitleTracks.length - 1;
                await this.switchSubtitleTrack(newIndex);
            } else {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.srt,.ass,.ssa,.vtt';
                
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        await this.loadSubtitleFile(file);
                        const newIndex = this.subtitleTracks.length - 1;
                        await this.switchSubtitleTrack(newIndex);
                    }
                };
                
                input.click();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('[Subtitles] Error loading file:', error);
            }
        }
    }

    /**
     * Update UI state
     */
    updateUI() {
        const container = document.getElementById('subtitleTracksContainer');
        if (!container) return;
        
        container.style.display = 'inline-block';
        
        this.updateMenuOptions();
        
        const btn = document.getElementById('subtitleTracksBtn');
        if (btn) {
            if (this.currentSubtitleIndex >= 0) {
                btn.style.color = '#ff69b4';
            } else {
                btn.style.color = '';
            }
        }
    }

    /**
     * Load subtitle file manually
     */
    async loadSubtitleFile(file) {
        const fileName = file.name.toLowerCase();
        let codec = 'srt';
        
        if (fileName.endsWith('.ass') || fileName.endsWith('.ssa')) {
            codec = 'ass';
        } else if (fileName.endsWith('.vtt')) {
            codec = 'vtt';
        }
        
        let language = 'unknown';
        const langMatch = file.name.match(/[._-]([a-z]{2,3})\.[^.]+$/i);
        if (langMatch) {
            language = langMatch[1].toLowerCase();
        }
        
        this.subtitleTracks.push({
            index: this.subtitleTracks.length,
            streamIndex: -1,
            type: 'subtitle',
            label: `${file.name}${language !== 'unknown' ? ` (${language.toUpperCase()})` : ''}`,
            language: language,
            codec: codec,
            source: 'external',
            file: file,
            fileName: file.name
        });
        
        this.state.totalTracks = this.subtitleTracks.length;
        this.createUI();
        this.updateUI();
        
        subDebug.log(`Loaded external subtitle: ${file.name}`);
    }

    /**
     * Reset for new video
     */
    reset() {
        this.stopSubtitleDisplay();
        this.clearSubtitles();
        this.subtitleTracks = [];
        this.currentSubtitleIndex = -1;
        this.state.totalTracks = 0;
        this.state.tracksExtracted = false;
        this.videoFileName = '';
        
        this.updateMenuOptions();
        
        const btn = document.getElementById('subtitleTracksBtn');
        if (btn) {
            btn.style.color = '';
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stopSubtitleDisplay();
        this.clearSubtitles();
        
        if (this.controlsObserver) {
            this.controlsObserver.disconnect();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.bodyObserver) {
            this.bodyObserver.disconnect();
        }
        
        const container = document.getElementById('subtitleTracksContainer');
        if (container) {
            container.remove();
        }
        
        if (this.subtitleContainer) {
            this.subtitleContainer.remove();
        }
    }
}

window.SubtitleTrackManager = SubtitleTrackManager;
subDebug.log('SubtitleTrackManager class defined');
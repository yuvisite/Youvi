/**
 * Video ID System for Youvi
 * Converts long filenames to short IDs: yv + 8 alphanumeric chars
 * Example: "GTA III — Head Radio.webm" → "yv1a2b3c4d"
 */

const VIDEO_ID_DEBUG = false;

(function(global) {
    'use strict';

    const CHARSET = '0123456789abcdefghijklmnopqrstuvwxyz';
    const ID_PREFIX = 'yv';
    const ID_LENGTH = 8;

    let idToName = {};
    let nameToId = {};
    let indexLoaded = false;
    let indexPromise = null;

    /**
     * Generate deterministic hash from string
     */
    function hashString(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }

    /**
     * Convert number to base36 string of fixed length
     */
    function toBase36(num, length) {
        let result = '';
        num = Math.abs(num);
        while (result.length < length) {
            result = CHARSET[num % 36] + result;
            num = Math.floor(num / 36);
        }
        return result.slice(0, length);
    }

    /**
     * Generate video ID from filename
     * @param {string} filename - Video filename
     * @returns {string} - ID like "yv1a2b3c4d"
     */
    function generateId(filename) {
        if (!filename) return null;
        const hash = hashString(filename);
        return ID_PREFIX + toBase36(hash, ID_LENGTH);
    }

    /**
     * Check if string is a valid video ID
     */
    function isVideoId(str) {
        if (!str || typeof str !== 'string') return false;
        return str.startsWith(ID_PREFIX) && str.length === ID_PREFIX.length + ID_LENGTH;
    }

    /**
     * Register a video (filename → id mapping)
     * Handles collisions by appending suffix
     */
    function register(filename) {
        if (!filename) return null;
        
        if (nameToId[filename]) {
            const existingId = nameToId[filename];
            // Ensure bidirectional mapping is consistent (repair if idToName is missing)
            if (!idToName[existingId] || idToName[existingId] !== filename) {
                idToName[existingId] = filename;
            }
            return existingId;
        }

        let id = generateId(filename);
        let suffix = 0;

        while (idToName[id] && idToName[id] !== filename) {
            suffix++;
            id = generateId(filename + suffix);
        }

        idToName[id] = filename;
        nameToId[filename] = id;
        return id;
    }

    /**
     * Get filename by ID
     */
    function getFilename(id) {
        return idToName[id] || null;
    }

    /**
     * Get ID by filename
     */
    function getId(filename) {
        return nameToId[filename] || null;
    }

    /**
     * Register multiple videos at once
     */
    function registerAll(filenames) {
        if (!Array.isArray(filenames)) return;
        filenames.forEach(register);
    }

    /**
     * Build video URL with ID
     * @param {string} filename - Video filename
     * @param {string} [playlistId] - Optional playlist ID
     * @returns {string} - URL like "youvi_video.html?v=yv1a2b3c4d&playlist=..."
     */
    function buildVideoUrl(filename, playlistId) {
        const id = register(filename);
        let url = `youvi_video.html?v=${id}`;
        if (playlistId) {
            url += `&playlist=${encodeURIComponent(playlistId)}`;
        }
        return url;
    }

    /**
     * Parse video ID or name from URL
     * Supports both ?v=yvXXXXXXXX and ?name=filename (backward compat)
     * @returns {string|null} - Filename
     */
    function parseVideoFromUrl(urlString) {
        const url = new URL(urlString || window.location.href, window.location.origin);
        const params = url.searchParams;
        
        const videoId = params.get('v');
        if (videoId && isVideoId(videoId)) {
            return getFilename(videoId);
        }
        
        const name = params.get('name');
        if (name) {
            register(name);
            return name;
        }
        
        return null;
    }

    /**
     * Save index to file system (.metadata/video-index.json)
     */
    async function saveIndex(dirHandle) {
        if (!dirHandle) return false;
        try {
            const metaDir = await dirHandle.getDirectoryHandle('.metadata', { create: true });
            const fileHandle = await metaDir.getFileHandle('video-index.json', { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify({ idToName, nameToId }, null, 2));
            await writable.close();
            if (VIDEO_ID_DEBUG) console.log('[VideoID] Index saved:', Object.keys(idToName).length, 'videos');
            return true;
        } catch (e) {
            console.error('[VideoID] Failed to save index:', e);
            return false;
        }
    }

    /**
     * Load index from file system
     */
    async function loadIndex(dirHandle) {
        if (!dirHandle) return false;
        if (indexLoaded) return true;
        
        if (indexPromise) return indexPromise;
        
        indexPromise = (async () => {
            try {
                const metaDir = await dirHandle.getDirectoryHandle('.metadata', { create: false });
                const fileHandle = await metaDir.getFileHandle('video-index.json');
                const file = await fileHandle.getFile();
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (data.idToName) idToName = { ...idToName, ...data.idToName };
                if (data.nameToId) nameToId = { ...nameToId, ...data.nameToId };
                
                // Auto-repair inconsistent bidirectional mappings
                let repaired = 0;
                for (const name in nameToId) {
                    const id = nameToId[name];
                    if (!idToName[id] || idToName[id] !== name) {
                        idToName[id] = name;
                        repaired++;
                    }
                }
                if (repaired > 0) {
                    console.warn(`[VideoID] Repaired ${repaired} inconsistent mappings in index`);
                }
                
                indexLoaded = true;
                console.log('[VideoID] Index loaded:', Object.keys(idToName).length, 'videos');
                return true;
            } catch (e) {
                console.warn('[VideoID] Failed to load index:', e.message || e);
                return false;
            } finally {
                indexPromise = null;
            }
        })();
        
        return indexPromise;
    }

    /**
     * Get all registered mappings (for debugging)
     */
    function getAll() {
        return { idToName: { ...idToName }, nameToId: { ...nameToId } };
    }

    /**
     * Clear all mappings
     */
    function clear() {
        idToName = {};
        nameToId = {};
        indexLoaded = false;
    }

    const VideoID = {
        generateId,
        isVideoId,
        register,
        registerAll,
        getFilename,
        getId,
        buildVideoUrl,
        parseVideoFromUrl,
        saveIndex,
        loadIndex,
        getAll,
        clear,
        ID_PREFIX,
        ID_LENGTH
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = VideoID;
    } else {
        global.VideoID = VideoID;
    }

})(typeof window !== 'undefined' ? window : this);
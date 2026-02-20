// FileSystem Access API wrapper for Blognote with IndexedDB persistence
class BlognoteFS {
    constructor() {
        this.directoryHandle = null;
        this.dbName = 'blognote-db';
        this.storeName = 'folder-handles';
        this.init();
    }

    async init() {
        console.log('[BlognoteFS] Initializing...');
        await this.loadSavedHandle();
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => {
                console.error('[BlognoteFS] IndexedDB error:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                console.log('[BlognoteFS] IndexedDB opened');
                resolve(request.result);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('[BlognoteFS] Creating IndexedDB store');
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async saveHandle() {
        if (!this.directoryHandle) {
            console.warn('[BlognoteFS] No handle to save');
            return;
        }

        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            await new Promise((resolve, reject) => {
                const request = store.put(this.directoryHandle, 'current-folder');
                request.onsuccess = () => {
                    console.log('[BlognoteFS] Handle saved to IndexedDB');
                    resolve();
                };
                request.onerror = () => {
                    console.error('[BlognoteFS] Error saving handle:', request.error);
                    reject(request.error);
                };
            });
            
            db.close();
        } catch (err) {
            console.error('[BlognoteFS] Error in saveHandle:', err);
        }
    }

    async loadSavedHandle() {
        try {
            const db = await this.openDB();
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const handle = await new Promise((resolve, reject) => {
                const request = store.get('current-folder');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            db.close();
            
            if (handle) {
                console.log('[BlognoteFS] Found saved handle');
                // Verify we still have permission
                const permission = await handle.queryPermission({ mode: 'readwrite' });
                console.log('[BlognoteFS] Permission status:', permission);
                
                if (permission === 'granted') {
                    this.directoryHandle = handle;
                    console.log('[BlognoteFS] Handle restored successfully');
                } else if (permission === 'prompt') {
                    const newPermission = await handle.requestPermission({ mode: 'readwrite' });
                    if (newPermission === 'granted') {
                        this.directoryHandle = handle;
                        console.log('[BlognoteFS] Permission granted, handle restored');
                    } else {
                        console.warn('[BlognoteFS] Permission denied');
                    }
                }
            } else {
                console.log('[BlognoteFS] No saved handle found');
            }
        } catch (err) {
            console.error('[BlognoteFS] Error loading saved handle:', err);
        }
    }

    async selectFolder() {
        try {
            console.log('[BlognoteFS] Opening folder picker...');
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            console.log('[BlognoteFS] Folder selected:', this.directoryHandle.name);
            await this.saveHandle();
            return true;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[BlognoteFS] Folder selection cancelled');
            } else {
                console.error('[BlognoteFS] Error selecting folder:', err);
            }
            return false;
        }
    }

    async readJSON(filename) {
        if (!this.directoryHandle) {
            console.error('[BlognoteFS] No directory selected');
            throw new Error('No directory selected');
        }

        try {
            console.log(`[BlognoteFS] Reading ${filename}...`);
            const fileHandle = await this.directoryHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            console.log(`[BlognoteFS] Read ${filename} successfully, items:`, Array.isArray(data) ? data.length : 'object');
            return data;
        } catch (err) {
            if (err.name === 'NotFoundError') {
                console.log(`[BlognoteFS] File ${filename} not found, returning empty array`);
                return [];
            }
            console.error(`[BlognoteFS] Error reading ${filename}:`, err);
            return null;
        }
    }

    async writeJSON(filename, data) {
        if (!this.directoryHandle) {
            console.error('[BlognoteFS] No directory selected');
            throw new Error('No directory selected');
        }

        try {
            console.log(`[BlognoteFS] Writing ${filename}...`);
            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();
            console.log(`[BlognoteFS] Wrote ${filename} successfully`);
            return true;
        } catch (err) {
            console.error(`[BlognoteFS] Error writing ${filename}:`, err);
            return false;
        }
    }

    async listFiles(extension = '.json') {
        if (!this.directoryHandle) {
            console.warn('[BlognoteFS] No directory selected for listing');
            return [];
        }

        const files = [];
        try {
            console.log('[BlognoteFS] Listing files...');
            for await (const entry of this.directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith(extension)) {
                    files.push(entry.name);
                }
            }
            console.log('[BlognoteFS] Found files:', files);
        } catch (err) {
            console.error('[BlognoteFS] Error listing files:', err);
        }
        return files;
    }

    hasFolder() {
        const has = this.directoryHandle !== null;
        console.log('[BlognoteFS] hasFolder:', has);
        return has;
    }

    async ensureFolder(folderName) {
        if (!this.directoryHandle) {
            throw new Error('No directory selected');
        }

        try {
            console.log(`[BlognoteFS] Ensuring folder exists: ${folderName}`);
            
            // Split path and create folders recursively
            const parts = folderName.split('/');
            let currentHandle = this.directoryHandle;
            
            for (const part of parts) {
                if (part) {
                    currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
                }
            }
            
            console.log(`[BlognoteFS] Folder ${folderName} ready`);
            return true;
        } catch (err) {
            console.error(`[BlognoteFS] Error creating folder ${folderName}:`, err);
            throw err;
        }
    }

    async writeFile(filepath, data) {
        if (!this.directoryHandle) {
            throw new Error('No directory selected');
        }

        try {
            console.log(`[BlognoteFS] Writing file: ${filepath}`);
            
            // Handle nested paths (e.g., "avatars/file.jpg")
            const parts = filepath.split('/');
            let currentHandle = this.directoryHandle;
            
            // Navigate through folders
            for (let i = 0; i < parts.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
            }
            
            // Write the file
            const fileName = parts[parts.length - 1];
            const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            
            console.log(`[BlognoteFS] File written successfully: ${filepath}`);
            return true;
        } catch (err) {
            console.error(`[BlognoteFS] Error writing file ${filepath}:`, err);
            throw err;
        }
    }

    async readFile(filepath) {
        if (!this.directoryHandle) {
            throw new Error('No directory selected');
        }

        try {
            console.log(`[BlognoteFS] Reading file: ${filepath}`);
            
            // Handle nested paths
            const parts = filepath.split('/');
            let currentHandle = this.directoryHandle;
            
            // Navigate through folders
            for (let i = 0; i < parts.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
            }
            
            // Read the file
            const fileName = parts[parts.length - 1];
            const fileHandle = await currentHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            
            console.log(`[BlognoteFS] File read successfully: ${filepath}`);
            return file;
        } catch (err) {
            console.error(`[BlognoteFS] Error reading file ${filepath}:`, err);
            throw err;
        }
    }
}

// Global instance
window.blognoteFS = new BlognoteFS();

// Theme toggle functionality
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            console.log('[Theme] Toggling theme');
            const isDark = document.documentElement.classList.toggle('dark-theme');
            localStorage.setItem('blognote-theme', isDark ? 'dark' : 'light');
            console.log('[Theme] Theme set to:', isDark ? 'dark' : 'light');
        });
    }
    
    // Listen for theme changes from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'blognote-theme' && e.newValue) {
            console.log('[Theme] Theme changed in another tab:', e.newValue);
            if (e.newValue === 'dark') {
                document.documentElement.classList.add('dark-theme');
            } else {
                document.documentElement.classList.remove('dark-theme');
            }
        }
    });
}

// Folder selection
function initFolderSelection() {
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            console.log('[FolderSelection] Button clicked');
            const success = await window.blognoteFS.selectFolder();
            console.log('[FolderSelection] Selection result:', success);
            if (success) {
                console.log('[FolderSelection] Reloading page...');
                window.location.reload();
            }
        });
    }
}

// Initialize common functionality
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] Page loaded, initializing...');
    initTheme();
    
    // Wait for BlognoteFS to initialize
    setTimeout(() => {
        console.log('[Init] BlognoteFS initialized, hasFolder:', window.blognoteFS.hasFolder());
    }, 100);
});

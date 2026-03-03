/**
 * GIFs Loader - Load GIFs from .gif subfolder in video directory
 */

'use strict';

const supportsFS = 'showDirectoryPicker' in window;
let videoDirectoryHandle = null;
let allGifs = [];

// Open IndexedDB (same as index.html)
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('8SiteDB', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('handles')) {
                db.createObjectStore('handles');
            }
            if (!db.objectStoreNames.contains('videos')) {
                db.createObjectStore('videos', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('playlists')) {
                db.createObjectStore('playlists', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ===== METADATA MANAGEMENT =====

// Read JSON file from directory
async function readJSONFile(dirHandle, fileName, defaultValue = null) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (e) {
        return defaultValue;
    }
}

// Write JSON file to directory
async function writeJSONFile(dirHandle, fileName, data) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        return true;
    } catch (e) {
        console.error('Error writing JSON file:', e);
        return false;
    }
}

// Get GIF metadata
async function getGifMetadata(gifFolderHandle, gifName) {
    try {
        const metaDir = await gifFolderHandle.getDirectoryHandle('.metadata', { create: true });
        const metaFileName = gifName + '.meta.json';
        const metadata = await readJSONFile(metaDir, metaFileName, {
            tags: [],
            description: '',
            created: Date.now(),
            views: 0,
            likes: 0,
            dislikes: 0
        });
        return metadata;
    } catch (e) {
        console.error('Error getting GIF metadata:', e);
        return { tags: [], description: '', created: Date.now(), views: 0, likes: 0, dislikes: 0 };
    }
}

// Save GIF metadata
async function saveGifMetadata(gifFolderHandle, gifName, metadata) {
    try {
        const existingMeta = await getGifMetadata(gifFolderHandle, gifName);
        const safeMeta = {
            ...existingMeta,
            ...metadata,
            created: existingMeta.created || metadata.created || Date.now(),
            updated: Date.now()
        };
        
        const metaDir = await gifFolderHandle.getDirectoryHandle('.metadata', { create: true });
        const metaFileName = gifName + '.meta.json';
        await writeJSONFile(metaDir, metaFileName, safeMeta);
        return true;
    } catch (e) {
        console.error('Error saving GIF metadata:', e);
        return false;
    }
}

// Get GIF relations (parent/child)
async function getGifRelations(gifFolderHandle, gifName) {
    try {
        const metaDir = await gifFolderHandle.getDirectoryHandle('.metadata', { create: true });
        const fileName = gifName + '.relations.json';
        const relations = await readJSONFile(metaDir, fileName, {
            parents: [],
            children: []
        });
        return relations;
    } catch (e) {
        console.error('Error getting GIF relations:', e);
        return { parents: [], children: [] };
    }
}

// Save GIF relations
async function saveGifRelations(gifFolderHandle, gifName, relations) {
    try {
        const metaDir = await gifFolderHandle.getDirectoryHandle('.metadata', { create: true });
        const fileName = gifName + '.relations.json';
        const data = {
            parents: relations.parents || [],
            children: relations.children || [],
            updated: Date.now()
        };
        await writeJSONFile(metaDir, fileName, data);
        return true;
    } catch (e) {
        console.error('Error saving GIF relations:', e);
        return false;
    }
}

// Make functions globally available
window.getGifMetadata = getGifMetadata;
window.saveGifMetadata = saveGifMetadata;
window.getGifRelations = getGifRelations;
window.saveGifRelations = saveGifRelations;

// Load video directory handle from DB
async function loadVideoHandle() {
    const db = await openDB();
    const tx = db.transaction('handles', 'readonly');
    const handle = await new Promise((resolve) => {
        const request = tx.objectStore('handles').get('videoDirectoryHandle');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
    
    // Verify we have permission
    if (handle) {
        try {
            const permission = await handle.queryPermission({ mode: 'read' });
            if (permission !== 'granted') {
                const newPermission = await handle.requestPermission({ mode: 'read' });
                if (newPermission !== 'granted') {
                    return null;
                }
            }
        } catch (e) {
            console.error('Permission error:', e);
            return null;
        }
    }
    
    return handle;
}

// Scan .gif subfolder for GIF files
async function scanGifDirectory(videoHandle) {
    const gifs = [];
    
    if (!videoHandle || typeof videoHandle.getDirectoryHandle !== 'function') {
        console.error('Invalid directory handle');
        return [];
    }
    
    try {
        // Look for .gif subfolder
        const gifFolderHandle = await videoHandle.getDirectoryHandle('.gif', { create: false });
        
        if (!gifFolderHandle) {
            console.log('No .gif folder found');
            return [];
        }
        
        for await (const entry of gifFolderHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.gif')) {
                try {
                    const file = await entry.getFile();
                    gifs.push({
                        name: entry.name,
                        file: file,
                        url: URL.createObjectURL(file),
                        size: file.size,
                        modified: file.lastModified
                    });
                } catch (fileError) {
                    console.warn('Could not load GIF file:', entry.name, fileError);
                }
            }
        }
    } catch (e) {
        console.error('Error scanning .gif folder:', e);
        return [];
    }
    
    return gifs.sort((a, b) => a.name.localeCompare(b.name));
}

// Load all GIFs
async function loadGifs() {
    const gifsGrid = document.getElementById('gifsGrid');
    
    if (!gifsGrid) {
        return; // Not on main page
    }
    
    if (!supportsFS) {
        gifsGrid.innerHTML = `
            <div class="empty-state">
                <p>File System API не поддерживается в этом браузере. Используйте Chrome/Edge.</p>
            </div>
        `;
        return;
    }
    
    // Load video directory handle from index.html
    try {
        videoDirectoryHandle = await loadVideoHandle();
    } catch (e) {
        console.log('Error loading directory handle:', e);
        videoDirectoryHandle = null;
    }
    
    if (!videoDirectoryHandle) {
        gifsGrid.innerHTML = `
            <div class="empty-state">
                <p>Сначала выберите папку с видео на <a href="index.html" style="color: #ff69b4; text-decoration: underline;">странице управления</a>.</p>
                <p style="margin-top: 12px; font-size: 13px;">
                    <a href="index.html" style="display: inline-block; padding: 8px 16px; background: linear-gradient(180deg, #ff69b4, #d94b88); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        Перейти к выбору папки
                    </a>
                </p>
            </div>
        `;
        return;
    }
    
    // Scan .gif subfolder
    gifsGrid.innerHTML = '<div class="loading">Загрузка GIF файлов...</div>';
    
    try {
        allGifs = await scanGifDirectory(videoDirectoryHandle);
        
        if (allGifs.length === 0) {
            gifsGrid.innerHTML = `
                <div class="empty-state">
                    <p>В папке не найдена подпапка ".gif" или в ней нет GIF файлов.</p>
                    <p style="margin-top: 8px; font-size: 12px; color: #666;">Создайте папку ".gif" в директории с видео и добавьте туда GIF файлы.</p>
                    <p style="margin-top: 12px; font-size: 12px; color: #888;">Выбранная папка: <strong>${videoDirectoryHandle.name}</strong></p>
                </div>
            `;
            return;
        }
        
        renderGifs(allGifs);
        
    } catch (e) {
        console.error('Error loading GIFs:', e);
        gifsGrid.innerHTML = `
            <div class="empty-state">
                <p>Ошибка загрузки GIF файлов: ${e.message}</p>
            </div>
        `;
    }
}

// Render GIFs to grid
function renderGifs(gifs) {
    const gifsGrid = document.getElementById('gifsGrid');
    
    gifsGrid.innerHTML = gifs.map(gif => `
        <div class="gif-card" onclick="viewGif('${escapeHtml(gif.name)}')">
            <img src="${gif.url}" alt="${escapeHtml(gif.name)}" class="gif-thumbnail">
            <div class="gif-info">
                <div class="gif-name">${escapeHtml(gif.name)}</div>
            </div>
        </div>
    `).join('');
    
    // Save to localStorage for gifs_view.html
    localStorage.setItem('allGifs', JSON.stringify(gifs.map(g => ({
        name: g.name,
        url: g.url
    }))));
}

// Navigate to view page
function viewGif(gifName) {
    window.location.href = `gifs_view.html?gif=${encodeURIComponent(gifName)}`;
}

// Utility function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

// Auto-load on main page
if (document.getElementById('gifsGrid')) {
    loadGifs();
}

// Load single GIF for view page
async function loadSingleGif(gifName) {
    const gifContent = document.getElementById('gifContent');
    
    if (!gifContent) return;
    
    if (!supportsFS) {
        gifContent.innerHTML = `
            <div class="video-info">
                <p>File System API не поддерживается в этом браузере. Используйте Chrome/Edge.</p>
                <a href="gifs_main.html" class="action-btn">← Назад к GIFs</a>
            </div>
        `;
        return;
    }
    
    try {
        videoDirectoryHandle = await loadVideoHandle();
    } catch (e) {
        console.log('Error loading directory handle:', e);
        videoDirectoryHandle = null;
    }
    
    if (!videoDirectoryHandle) {
        gifContent.innerHTML = `
            <div class="video-info">
                <p>Сначала выберите папку с видео на <a href="index.html" style="color: #ff69b4; text-decoration: underline;">странице управления</a>.</p>
                <a href="gifs_main.html" class="action-btn">← Назад к GIFs</a>
            </div>
        `;
        return;
    }
    
    try {
        const gifFolderHandle = await videoDirectoryHandle.getDirectoryHandle('.gif', { create: false });
        const gifFileHandle = await gifFolderHandle.getFileHandle(gifName);
        const file = await gifFileHandle.getFile();
        const url = URL.createObjectURL(file);
        
        // Load metadata
        const metadata = await getGifMetadata(gifFolderHandle, gifName);
        const tags = metadata.tags || [];
        const likes = Number(metadata.likes || 0);
        const dislikes = Number(metadata.dislikes || 0);
        metadata.likes = likes;
        metadata.dislikes = dislikes;
        const description = metadata.description || 'Описание для этой гифки.';
        
        const sizeKB = (file.size / 1024).toFixed(2);
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const sizeDisplay = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
        const modifiedDate = new Date(file.lastModified).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        // Store current GIF info globally
        window.currentGif = {
            name: gifName,
            folderHandle: gifFolderHandle,
            metadata: metadata
        };
        
        gifContent.innerHTML = `
            <div class="player-section">
                <div class="gif-player">
                    <img src="${url}" alt="${escapeHtml(gifName)}" class="gif-display">
                </div>
                <div class="video-info">
                    <h1 class="video-title">${escapeHtml(gifName)}</h1>
                    <div class="video-meta">
                        <span>${sizeDisplay}</span>
                        <span>•</span>
                        <span>${modifiedDate}</span>
                    </div>
                    <div class="video-actions">
                        <div class="channel-info-left">
                            <a href="gifs_main.html" class="action-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                                </svg>
                                <span>Назад к GIFs</span>
                            </a>
                        </div>
                        <div class="actions-right">
                            <button class="action-btn" id="gifLikeBtn" title="Like">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 4l-8 8h6v8h4v-8h6l-8-8z" fill="currentColor" />
                                </svg>
                                <span>Like</span>
                                <span class="reaction-count" id="gifLikeCount">${likes}</span>
                            </button>
                            <button class="action-btn" id="gifDislikeBtn" title="Dislike">
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M12 20l8-8h-6V4h-4v8H4l8 8z" fill="currentColor" />
                                </svg>
                                <span>Dislike</span>
                                <span class="reaction-count" id="gifDislikeCount">${dislikes}</span>
                            </button>
                            <button class="action-btn" onclick="window.open('${url}', '_blank')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                                <span>Открыть в новой вкладке</span>
                            </button>
                        </div>
                    </div>

                    <div class="video-tags" id="videoTags">
                        ${tags.length > 0 ? tags.map(tag => `<span class="video-tag">${escapeHtml(tag)}</span>`).join('') : ''}
                        <button class="edit-tags-btn" id="editTagsBtn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span>${tags.length > 0 ? 'Редактировать теги' : 'Добавить теги'}</span>
                        </button>
                    </div>

                    <div class="tags-edit-form" id="tagsEditForm" style="display: none;">
                        <div class="tags-edit-controls">
                            <input type="text" id="tagsEditInput" placeholder="Введите теги через запятую..." value="${escapeHtml(tags.join(', '))}">
                        </div>
                        <div class="tags-edit-actions">
                            <button class="tags-edit-cancel" id="tagsEditCancel">Отмена</button>
                            <button class="tags-edit-save" id="tagsEditSave">Сохранить</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="video-description">
                <div class="description-header" id="descriptionHeader">
                    <h3>Описание</h3>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button class="edit-description-btn" id="editDescriptionBtn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                        <button class="description-toggle" id="descriptionToggle">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="description-content collapsed" id="descriptionContent">
                    <div class="description-text" id="descriptionText">
                        ${escapeHtml(description)}
                    </div>

                    <div class="description-edit-form" id="descriptionEditForm">
                        <div class="description-edit-controls">
                            <textarea id="descriptionEditInput" placeholder="Введите описание...">${escapeHtml(description)}</textarea>
                        </div>
                        <div class="description-edit-actions">
                            <button class="description-edit-cancel" id="descriptionEditCancel">Отмена</button>
                            <button class="description-edit-save" id="descriptionEditSave">Сохранить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners for tags editing
        setTimeout(() => {
            const editTagsBtn = document.getElementById('editTagsBtn');
            const tagsEditForm = document.getElementById('tagsEditForm');
            const tagsEditCancel = document.getElementById('tagsEditCancel');
            const tagsEditSave = document.getElementById('tagsEditSave');
            const videoTags = document.getElementById('videoTags');
            
            if (editTagsBtn && tagsEditForm) {
                editTagsBtn.addEventListener('click', () => {
                    tagsEditForm.style.display = 'flex';
                    videoTags.style.display = 'none';
                });
                
                tagsEditCancel.addEventListener('click', () => {
                    tagsEditForm.style.display = 'none';
                    videoTags.style.display = 'flex';
                });
                
                tagsEditSave.addEventListener('click', async () => {
                    const input = document.getElementById('tagsEditInput');
                    const newTagsStr = input.value.trim();
                    const newTags = newTagsStr ? newTagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
                    
                    // Save to metadata
                    if (window.currentGif) {
                        window.currentGif.metadata.tags = newTags;
                        await saveGifMetadata(window.currentGif.folderHandle, window.currentGif.name, window.currentGif.metadata);
                        
                        // Update display
                        const tagsHtml = newTags.length > 0 
                            ? newTags.map(tag => `<span class="video-tag">${escapeHtml(tag)}</span>`).join('')
                            : '';
                        videoTags.innerHTML = tagsHtml + `
                            <button class="edit-tags-btn" id="editTagsBtn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>${newTags.length > 0 ? 'Редактировать теги' : 'Добавить теги'}</span>
                            </button>
                        `;
                        
                        // Re-bind the edit button
                        const newEditBtn = document.getElementById('editTagsBtn');
                        if (newEditBtn) {
                            newEditBtn.addEventListener('click', () => {
                                input.value = newTags.join(', ');
                                tagsEditForm.style.display = 'flex';
                                videoTags.style.display = 'none';
                            });
                        }
                    }
                    
                    tagsEditForm.style.display = 'none';
                    videoTags.style.display = 'flex';
                });
            }
            
            // Add event listeners for description editing
            const editDescriptionBtn = document.getElementById('editDescriptionBtn');
            const descriptionEditForm = document.getElementById('descriptionEditForm');
            const descriptionEditCancel = document.getElementById('descriptionEditCancel');
            const descriptionEditSave = document.getElementById('descriptionEditSave');
            const descriptionText = document.getElementById('descriptionText');
            const gifLikeBtn = document.getElementById('gifLikeBtn');
            const gifDislikeBtn = document.getElementById('gifDislikeBtn');
            const gifLikeCount = document.getElementById('gifLikeCount');
            const gifDislikeCount = document.getElementById('gifDislikeCount');
            
            if (editDescriptionBtn && descriptionEditForm) {
                editDescriptionBtn.addEventListener('click', () => {
                    descriptionEditForm.style.display = 'block';
                    descriptionText.style.display = 'none';
                });
                
                descriptionEditCancel.addEventListener('click', () => {
                    descriptionEditForm.style.display = 'none';
                    descriptionText.style.display = 'block';
                });
                
                descriptionEditSave.addEventListener('click', async () => {
                    const newDesc = document.getElementById('descriptionEditInput').value;
                    
                    // Save to metadata
                    if (window.currentGif) {
                        window.currentGif.metadata.description = newDesc;
                        await saveGifMetadata(window.currentGif.folderHandle, window.currentGif.name, window.currentGif.metadata);
                    }
                    
                    descriptionText.textContent = newDesc;
                    descriptionEditForm.style.display = 'none';
                    descriptionText.style.display = 'block';
                });
            }
            
            // Add event listener for description toggle
            const descriptionToggle = document.getElementById('descriptionToggle');
            const descriptionContent = document.getElementById('descriptionContent');
            
            if (descriptionToggle && descriptionContent) {
                // Set initial state to collapsed
                descriptionToggle.classList.add('collapsed');
                
                descriptionToggle.addEventListener('click', () => {
                    if (descriptionContent.classList.contains('collapsed')) {
                        descriptionContent.classList.remove('collapsed');
                        descriptionContent.classList.add('expanded');
                        descriptionToggle.classList.remove('collapsed');
                    } else {
                        descriptionContent.classList.add('collapsed');
                        descriptionContent.classList.remove('expanded');
                        descriptionToggle.classList.add('collapsed');
                    }
                });
            }

            if (gifLikeBtn) {
                gifLikeBtn.addEventListener('click', async () => {
                    if (!window.currentGif) return;
                    try {
                        const meta = await getGifMetadata(window.currentGif.folderHandle, window.currentGif.name);
                        meta.likes = (meta.likes || 0) + 1;
                        await saveGifMetadata(window.currentGif.folderHandle, window.currentGif.name, meta);
                        window.currentGif.metadata.likes = meta.likes;
                        if (gifLikeCount) gifLikeCount.textContent = String(meta.likes || 0);
                        gifLikeBtn.classList.add('liked');
                    } catch (e) {
                        console.error('Error saving GIF like:', e);
                    }
                });
            }

            if (gifDislikeBtn) {
                gifDislikeBtn.addEventListener('click', async () => {
                    if (!window.currentGif) return;
                    try {
                        const meta = await getGifMetadata(window.currentGif.folderHandle, window.currentGif.name);
                        meta.dislikes = (meta.dislikes || 0) + 1;
                        await saveGifMetadata(window.currentGif.folderHandle, window.currentGif.name, meta);
                        window.currentGif.metadata.dislikes = meta.dislikes;
                        if (gifDislikeCount) gifDislikeCount.textContent = String(meta.dislikes || 0);
                        gifDislikeBtn.classList.add('disliked');
                    } catch (e) {
                        console.error('Error saving GIF dislike:', e);
                    }
                });
            }
        }, 100);
        
        // Load recommendations
        await loadGifRecommendations(gifName, gifFolderHandle);
        
    } catch (e) {
        console.error('Error loading GIF:', e);
        gifContent.innerHTML = `
            <div class="video-info">
                <p>Ошибка загрузки GIF: ${e.message}</p>
                <a href="gifs_main.html" class="action-btn">← Назад к GIFs</a>
            </div>
        `;
    }
}

// Load GIF recommendations
async function loadGifRecommendations(currentGifName, gifFolderHandle) {
    const recsContainer = document.getElementById('gifRecommendationsSidebar');
    if (!recsContainer) return;
    
    try {
        const gifs = [];
        for await (const entry of gifFolderHandle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.gif') && entry.name !== currentGifName) {
                try {
                    const file = await entry.getFile();
                    gifs.push({
                        name: entry.name,
                        file: file,
                        url: URL.createObjectURL(file),
                        size: file.size
                    });
                } catch (e) {
                    console.warn('Could not load GIF:', entry.name);
                }
            }
        }
        
        // Shuffle and take first 30
        const shuffled = gifs.sort(() => Math.random() - 0.5).slice(0, 30);
        
        if (shuffled.length === 0) {
            recsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #999; font-size: 11px;">Нет других GIFs</div>';
            return;
        }
        
        recsContainer.innerHTML = shuffled.map(gif => {
            return `
                <div class="related-video" onclick="window.location.href='gifs_view.html?gif=${encodeURIComponent(gif.name)}'">
                    <img src="${gif.url}" alt="${escapeHtml(gif.name)}" class="related-thumb">
                </div>
            `;
        }).join('');
        
    } catch (e) {
        console.error('Error loading recommendations:', e);
        recsContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #999; font-size: 11px;">Ошибка загрузки</div>';
    }
}

// Make function available globally
window.loadSingleGif = loadSingleGif;

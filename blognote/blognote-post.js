// Post page functionality
let currentPost = null;
let allPosts = [];
let allUsers = [];

async function loadPost() {
    console.log('[Post] Loading post...');
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');

    if (!postId || !window.blognoteFS.hasFolder()) {
        console.log('[Post] No post ID or folder, redirecting to feed');
        window.location.href = 'feed.html';
        return;
    }

    try {
        console.log('[Post] Reading data files...');
        const [posts, users] = await Promise.all([
            window.blognoteFS.readJSON('posts.json'),
            window.blognoteFS.readJSON('users.json')
        ]);
        
        allPosts = posts || [];
        allUsers = users || [];
        console.log('[Post] Posts:', allPosts.length, 'Users:', allUsers.length);
        
        currentPost = allPosts.find(p => p.id === postId);

        if (!currentPost) {
            console.log('[Post] Post not found, redirecting to feed');
            window.location.href = 'feed.html';
            return;
        }

        populateUserMenu();
        populatePopularTags();

        // Increment views
        currentPost.views = (currentPost.views || 0) + 1;
        await window.blognoteFS.writeJSON('posts.json', allPosts);
        console.log('[Post] Views incremented');

        renderPost();
        loadRelatedPosts();
    } catch (err) {
        console.error('[Post] Error loading post:', err);
        window.location.href = 'feed.html';
    }
}

function populateUserMenu() {
    setupUserMenu(allUsers);
}

function populatePopularTags() {
    const popularTagsEl = document.getElementById('popularTags');
    if (!popularTagsEl) return;

    // Count tags
    const tagCounts = {};
    allPosts.forEach(post => {
        if (post.tags) {
            post.tags.forEach(tag => {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    // Sort by count
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    if (sortedTags.length === 0) {
        popularTagsEl.innerHTML = '<div style="padding: 0 12px; font-size: 12px; color: var(--text-secondary);">Нет тегов</div>';
        return;
    }

    popularTagsEl.innerHTML = '';
    sortedTags.forEach(([tag, count]) => {
        const tagEl = document.createElement('a');
        tagEl.className = 'sidebar-tag';
        tagEl.href = `feed.html`;
        tagEl.innerHTML = `
            <span>#${tag}</span>
            <span class="sidebar-tag-count">${count}</span>
        `;
        popularTagsEl.appendChild(tagEl);
    });
}

async function renderPost() {
    const title = document.getElementById('postTitle');
    const author = document.getElementById('postAuthor');
    const date = document.getElementById('postDate');
    const views = document.getElementById('postViews');
    const content = document.getElementById('postContent');
    const tags = document.getElementById('postTags');
    const likesCount = document.getElementById('likesCount');

    title.textContent = currentPost.title;
    
    // Update page title with post title
    document.title = `${currentPost.title} | Blognote`;
    date.textContent = formatDate(currentPost.date);
    views.textContent = `${currentPost.views || 0} просмотров`;
    likesCount.textContent = currentPost.likes || 0;

    // Load author info
    const authorData = allUsers.find(u => u.id === currentPost.authorId);
    if (authorData) {
        author.textContent = authorData.name;
        author.href = `profile.html?id=${authorData.id}`;
    } else {
        author.textContent = 'Неизвестный автор';
    }

    // Render content
    content.innerHTML = formatContent(currentPost.content);
    
    // Load images from filesystem
    loadPostImages(content);
    
    // Initialize media players
    initMediaPlayers(content);

    // Render tags
    if (currentPost.tags && currentPost.tags.length > 0) {
        tags.innerHTML = '';
        currentPost.tags.forEach(tag => {
            const tagEl = document.createElement('a');
            tagEl.className = 'tag';
            tagEl.href = `feed.html?tag=${encodeURIComponent(tag)}`;
            tagEl.textContent = `#${tag}`;
            tagEl.style.cursor = 'pointer';
            tags.appendChild(tagEl);
        });
    }

    // Like button
    const likeBtn = document.getElementById('likeBtn');
    const likedPosts = JSON.parse(localStorage.getItem('blognote-liked-posts') || '[]');
    if (likedPosts.includes(currentPost.id)) {
        likeBtn.classList.add('liked');
    }

    likeBtn.addEventListener('click', toggleLike);

    // Bookmark button
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    const bookmarkedPosts = JSON.parse(localStorage.getItem('blognote-bookmarks') || '[]');
    if (bookmarkedPosts.includes(currentPost.id)) {
        bookmarkBtn.classList.add('bookmarked');
    }

    bookmarkBtn.addEventListener('click', toggleBookmark);

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    shareBtn.addEventListener('click', sharePost);
    
    // Edit button (show only for post author)
    const editBtn = document.getElementById('editBtn');
    editBtn.style.display = 'flex';
    editBtn.addEventListener('click', () => {
        window.location.href = `editor.html?edit=${currentPost.id}`;
    });
}

function formatContent(content) {
    // Simple markdown-like formatting
    let formatted = content
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    
    formatted = `<p>${formatted}</p>`;
    
    // Bold
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Images (must be before links)
    formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="post-image" data-src="$2">');
    
    // CRITICAL: Process media BEFORE regular links, using exact patterns
    
    // 2. Audio with cover [audio:Title:cover.jpg](path) - must match TWO colons
    formatted = formatted.replace(/\[audio:([^:\]]+):([^\]]+)\]\(([^\)]+)\)/g, function(match, title, cover, path) {
        return `<div class="blognote-media-container" data-blognote-audio="${path}" data-audio-title="${title}" data-audio-cover="${cover}"></div>`;
    });
    
    // 3. Audio without cover [audio:Title](path) - must match ONE colon only
    formatted = formatted.replace(/\[audio:([^\]]+?)\]\(([^\)]+)\)/g, function(match, title, path) {
        return `<div class="blognote-media-container" data-blognote-audio="${path}" data-audio-title="${title}"></div>`;
    });
    
    // 4. Regular links - LAST to avoid capturing media
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
    
    return formatted;
}

async function loadPostImages(contentElement) {
    const images = contentElement.querySelectorAll('img.post-image[data-src]');
    
    for (const img of images) {
        const imagePath = img.getAttribute('data-src');
        
        try {
            const file = await window.blognoteFS.readFile(imagePath);
            const url = URL.createObjectURL(file);
            img.src = url;
            img.removeAttribute('data-src');
            
            // Add click handler for modal
            img.addEventListener('click', () => openImageModal(url));
        } catch (err) {
            console.error('[Post] Error loading image:', imagePath, err);
            img.alt = 'Изображение не найдено';
            img.style.display = 'none';
        }
    }
}

function openImageModal(imageUrl) {
    let modal = document.getElementById('imageModal');
    
    if (!modal) {
        // Create modal
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <button class="image-modal-close" onclick="closeImageModal()">×</button>
            <img class="image-modal-content" id="modalImage" src="">
        `;
        document.body.appendChild(modal);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeImageModal();
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeImageModal();
            }
        });
    }
    
    const modalImage = document.getElementById('modalImage');
    modalImage.src = imageUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function toggleLike() {
    const likeBtn = document.getElementById('likeBtn');
    const likesCount = document.getElementById('likesCount');
    const likedPosts = JSON.parse(localStorage.getItem('blognote-liked-posts') || '[]');

    if (likedPosts.includes(currentPost.id)) {
        // Unlike
        const index = likedPosts.indexOf(currentPost.id);
        likedPosts.splice(index, 1);
        currentPost.likes = Math.max(0, (currentPost.likes || 0) - 1);
        likeBtn.classList.remove('liked');
    } else {
        // Like
        likedPosts.push(currentPost.id);
        currentPost.likes = (currentPost.likes || 0) + 1;
        likeBtn.classList.add('liked');
    }

    localStorage.setItem('blognote-liked-posts', JSON.stringify(likedPosts));
    likesCount.textContent = currentPost.likes;

    // Save to file
    await window.blognoteFS.writeJSON('posts.json', allPosts);
}

function toggleBookmark() {
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    const bookmarkedPosts = JSON.parse(localStorage.getItem('blognote-bookmarks') || '[]');

    if (bookmarkedPosts.includes(currentPost.id)) {
        // Remove bookmark
        const index = bookmarkedPosts.indexOf(currentPost.id);
        bookmarkedPosts.splice(index, 1);
        bookmarkBtn.classList.remove('bookmarked');
    } else {
        // Add bookmark
        bookmarkedPosts.push(currentPost.id);
        bookmarkBtn.classList.add('bookmarked');
    }

    localStorage.setItem('blognote-bookmarks', JSON.stringify(bookmarkedPosts));
}

function sharePost() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: currentPost.title,
            url: url
        });
    } else {
        navigator.clipboard.writeText(url);
        alert('Ссылка скопирована в буфер обмена');
    }
}

function loadRelatedPosts() {
    const relatedList = document.getElementById('relatedList');
    relatedList.innerHTML = '';

    // Find posts with similar tags
    const related = allPosts
        .filter(p => p.id !== currentPost.id)
        .filter(p => {
            if (!currentPost.tags || !p.tags) return false;
            return p.tags.some(tag => currentPost.tags.includes(tag));
        })
        .slice(0, 5);

    if (related.length === 0) {
        // Show random posts
        const random = allPosts
            .filter(p => p.id !== currentPost.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 5);
        
        random.forEach(post => {
            relatedList.appendChild(createRelatedItem(post));
        });
    } else {
        related.forEach(post => {
            relatedList.appendChild(createRelatedItem(post));
        });
    }
}

function createRelatedItem(post) {
    const item = document.createElement('div');
    item.className = 'related-item';
    item.onclick = () => {
        window.location.href = `post.html?id=${post.id}`;
    };

    const title = document.createElement('div');
    title.className = 'related-item-title';
    title.textContent = post.title;

    const meta = document.createElement('div');
    meta.className = 'related-item-meta';
    meta.textContent = `${formatDate(post.date)} • ${post.views || 0} просмотров`;

    item.appendChild(title);
    item.appendChild(meta);

    return item;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Сегодня';
    if (days === 1) return 'Вчера';
    if (days < 7) return `${days} дн. назад`;
    if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Post] DOM loaded');
    
    setTimeout(() => {
        console.log('[Post] Starting initialization');
        loadPost();
    }, 200);
    
    // Create post button
    const createPostBtn = document.getElementById('createPostBtn');
    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            window.location.href = 'editor.html';
        });
    }
    
    // Folder button - redirect to feed
    const selectFolderBtn = document.getElementById('selectFolderBtn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', () => {
            window.location.href = 'feed.html';
        });
    }
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.location.href = 'settings.html';
        });
    }
});

async function initMediaPlayers(contentElement) {
    // Initialize audio players
    const audioContainers = contentElement.querySelectorAll('[data-blognote-audio]');
    for (const container of audioContainers) {
        const audioPath = container.getAttribute('data-blognote-audio');
        const audioTitle = container.getAttribute('data-audio-title') || 'Аудио';
        const coverPath = container.getAttribute('data-audio-cover');
        
        try {
            const file = await window.blognoteFS.readFile(audioPath);
            const url = URL.createObjectURL(file);
            container.setAttribute('data-blognote-audio', url);
            
            let coverUrl = null;
            if (coverPath) {
                try {
                    const coverFile = await window.blognoteFS.readFile(coverPath);
                    coverUrl = URL.createObjectURL(coverFile);
                    container.setAttribute('data-audio-cover', coverUrl);
                } catch (coverErr) {
                    console.warn('[Post] Could not load audio cover:', coverPath, coverErr);
                }
            } else {
                // Try to extract cover from MP3 file
                coverUrl = await extractCoverFromAudio(file);
            }
            
            // Initialize player after DOM is ready
            if (typeof BlognoteAudioPlayer !== 'undefined') {
                new BlognoteAudioPlayer(container, url, audioTitle, coverUrl);
            } else {
                console.error('[Post] BlognoteAudioPlayer not loaded');
            }
        } catch (err) {
            console.error('[Post] Error loading audio:', audioPath, err);
            container.innerHTML = '<div class="blognote-audio-error">Аудио не найдено</div>';
        }
    }
}

// Extract cover image from audio file (MP3 ID3 tags)
async function extractCoverFromAudio(audioFile) {
    try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const dataView = new DataView(arrayBuffer);
        
        // Check for ID3v2 tag (first 3 bytes should be "ID3")
        if (String.fromCharCode(dataView.getUint8(0), dataView.getUint8(1), dataView.getUint8(2)) !== 'ID3') {
            return null;
        }
        
        // Get ID3v2 version
        const version = dataView.getUint8(3);
        
        // Get tag size (synchsafe integer)
        const tagSize = 
            (dataView.getUint8(6) << 21) |
            (dataView.getUint8(7) << 14) |
            (dataView.getUint8(8) << 7) |
            dataView.getUint8(9);
        
        let offset = 10;
        const tagEnd = offset + tagSize;
        
        // Parse frames
        while (offset < tagEnd - 10) {
            // Frame ID (4 bytes)
            const frameId = String.fromCharCode(
                dataView.getUint8(offset),
                dataView.getUint8(offset + 1),
                dataView.getUint8(offset + 2),
                dataView.getUint8(offset + 3)
            );
            
            if (frameId === '\0\0\0\0') break;
            
            // Frame size
            let frameSize;
            if (version === 4) {
                // ID3v2.4 uses synchsafe integers
                frameSize = 
                    (dataView.getUint8(offset + 4) << 21) |
                    (dataView.getUint8(offset + 5) << 14) |
                    (dataView.getUint8(offset + 6) << 7) |
                    dataView.getUint8(offset + 7);
            } else {
                // ID3v2.3 uses normal integers
                frameSize = dataView.getUint32(offset + 4);
            }
            
            // Check if this is an APIC (attached picture) frame
            if (frameId === 'APIC') {
                const frameDataOffset = offset + 10;
                let dataOffset = frameDataOffset;
                
                // Skip text encoding (1 byte)
                dataOffset++;
                
                // Read MIME type (null-terminated string)
                while (dataOffset < frameDataOffset + frameSize && dataView.getUint8(dataOffset) !== 0) {
                    dataOffset++;
                }
                dataOffset++; // Skip null terminator
                
                // Skip picture type (1 byte)
                dataOffset++;
                
                // Skip description (null-terminated string)
                while (dataOffset < frameDataOffset + frameSize && dataView.getUint8(dataOffset) !== 0) {
                    dataOffset++;
                }
                dataOffset++; // Skip null terminator
                
                // The rest is the image data
                const imageDataStart = dataOffset;
                const imageDataEnd = frameDataOffset + frameSize;
                const imageData = arrayBuffer.slice(imageDataStart, imageDataEnd);
                
                // Create blob and return URL
                const blob = new Blob([imageData], { type: 'image/jpeg' });
                return URL.createObjectURL(blob);
            }
            
            offset += 10 + frameSize;
        }
        
        return null;
    } catch (err) {
        console.error('[Post] Error extracting cover from audio:', err);
        return null;
    }
}

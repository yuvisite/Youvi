/**
 * YouVi Video Cards System
 * JavaScript module for creating and managing video cards
 */

/**
 * Create a video card element
 * @param {Object} video - Video data object
 * @param {Object} options - Card configuration options
 * @returns {HTMLElement} Video card element
 */
function createVideoCard(video, options = {}) {
    const config = {
        showNumber: false,
        showQuality: true,
        showNew: true,
        showDuration: true,
        showViews: true,
        showChannel: true,
        showCategory: false,
        cardClass: 'video-card',
        titleClass: 'video-card-title',
        infoClass: 'video-info',
        ...options
    };

    const card = document.createElement('div');
    card.className = config.cardClass;
    card.dataset.videoName = video.name;
    card.dataset.dirHandle = video.dirHandle ? 'available' : 'unavailable';

    const thumbnail = document.createElement('a');
    thumbnail.className = 'video-thumbnail';
    
    if (video.playlistUrl) {
        thumbnail.href = video.playlistUrl;
    } else if (video.name) {
        thumbnail.href = window.VideoID 
            ? window.VideoID.buildVideoUrl(video.name)
            : `youvi_video.html?name=${encodeURIComponent(video.name)}`;
    } else {
        thumbnail.href = '#';
    }
    
    thumbnail.onclick = (e) => {
        if (e.button === 0) {
            e.preventDefault();
            if (video.playlistUrl) {
                window.location.href = video.playlistUrl;
            } else if (typeof openVideo === 'function') {
                openVideo(video);
            }
        }
    };

    if (config.showNumber && (video.number || video.playlistNumber)) {
        const numberBadge = document.createElement('div');
        numberBadge.className = 'video-number';
        numberBadge.textContent = video.number || video.playlistNumber;
        thumbnail.appendChild(numberBadge);
    }

    if (config.showQuality && video.quality) {
        const qualityBadge = document.createElement('div');
        qualityBadge.className = 'video-quality';
        qualityBadge.setAttribute('data-quality', video.quality);
        qualityBadge.textContent = video.quality;
        thumbnail.appendChild(qualityBadge);
    }

    if (config.showNew && isNewVideo(video)) {
        const newBadge = document.createElement('div');
        newBadge.className = 'video-new';
        newBadge.textContent = typeof i18n !== 'undefined' ? i18n.t('badges.new', 'Новинка') : 'Новинка';
        thumbnail.appendChild(newBadge);
    }

    if (config.showDuration) {
        const durationBadge = document.createElement('div');
        durationBadge.className = 'video-duration';
        durationBadge.textContent = video.duration || '0:00';
        thumbnail.appendChild(durationBadge);
    }

    card.appendChild(thumbnail);

    const info = document.createElement('div');
    info.className = config.infoClass;
    
    let channelName = '';
    if (video.tags) {
        const channelTag = video.tags.find(t => t.includes('(ка)'));
        if (channelTag) {
            channelName = channelTag.replace(' (ка)', '');
        }
    }
    if (!channelName) {
        channelName = video.channel || video.channelName || '';
    }

    const title = document.createElement('div');
    title.className = config.titleClass;
    title.style.fontSize = '13px';
    
    if (video.playlistUrl) {
        title.innerHTML = `<a href="${video.playlistUrl}" class="video-title-link" style="color:inherit;text-decoration:none;">${escapeHtml(getFileNameWithoutExtension(video.name))}</a>`;
    } else {
        title.textContent = getFileNameWithoutExtension(video.name);
    }
    
    info.appendChild(title);

    // Stats block - under title
    if (config.showViews) {
        const viewCount = video.views || 0;
        const danmakuCount = video.danmakuCount || (window.DanmakuCounter ? window.DanmakuCounter.get(video.name) : 0);
        const viewsSvg = `<svg width="14" height="14" viewBox="0 0 24 24" style="display:inline;vertical-align:-2px;"><path fill="#888" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
        const danmakuSvg = `<svg width="14" height="14" viewBox="0 0 24 24" style="display:inline;vertical-align:-2px;"><path fill="#888" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
        
        const statsLine = document.createElement('div');
        statsLine.className = 'video-stats';
        statsLine.style.cssText = 'color:#888;font-size:11px;';
        statsLine.innerHTML = `${viewsSvg} ${viewCount.toLocaleString()} • ${danmakuSvg} ${danmakuCount}`;
        info.appendChild(statsLine);
    }
    
    const metaRow = document.createElement('div');
    metaRow.className = 'video-card-meta-row';
    
    if (config.showChannel && channelName) {
        const channelInitial = channelName.charAt(0).toUpperCase();
        const avatarId = `cardAvatar_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        
        const avatarLink = document.createElement('a');
        avatarLink.href = `youvi_ch_view.html?channel=${encodeURIComponent(channelName)}`;
        avatarLink.className = 'video-card-avatar-link';
        avatarLink.onclick = (e) => e.stopPropagation();
        
        const avatar = document.createElement('div');
        avatar.className = 'video-card-avatar';
        avatar.id = avatarId;
        avatar.textContent = channelInitial;
        
        avatarLink.appendChild(avatar);
        metaRow.appendChild(avatarLink);
        
        const dirHandle = window.videoDirectoryHandle || (typeof videoDirectoryHandle !== 'undefined' ? videoDirectoryHandle : null);
        if (typeof loadChannelAvatar !== 'undefined' && dirHandle) {
            requestIdleCallback(() => {
                loadChannelAvatar(channelName, dirHandle).then(avatarUrl => {
                    if (avatarUrl) {
                        avatar.style.backgroundImage = `url(${avatarUrl})`;
                        avatar.classList.add('custom-avatar');
                        avatar.textContent = '';
                    }
                }).catch(err => console.error('Avatar load error:', err));
            });
        }
    }
    
    const textWrapper = document.createElement('div');
    textWrapper.className = 'video-card-text';

    if (config.showChannel && channelName) {
        const channel = document.createElement('div');
        channel.className = 'video-playlist';
        channel.style.fontSize = '11px';
        channel.innerHTML = `<a href="youvi_ch_view.html?channel=${encodeURIComponent(channelName)}" class="playlist-channel-link">${escapeHtml(channelName)}</a>`;
        textWrapper.appendChild(channel);
    }

    // Date - under channel name
    const createdDateObj = video.created ? new Date(video.created) : null;
    const dateStr = createdDateObj ? `${String(createdDateObj.getDate()).padStart(2,'0')}/${String(createdDateObj.getMonth()+1).padStart(2,'0')}/${createdDateObj.getFullYear()}` : '';
    if (dateStr) {
        const dateLine = document.createElement('div');
        dateLine.className = 'video-date';
        dateLine.style.cssText = 'color:#888;font-size:11px;';
        dateLine.textContent = dateStr;
        textWrapper.appendChild(dateLine);
    }

    if (config.showCategory) {
        let categories = [];
        
        if (video.playlistCategories && video.playlistCategories.length > 0) {
            categories = video.playlistCategories;
        } else if (video.tags && video.tags.length > 0) {
            categories = video.tags.slice(0, 3);
        }
        
        if (categories.length > 0) {
            const category = document.createElement('div');
            category.className = 'video-category';
            category.innerHTML = categories.map(cat => 
                `<a href="#" class="video-category-link" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</a>`
            ).join(', ');
            textWrapper.appendChild(category);
        }
    }
    
    metaRow.appendChild(textWrapper);
    info.appendChild(metaRow);

    card.appendChild(info);
    return card;
}

/**
 * Create a latest video card (smaller version)
 * @param {Object} video - Video data object
 * @param {Object} options - Card configuration options
 * @returns {HTMLElement} Latest video card element
 */
function createLatestCard(video, options = {}) {
    const config = {
        showChannel: true,
        showViews: false,
        ...options
    };

    const card = document.createElement('div');
    card.className = 'latest-card';
    card.dataset.videoName = video.name;

    const thumbnail = document.createElement('a');
    thumbnail.className = 'latest-thumb';
    thumbnail.href = '#';
    thumbnail.onclick = (e) => {
        e.preventDefault();
        if (typeof openVideo === 'function') {
            openVideo(video);
        }
    };

    if (video.duration) {
        const duration = document.createElement('div');
        duration.className = 'latest-duration';
        duration.textContent = video.duration;
        thumbnail.appendChild(duration);
    }

    card.appendChild(thumbnail);

    const info = document.createElement('div');
    info.className = 'latest-info';

    if (config.showChannel && video.channel) {
        const channel = document.createElement('div');
        channel.className = 'latest-channel';
        channel.style.fontSize = '11px';
        channel.innerHTML = `<a href="#" onclick="filterByChannel('${escapeHtml(video.channel)}', this.id); return false;" class="playlist-channel-link">${escapeHtml(video.channel)}</a>`;
        info.appendChild(channel);
    }

    const title = document.createElement('div');
    title.className = 'latest-title-text';
    title.style.fontSize = '13px';
    title.textContent = getFileNameWithoutExtension(video.name);
    info.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'latest-sub';
    subtitle.style.fontSize = '11px';
    subtitle.textContent = formatFileSize(video.size || 0);
    info.appendChild(subtitle);

    card.appendChild(info);
    return card;
}

/**
 * Render videos into a grid container
 * @param {HTMLElement} container - Container element
 * @param {Array} videos - Array of video objects
 * @param {Object} options - Rendering options
 */
function renderVideoGrid(container, videos, options = {}) {
    const config = {
        cardType: 'video',
        showEmpty: true,
        emptyMessage: typeof i18n !== 'undefined' ? i18n.t('main.noVideos', 'Видео не найдены') : 'Видео не найдены',
        clearContainer: true,
        ...options
    };

    if (config.clearContainer) {
        container.innerHTML = '';
    }

    if (videos.length === 0 && config.showEmpty) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.textContent = config.emptyMessage;
        container.appendChild(emptyState);
        return;
    }

    videos.forEach((video, index) => {
        let card;
        
        if (config.cardType === 'latest') {
            card = createLatestCard(video, config);
        } else {
            if (config.showNumber && !video.playlistNumber && !video.number) {
                video.number = index + 1;
            }
            card = createVideoCard(video, config);
        }

        container.appendChild(card);
    });

    if (typeof addHoverPreviewToCards === 'function') {
        const thumbnails = container.querySelectorAll('.video-thumbnail, .latest-thumb');
        addHoverPreviewToCards(Array.from(thumbnails), videos);
    }
}

/**
 * Check if video is considered "new" (uploaded within last 24 hours)
 * @param {Object} video - Video object
 * @returns {boolean} Whether video is new
 */
function isNewVideo(video) {
    if (!video.created) return false;
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return video.created > dayAgo;
}

/**
 * Utility function to get filename without extension
 * @param {string} name - Filename
 * @returns {string} Name without extension
 */
function getFileNameWithoutExtension(name) {
    if (!name) return '';
    return name.replace(/\.[^/.]+$/, '');
}

/**
 * Utility function to escape HTML
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
    if (!bytes || bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Format views count with proper pluralization
 * @param {number} count - Views count
 * @returns {string} Formatted views
 */
function getViewsText(count) {
    const n = Math.abs(Number(count) || 0) % 100;
    const n1 = n % 10;
    
    const lang = typeof i18n !== 'undefined' ? i18n.getCurrentLanguage() : 'ru';
    
    if (lang === 'en') {
        return count === 1 ? 'view' : 'views';
    } else if (lang === 'uk') {
        if (n > 10 && n < 20) return 'переглядів';
        if (n1 === 1) return 'перегляд';
        if (n1 >= 2 && n1 <= 4) return 'перегляди';
        return 'переглядів';
    } else {
        if (n > 10 && n < 20) return 'просмотров';
        if (n1 === 1) return 'просмотр';
        if (n1 >= 2 && n1 <= 4) return 'просмотра';
        return 'просмотров';
    }
}

/**
 * Initialize cards system on a page
 * @param {Object} options - Initialization options
 */
function initVideoCards(options = {}) {
    const config = {
        enableBadgeToggle: true,
        ...options
    };

    if (config.enableBadgeToggle) {
        initializeBadgesState();
    }

    console.log('YouVi Video Cards system initialized');
}

/**
 * Initialize badges state from localStorage
 */
function initializeBadgesState() {
    const badgesHidden = localStorage.getItem('videoBadgesHidden') === 'true';
    if (badgesHidden) {
        document.body.classList.add('badges-hidden');
    }
}

/**
 * Toggle video badges visibility
 */
function toggleVideoBadges() {
    const isHidden = document.body.classList.contains('badges-hidden');
    
    if (isHidden) {
        document.body.classList.remove('badges-hidden');
        localStorage.setItem('videoBadgesHidden', 'false');
    } else {
        document.body.classList.add('badges-hidden');
        localStorage.setItem('videoBadgesHidden', 'true');
    }
    
    const toggleBtn = document.querySelector('[onclick="toggleVideoBadges()"]');
    if (toggleBtn) {
        const hideText = typeof i18n !== 'undefined' ? i18n.t('header.badges', 'Скрыть значки') : 'Скрыть значки';
        const showText = typeof i18n !== 'undefined' ? i18n.t('header.badges', 'Показать значки') : 'Показать значки';
        toggleBtn.textContent = isHidden ? hideText : showText;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createVideoCard,
        createLatestCard,
        renderVideoGrid,
        initVideoCards,
        toggleVideoBadges,
        isNewVideo,
        getFileNameWithoutExtension,
        escapeHtml,
        formatFileSize,
        getViewsText
    };
} else {
    window.YouViCards = {
        createVideoCard,
        createLatestCard,
        renderVideoGrid,
        initVideoCards,
        toggleVideoBadges,
        isNewVideo,
        getFileNameWithoutExtension,
        escapeHtml,
        formatFileSize,
        getViewsText
    };
    
    window.createVideoCard = createVideoCard;
    window.createLatestCard = createLatestCard;
    window.renderVideoGrid = renderVideoGrid;
    window.toggleVideoBadges = toggleVideoBadges;
}
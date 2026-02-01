
class VirtualPlaylistRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.itemHeight = options.itemHeight || 90;
        this.bufferSize = options.bufferSize || 5;
        this.videos = [];
        this.currentVideoName = null;
        this.onVideoClick = options.onVideoClick || (() => {});
        
        this.scrollContainer = null;
        this.contentWrapper = null;
        this.visibleItems = new Map();
        this.lastScrollTop = 0;
        this.rafId = null;
        
        this.init();
    }
    
    init() {
        this.scrollContainer = this.container;
        
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.style.cssText = `
            position: relative;
            width: 100%;
        `;
        
        this.container.appendChild(this.contentWrapper);
        
        this.scrollContainer.addEventListener('scroll', () => {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = requestAnimationFrame(() => this.handleScroll());
        }, { passive: true });
    }
    
    setVideos(videos, currentVideoName) {
        this.videos = videos;
        this.currentVideoName = currentVideoName;
        
        const totalHeight = videos.length * this.itemHeight;
        this.contentWrapper.style.height = `${totalHeight}px`;
        
        this.visibleItems.clear();
        
        this.render();
        
        this.scrollToCurrentVideo();
    }
    
    handleScroll() {
        const scrollTop = this.scrollContainer.scrollTop;
        
        if (Math.abs(scrollTop - this.lastScrollTop) > this.itemHeight / 2) {
            this.lastScrollTop = scrollTop;
            this.render();
        }
    }
    
    render() {
        const scrollTop = this.scrollContainer.scrollTop;
        const containerHeight = this.scrollContainer.clientHeight;
        
        const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize);
        const endIndex = Math.min(
            this.videos.length,
            Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize
        );
        
        this.visibleItems.forEach((element, index) => {
            if (index < startIndex || index >= endIndex) {
                element.remove();
                this.visibleItems.delete(index);
            }
        });
        
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.visibleItems.has(i)) {
                const element = this.createVideoElement(this.videos[i], i);
                this.visibleItems.set(i, element);
                this.contentWrapper.appendChild(element);
            }
        }
    }
    
    createVideoElement(video, index) {
        const isCurrentVideo = video.name === this.currentVideoName;
        const element = document.createElement('div');
        element.className = 'related-video' + (isCurrentVideo ? ' current-video' : '');
        element.style.cssText = `
            position: absolute;
            top: ${index * this.itemHeight}px;
            left: 0;
            right: 0;
            height: ${this.itemHeight}px;
            box-sizing: border-box;
        `;
        
        const currentPlaylistId = new URLSearchParams(window.location.search).get('playlist');
        let videoUrl = window.VideoID.buildVideoUrl(video.name, currentPlaylistId);
        
        const channelInitial = video.channelName ? video.channelName.charAt(0).toUpperCase() : '?';
        const avatarId = `relatedAvatar_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        const danmakuCount = video.danmakuCount || (window.DanmakuCounter ? window.DanmakuCounter.get(video.name) : 0);
        const createdDateObj = video.created ? new Date(video.created) : null;
        const dateStr = createdDateObj ? `${String(createdDateObj.getDate()).padStart(2,'0')}/${String(createdDateObj.getMonth()+1).padStart(2,'0')}/${createdDateObj.getFullYear()}` : '';
        const viewsSvg = `<svg width="12" height="12" viewBox="0 0 24 24" style="display:inline;vertical-align:-2px;"><path fill="#888" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
        const danmakuSvg = `<svg width="12" height="12" viewBox="0 0 24 24" style="display:inline;vertical-align:-2px;"><path fill="#888" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;
        const metaParts = [];
        if (dateStr) metaParts.push(dateStr);
        metaParts.push(`${viewsSvg} ${(video.views || 0).toLocaleString()}`);
        metaParts.push(`${danmakuSvg} ${danmakuCount}`);
        const relatedMetaLine = metaParts.join(' • ');
        
        element.innerHTML = `
            <a href="${videoUrl}" class="related-video-link" title="${this.escapeHtml(this.getFileNameWithoutExtension(video.name))}"></a>
            <div class="related-thumb">
                <div class="lazy-thumb loading">Загрузка...</div>
                <div class="related-duration">0:00</div>
            </div>
            <div class="related-info">
                <div class="related-title">${this.escapeHtml(this.getFileNameWithoutExtension(video.name))}</div>
                <div class="related-meta">${relatedMetaLine}</div>
                <div class="channel-row">
                    <a href="youvi_ch_view.html?channel=${encodeURIComponent(video.channelName || '')}" class="channel-link" onclick="event.stopPropagation()">
                        <div class="channel-avatar" id="${avatarId}">${channelInitial}</div>
                    </a>
                    <a href="youvi_ch_view.html?channel=${encodeURIComponent(video.channelName || '')}" class="related-channel" onclick="event.stopPropagation()">${video.channelName || (typeof i18n !== 'undefined' ? i18n.t('video.noChannel', 'No channel') : 'No channel')}</a>
                </div>
            </div>
        `;
        
        this.loadPreviewLazy(element, video);
        
        if (video.channelName) {
            requestIdleCallback(() => {
                if (window.avatarBatchLoader) {
                    window.avatarBatchLoader.load(video.channelName).then(avatarUrl => {
                        if (avatarUrl) {
                            const avatarEl = element.querySelector(`#${avatarId}`);
                            if (avatarEl) {
                                avatarEl.style.backgroundImage = `url(${avatarUrl})`;
                                avatarEl.classList.add('custom-avatar');
                                avatarEl.textContent = '';
                            }
                        }
                    }).catch(err => console.error('Avatar load error:', err));
                } else if (window.loadChannelAvatar) {
                    window.loadChannelAvatar(video.channelName).then(avatarUrl => {
                        if (avatarUrl) {
                            const avatarEl = element.querySelector(`#${avatarId}`);
                            if (avatarEl) {
                                avatarEl.style.backgroundImage = `url(${avatarUrl})`;
                                avatarEl.classList.add('custom-avatar');
                                avatarEl.textContent = '';
                            }
                        }
                    }).catch(err => console.error('Avatar load error:', err));
                }
            });
        }
        
        element.addEventListener('click', (e) => {
            if (!e.target.closest('a.channel-link')) {
                this.onVideoClick(video);
            }
        });
        
        return element;
    }
    
    loadPreviewLazy(element, video) {
        const thumbElement = element.querySelector('.related-thumb');
        const lazyElement = thumbElement?.querySelector('.lazy-thumb');
        
        if (!thumbElement || !lazyElement) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(async (entry) => {
                if (entry.isIntersecting) {
                    observer.unobserve(entry.target);
                    
                    try {
                        const { preview, duration } = await window.getPreviewAndDuration(video);
                        
                        if (preview) {
                            const img = document.createElement('img');
                            img.src = preview;
                            img.alt = video.name;
                            img.loading = 'lazy';
                            img.decoding = 'async';
                            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px;';
                            thumbElement.replaceChild(img, lazyElement);
                        } else {
                            lazyElement.className = 'lazy-thumb';
                            lazyElement.textContent = 'Нет превью';
                        }
                        
                        const durationElement = thumbElement.querySelector('.related-duration');
                        if (durationElement && duration) {
                            durationElement.textContent = duration;
                        }
                    } catch (error) {
                        console.log('Error loading preview for', video.name, error);
                        lazyElement.className = 'lazy-thumb';
                        lazyElement.textContent = 'Ошибка';
                    }
                }
            });
        }, {
            root: this.scrollContainer,
            rootMargin: '100px',
            threshold: 0.01
        });
        
        observer.observe(thumbElement);
    }
    
    scrollToCurrentVideo() {
        const currentIndex = this.videos.findIndex(v => v.name === this.currentVideoName);
        if (currentIndex !== -1) {
            const scrollTop = currentIndex * this.itemHeight - (this.scrollContainer.clientHeight / 2) + (this.itemHeight / 2);
            this.scrollContainer.scrollTop = Math.max(0, scrollTop);
        }
    }
    
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        this.visibleItems.clear();
        this.container.innerHTML = '';
    }
    
    escapeHtml(text) {
        return window.escapeHtml ? window.escapeHtml(text) : text;
    }
    
    getFileNameWithoutExtension(name) {
        return window.getFileNameWithoutExtension ? window.getFileNameWithoutExtension(name) : name;
    }
}

window.VirtualPlaylistRenderer = VirtualPlaylistRenderer;
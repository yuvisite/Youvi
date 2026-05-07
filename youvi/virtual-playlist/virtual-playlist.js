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
        this.itemHeights = [];
        this.itemOffsets = [];
        this.lastScrollTop = 0;
        this.rafId = null;
        this.resizeObserver = null;
        this.lastWidth = 0;
        
        this.init();
    }
    
    init() {
        this.container.classList.add('virtual-playlist-container');
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

        // Add ResizeObserver to handle visibility and window resizing
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const width = entry.contentRect.width;
                    const height = entry.contentRect.height;
                    
                    // Only re-measure if width changed significantly or if we just became visible
                    if ((width > 0 && Math.abs(width - this.lastWidth) > 5) || (width > 0 && this.lastWidth === 0)) {
                        this.lastWidth = width;
                        this.refresh();
                    }
                }
            });
            this.resizeObserver.observe(this.container);
        }
    }
    
    refresh() {
        if (!this.videos || this.videos.length === 0) return;
        
        const totalHeight = this.measureItemHeights();
        this.contentWrapper.style.height = `${totalHeight}px`;
        this.render();
    }
    
    setVideos(videos, currentVideoName) {
        this.videos = videos;
        this.currentVideoName = currentVideoName;
        this.contentWrapper.innerHTML = '';
        this.visibleItems.clear();
        this.lastWidth = this.container.clientWidth;

        this.refresh();
        this.scrollToCurrentVideo();
    }

    measureItemHeights() {
        this.itemHeights = [];
        this.itemOffsets = [];

        if (!Array.isArray(this.videos) || this.videos.length === 0) {
            return 0;
        }

        let totalHeight = 0;
        for (let i = 0; i < this.videos.length; i++) {
            const probe = this.createVideoElement(this.videos[i], i, { measureOnly: true });
            probe.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                visibility: hidden;
                pointer-events: none;
                box-sizing: border-box;
                z-index: -1000;
            `;
            this.contentWrapper.appendChild(probe);

            const measuredHeight = probe.offsetHeight;
            probe.remove();

            // If we can't measure (hidden), use the fallback but don't save it as the final height yet
            const height = (measuredHeight > 0) ? measuredHeight : this.itemHeight;
            
            this.itemOffsets.push(totalHeight);
            this.itemHeights.push(height);
            totalHeight += height;
        }

        if (this.itemHeights.length > 0 && totalHeight > 0) {
            const avgHeight = Math.round(totalHeight / this.itemHeights.length);
            if (avgHeight > 0) {
                this.itemHeight = avgHeight;
            }
        }

        return totalHeight;
    }
    
    handleScroll() {
        const scrollTop = this.scrollContainer.scrollTop;

        if (Math.abs(scrollTop - this.lastScrollTop) > Math.max(24, this.itemHeight / 2)) {
            this.lastScrollTop = scrollTop;
            this.render();
        }
    }
    
    render(force = false) {
        const scrollTop = this.scrollContainer.scrollTop;
        const containerHeight = this.scrollContainer.clientHeight;

        const startIndex = Math.max(0, this.findIndexAtOffset(scrollTop) - this.bufferSize);
        const endIndex = Math.min(
            this.videos.length,
            this.findIndexAtOffset(scrollTop + containerHeight) + this.bufferSize + 1
        );
        
        this.visibleItems.forEach((element, index) => {
            if (index < startIndex || index >= endIndex || force) {
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
    
    createVideoElement(video, index, options = {}) {
        const isCurrentVideo = video.name === this.currentVideoName;
        const element = document.createElement('div');
        element.className = 'related-video' + (isCurrentVideo ? ' current-video' : '');
        element.style.cssText = options.measureOnly
            ? `position: relative; left: 0; right: 0; box-sizing: border-box;`
            : `position: absolute; top: ${this.getItemOffset(index)}px; left: 0; right: 0; height: ${this.getItemHeight(index)}px; box-sizing: border-box;`;
        
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
        const ratingBadgeHtml = (typeof window.getVideoRatingBadgeHtmlForVideo === 'function')
            ? window.getVideoRatingBadgeHtmlForVideo(video)
            : '';
        
        element.innerHTML = `
            <a href="${videoUrl}" class="related-video-link" title="${this.escapeHtml(this.getFileNameWithoutExtension(video.name))}"></a>
            <div class="related-thumb">
                <div class="lazy-thumb loading">Загрузка...</div>
                <div class="related-duration">0:00</div>
                ${ratingBadgeHtml}
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
        
        if (!options.measureOnly) {
            this.loadPreviewLazy(element, video);
        }
        
        if (!options.measureOnly && video.channelName) {
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
        
        if (!options.measureOnly) {
            element.addEventListener('click', (e) => {
                if (!e.target.closest('a.channel-link')) {
                    this.onVideoClick(video);
                }
            });
        }
        
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
            const itemOffset = this.getItemOffset(currentIndex);
            const itemHeight = this.getItemHeight(currentIndex);
            const scrollTop = itemOffset - (this.scrollContainer.clientHeight / 2) + (itemHeight / 2);
            this.scrollContainer.scrollTop = Math.max(0, scrollTop);
        }
    }

    getItemHeight(index) {
        return this.itemHeights[index] || this.itemHeight;
    }

    getItemOffset(index) {
        return this.itemOffsets[index] || 0;
    }

    findIndexAtOffset(offset) {
        if (!this.itemOffsets.length) {
            return 0;
        }

        let low = 0;
        let high = this.itemOffsets.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const start = this.itemOffsets[mid];
            const end = start + this.getItemHeight(mid);

            if (offset < start) {
                high = mid - 1;
            } else if (offset >= end) {
                low = mid + 1;
            } else {
                return mid;
            }
        }

        return Math.min(this.itemOffsets.length - 1, Math.max(0, low));
    }
    
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
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

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
 * Video Meta Tags Module (100% Local)
 * Updates Open Graph meta tags for rich bookmark/share previews
 * Works entirely client-side with File System Access API
 * 
 * Usage: Call VideoMetaTags.updateFromVideo(currentVideo, previewDataUrl) after loading video
 */

const VIDEO_META_DEBUG = false;

const VideoMetaTags = {
    siteName: 'Youvi',
    siteDescription: 'Youvi - сайт для просмотра видео контента. Сохраняйте, категоризируйте и смотрите видео. Система тегов с цветокодированием, алиасами, импликациями, 14 типами; булевый поиск. Комментарии с вложенностью, данмаку, продвинутый плеер, аудиодорожки.',
    
    /**
     * Initialize meta tags (call once on page load)
     */
    init() {
        const requiredTags = [
            { property: 'og:type', content: 'video.other' },
            { property: 'og:site_name', content: this.siteName },
            { property: 'og:title', content: '' },
            { property: 'og:description', content: '' },
            { property: 'og:image', content: '' },
            { property: 'og:url', content: window.location.href },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: '' },
            { name: 'twitter:description', content: '' },
            { name: 'twitter:image', content: '' },
            { name: 'description', content: '' }
        ];
        
        requiredTags.forEach(tag => {
            const selector = tag.property 
                ? `meta[property="${tag.property}"]` 
                : `meta[name="${tag.name}"]`;
            
            if (!document.querySelector(selector)) {
                const meta = document.createElement('meta');
                if (tag.property) meta.setAttribute('property', tag.property);
                if (tag.name) meta.setAttribute('name', tag.name);
                meta.setAttribute('content', tag.content);
                document.head.appendChild(meta);
            }
        });
    },
    
    /**
     * Update meta tags from currentVideo object (Youvi format)
     * @param {Object} video - currentVideo object from Youvi
     * @param {string} [previewDataUrl] - Base64 preview image (data:image/...)
     */
    updateFromVideo(video, previewDataUrl) {
        if (!video) return;
        
        const title = video.title || this.getFileNameWithoutExtension(video.name) || 'Видео';
        
        const tags = this.formatTags(video.tags || video.categories);
        
        const description = this.buildDescription(video, tags);
        
        const thumbnail = previewDataUrl || '';
        
        const url = window.location.href;
        
        const videoEl = document.getElementById('video');
        const playIndicator = (videoEl && !videoEl.paused) ? '▶ ' : '';
        document.title = `${playIndicator}${title} | ${this.siteName}`;
        
        this.setMeta('og:title', title);
        this.setMeta('og:description', description);
        this.setMeta('og:image', thumbnail);
        this.setMeta('og:url', url);
        
        this.setMeta('twitter:title', title, 'name');
        this.setMeta('twitter:description', description, 'name');
        this.setMeta('twitter:image', thumbnail, 'name');
        
        this.setMeta('description', description, 'name');
        
        if (VIDEO_META_DEBUG) console.log('[VideoMetaTags] Updated:', { title, description, hasPreview: !!thumbnail });
    },
    
    /**
     * Set meta tag content
     */
    setMeta(key, content, attr = 'property') {
        const selector = attr === 'property' 
            ? `meta[property="${key}"]` 
            : `meta[name="${key}"]`;
        let meta = document.querySelector(selector);
        if (!meta) {
            meta = document.createElement('meta');
            if (attr === 'property') meta.setAttribute('property', key);
            else meta.setAttribute('name', key);
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', content || '');
    },
    
    /**
     * Format tags array to string
     */
    formatTags(tags) {
        if (!tags) return '';
        if (Array.isArray(tags)) {
            const filtered = tags.filter(t => !String(t).endsWith(' (ка)'));
            return filtered.slice(0, 8).join(', ');
        }
        return String(tags);
    },
    
    /**
     * Build description string matching the screenshot format
     */
    buildDescription(video, tags) {
        const parts = [];
        
        if (tags) {
            parts.push(tags);
        }
        
        let channel = video.channelName || '';
        if (!channel && Array.isArray(video.tags)) {
            const channelTag = video.tags.find(t => String(t).endsWith(' (ка)'));
            if (channelTag) {
                channel = String(channelTag).replace(' (ка)', '');
            }
        }
        if (channel) {
            parts.push(`Канал: ${channel}`);
        }
        
        parts.push(this.siteDescription);
        
        return parts.join(' — ');
    },
    
    /**
     * Remove file extension from filename
     */
    getFileNameWithoutExtension(filename) {
        if (!filename) return '';
        return filename.replace(/\.[^/.]+$/, '');
    },
    
    /**
     * Capture preview from video element as data URL
     * @param {HTMLVideoElement} videoEl - Video element
     * @returns {string} Base64 data URL
     */
    capturePreview(videoEl) {
        try {
            if (!videoEl || !videoEl.videoWidth) return '';
            const canvas = document.createElement('canvas');
            const w = 640, h = 360;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            
            const vw = videoEl.videoWidth;
            const vh = videoEl.videoHeight;
            const ar = vw / vh;
            
            let dw = w, dh = h;
            if (w / h > ar) {
                dw = h * ar;
            } else {
                dh = w / ar;
            }
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(videoEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
            
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (e) {
            if (VIDEO_META_DEBUG) console.warn('[VideoMetaTags] Preview capture failed:', e);
            return '';
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VideoMetaTags.init());
} else {
    VideoMetaTags.init();
}

window.VideoMetaTags = VideoMetaTags;
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

(function(window) {
    'use strict';
    
    class ImageViewer {
        constructor() {
            this.currentOverlay = null;
            this.init();
        }
        
        init() {
            this.addCSS();
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.currentOverlay) {
                    this.close();
                }
            });
        }
        
        addCSS() {
            if (document.querySelector('#image-viewer-styles')) {
                return;
            }
            
            const style = document.createElement('style');
            style.id = 'image-viewer-styles';
            style.textContent = `
                .img-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.95);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    cursor: pointer;
                    animation: fadeIn 0.2s ease-in-out;
                }
                
                .img-carousel-main {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    padding: 80px 120px 140px;
                    position: relative;
                }
                
                .img-carousel-image {
                    max-width: 100%;
                    max-height: 100%;
                    border-radius: 0;
                    box-shadow: none;
                    cursor: default;
                    transition: transform 0.3s ease;
                    object-fit: contain;
                    display: block;
                    margin: 0 auto;
                }
                
                .img-overlay-close {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.5);
                    color: white;
                    border: none;
                    width: 40px;
                    height: 40px;
                    cursor: pointer;
                    font-size: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    font-weight: 300;
                    line-height: 1;
                    border-radius: 50%;
                    transition: background 0.2s;
                }
                
                .img-overlay-close:hover {
                    background: rgba(0, 0, 0, 0.8);
                }
                
                .img-carousel-caption {
                    position: absolute;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    max-width: 60%;
                    text-align: center;
                    word-break: break-word;
                    white-space: pre-line;
                    z-index: 10001;
                }
                
                .img-carousel-nav {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(0, 0, 0, 0.5);
                    color: white;
                    border: none;
                    width: 50px;
                    height: 50px;
                    cursor: pointer;
                    font-size: 48px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    border-radius: 50%;
                    transition: background 0.2s;
                    font-weight: 300;
                    line-height: 1;
                }
                
                .img-carousel-nav:hover {
                    background: rgba(0, 0, 0, 0.8);
                }
                
                .img-carousel-prev {
                    left: 20px;
                }
                
                .img-carousel-next {
                    right: 20px;
                }
                
                .img-carousel-thumbs {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    display: flex;
                    gap: 8px;
                    padding: 8px;
                    background: rgba(0, 0, 0, 0.7);
                    border-radius: 8px;
                    z-index: 10001;
                    max-width: 90%;
                    overflow-x: auto;
                }
                
                .img-carousel-thumbs::-webkit-scrollbar {
                    height: 4px;
                }
                
                .img-carousel-thumbs::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                }
                
                .img-carousel-thumbs::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 2px;
                }
                
                .img-carousel-thumbs::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.5);
                }
                
                .img-carousel-thumb {
                    width: 60px;
                    height: 60px;
                    border-radius: 4px;
                    overflow: hidden;
                    cursor: pointer;
                    border: 2px solid transparent;
                    transition: border-color 0.2s;
                    flex-shrink: 0;
                }
                
                .img-carousel-thumb:hover {
                    border-color: rgba(255, 255, 255, 0.5);
                }
                
                .img-carousel-thumb.active {
                    border-color: #ff69b4;
                }
                
                .img-carousel-thumb img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                
                .img-carousel-actions {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    display: flex;
                    gap: 8px;
                    z-index: 10001;
                }
                
                .img-carousel-action-btn {
                    width: 40px;
                    height: 40px;
                    background: rgba(0, 0, 0, 0.5);
                    color: white;
                    border: none;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: background 0.2s;
                }
                
                .img-carousel-action-btn:hover {
                    background: rgba(0, 0, 0, 0.8);
                }
                
                .img-carousel-action-btn svg {
                    width: 20px;
                    height: 20px;
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                
                body.dark-theme .img-overlay {
                    background: rgba(0, 0, 0, 0.95);
                }
                
                @media (max-width: 768px) {
                    .img-carousel-main {
                        padding: 60px 20px 120px;
                    }
                    
                    .img-carousel-nav {
                        width: 40px;
                        height: 40px;
                        font-size: 36px;
                    }
                    
                    .img-carousel-prev {
                        left: 10px;
                    }
                    
                    .img-carousel-next {
                        right: 10px;
                    }
                    
                    .img-carousel-caption {
                        max-width: 80%;
                        font-size: 12px;
                    }
                    
                    .img-carousel-thumbs {
                        bottom: 10px;
                        padding: 6px;
                        gap: 6px;
                    }
                    
                    .img-carousel-thumb {
                        width: 50px;
                        height: 50px;
                    }
                    
                    .img-carousel-actions {
                        bottom: 10px;
                        right: 10px;
                    }
                }
            `;
            
            document.head.appendChild(style);
        }
        
        /**
         * Show image in fullscreen overlay
         * @param {string} imageUrl - URL of the image to display
         * @param {string} [title] - Optional title/caption for the image
         * @param {string} [alt] - Optional alt text for the image
         */
        show(imageUrl, title = '', alt = '') {
            this.open([{src: imageUrl, caption: title, alt: alt}], 0);
        }
        
        /**
         * Open image carousel viewer
         * @param {Array} images - Array of image objects {src, caption, metadata}
         * @param {number} startIndex - Index of image to show first
         */
        open(images, startIndex = 0) {
            this.close();
            
            this.images = images;
            this.currentIndex = startIndex;
            
            const overlay = document.createElement('div');
            overlay.className = 'img-overlay img-carousel-overlay';
            
            const imgContainer = document.createElement('div');
            imgContainer.className = 'img-carousel-main';
            
            const img = document.createElement('img');
            img.className = 'img-carousel-image';
            img.src = images[startIndex].src;
            img.alt = images[startIndex].alt || images[startIndex].caption || 'Изображение';
            
            imgContainer.appendChild(img);
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'img-overlay-close';
            closeBtn.innerHTML = '×';
            closeBtn.title = 'Закрыть (Escape)';
            
            const captionPanel = document.createElement('div');
            captionPanel.className = 'img-carousel-caption';
            this.updateCaption(captionPanel, images[startIndex]);
            
            let prevBtn = null, nextBtn = null;
            if (images.length > 1) {
                prevBtn = document.createElement('button');
                prevBtn.className = 'img-carousel-nav img-carousel-prev';
                prevBtn.innerHTML = '‹';
                prevBtn.title = 'Предыдущее (←)';
                
                nextBtn = document.createElement('button');
                nextBtn.className = 'img-carousel-nav img-carousel-next';
                nextBtn.innerHTML = '›';
                nextBtn.title = 'Следующее (→)';
            }
            
            const thumbCarousel = document.createElement('div');
            thumbCarousel.className = 'img-carousel-thumbs';
            this.renderThumbnails(thumbCarousel, images, startIndex);
            
            const actionsPanel = document.createElement('div');
            actionsPanel.className = 'img-carousel-actions';
            
            const rotateBtn = document.createElement('button');
            rotateBtn.className = 'img-carousel-action-btn';
            rotateBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
            `;
            rotateBtn.title = 'Повернуть';
            
            const hasMessageIdx = images.some(img => typeof img.metadata?.messageIdx !== 'undefined');
            let showInChatBtn = null;
            if (hasMessageIdx) {
                showInChatBtn = document.createElement('button');
                showInChatBtn.className = 'img-carousel-action-btn';
                showInChatBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                `;
                showInChatBtn.title = 'Открыть в чате';
            }
            
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'img-carousel-action-btn';
            downloadBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            `;
            downloadBtn.title = 'Сохранить как';
            
            actionsPanel.appendChild(rotateBtn);
            if (showInChatBtn) actionsPanel.appendChild(showInChatBtn);
            actionsPanel.appendChild(downloadBtn);
            
            overlay.appendChild(imgContainer);
            overlay.appendChild(closeBtn);
            overlay.appendChild(captionPanel);
            if (prevBtn) overlay.appendChild(prevBtn);
            if (nextBtn) overlay.appendChild(nextBtn);
            overlay.appendChild(thumbCarousel);
            overlay.appendChild(actionsPanel);
            
            const closeHandler = () => this.close();
            
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target === imgContainer) {
                    closeHandler();
                }
            });
            
            closeBtn.addEventListener('click', closeHandler);
            
            img.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.navigate(-1);
                });
            }
            
            if (nextBtn) {
                nextBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.navigate(1);
                });
            }
            
            let rotation = 0;
            rotateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                rotation += 90;
                img.style.transform = `rotate(${rotation}deg)`;
            });
            
            if (showInChatBtn) {
                showInChatBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showInChat(images[this.currentIndex]);
                });
            }
            
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveImageAs(images[this.currentIndex]);
            });
            
            const keyHandler = (e) => {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.navigate(-1);
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.navigate(1);
                }
            };
            document.addEventListener('keydown', keyHandler);
            overlay._keyHandler = keyHandler;
            
            document.body.appendChild(overlay);
            this.currentOverlay = overlay;
            
            document.body.style.overflow = 'hidden';
        }
        
        navigate(direction) {
            if (!this.images || this.images.length <= 1) return;
            
            this.currentIndex = (this.currentIndex + direction + this.images.length) % this.images.length;
            
            const img = this.currentOverlay.querySelector('.img-carousel-image');
            const caption = this.currentOverlay.querySelector('.img-carousel-caption');
            const thumbCarousel = this.currentOverlay.querySelector('.img-carousel-thumbs');
            
            if (img) {
                img.src = this.images[this.currentIndex].src;
                img.alt = this.images[this.currentIndex].alt || this.images[this.currentIndex].caption || 'Изображение';
                img.style.transform = '';
            }
            
            if (caption) {
                this.updateCaption(caption, this.images[this.currentIndex]);
            }
            
            if (thumbCarousel) {
                this.renderThumbnails(thumbCarousel, this.images, this.currentIndex);
            }
        }
        
        updateCaption(captionEl, imageData) {
            if (!captionEl) return;
            
            let captionText = imageData.caption || '';
            
            if (imageData.metadata) {
                const meta = imageData.metadata;
                if (meta.index && meta.total) {
                    captionText = `${meta.index}/${meta.total}` + (captionText ? ` • ${captionText}` : '');
                }
            }
            
            captionEl.textContent = captionText;
            captionEl.style.display = captionText ? 'block' : 'none';
        }
        
        renderThumbnails(container, images, currentIndex) {
            container.innerHTML = '';
            
            const maxVisible = 7;
            let startIdx = Math.max(0, currentIndex - Math.floor(maxVisible / 2));
            let endIdx = Math.min(images.length, startIdx + maxVisible);
            
            if (endIdx - startIdx < maxVisible) {
                startIdx = Math.max(0, endIdx - maxVisible);
            }
            
            for (let i = startIdx; i < endIdx; i++) {
                const thumb = document.createElement('div');
                thumb.className = 'img-carousel-thumb' + (i === currentIndex ? ' active' : '');
                
                const thumbImg = document.createElement('img');
                thumbImg.src = images[i].src;
                thumbImg.alt = '';
                
                thumb.appendChild(thumbImg);
                thumb.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.currentIndex = i;
                    this.navigate(0);
                });
                
                container.appendChild(thumb);
            }
        }
        
        showInChat(imageData) {
            this.close();
            
            if (imageData.metadata && typeof imageData.metadata.messageIdx !== 'undefined') {
                const chatBody = document.getElementById('chatBody');
                const targetMsg = chatBody?.querySelector(`[data-message-idx="${imageData.metadata.messageIdx}"]`);
                
                if (targetMsg && chatBody) {
                    const chatBodyRect = chatBody.getBoundingClientRect();
                    const targetRect = targetMsg.getBoundingClientRect();
                    const relativeTop = targetRect.top - chatBodyRect.top + chatBody.scrollTop;
                    const scrollTo = relativeTop - (chatBody.clientHeight / 2) + (targetRect.height / 2);
                    
                    chatBody.scrollTo({ top: scrollTo, behavior: 'smooth' });
                    
                    targetMsg.style.background = 'rgba(255, 105, 180, 0.2)';
                    setTimeout(() => { targetMsg.style.background = ''; }, 1500);
                }
            }
        }
        
        async saveImageAs(imageData) {
            const filename = imageData.metadata?.filename || 'image.jpg';
            const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
            
            const mimeTypes = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp'
            };
            const mimeType = mimeTypes[ext] || 'image/jpeg';
            
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Image',
                        accept: { [mimeType]: ['.' + ext] }
                    }]
                });
                
                const response = await fetch(imageData.src);
                const blob = await response.blob();
                
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (e) {
                if (e.name !== 'AbortError') {
                    const link = document.createElement('a');
                    link.href = imageData.src;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            }
        }
        
        /**
         * Close the current overlay
         */
        close() {
            if (this.currentOverlay) {
                if (this.currentOverlay._keyHandler) {
                    document.removeEventListener('keydown', this.currentOverlay._keyHandler);
                }
                
                document.body.removeChild(this.currentOverlay);
                this.currentOverlay = null;
                this.images = null;
                this.currentIndex = 0;
                
                document.body.style.overflow = '';
            }
        }
        
        /**
         * Check if overlay is currently open
         * @returns {boolean}
         */
        isOpen() {
            return this.currentOverlay !== null;
        }
        
        /**
         * Make an image element clickable for fullscreen view
         * @param {HTMLImageElement} imgElement - Image element to make clickable
         * @param {string} [title] - Optional title for the fullscreen view
         */
        makeClickable(imgElement, title = '') {
            if (!imgElement || imgElement.tagName !== 'IMG') {
                console.warn('ImageViewer.makeClickable: Element is not an image');
                return;
            }
            
            imgElement.style.cursor = 'pointer';
            imgElement.title = title || 'Нажмите для увеличения';
            
            const clickHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const imageUrl = imgElement.src || imgElement.dataset.src;
                const imageTitle = title || imgElement.alt || imgElement.title || '';
                
                this.show(imageUrl, imageTitle, imgElement.alt);
            };
            
            imgElement.addEventListener('click', clickHandler);
            
            imgElement._imageViewerHandler = clickHandler;
        }
        
        /**
         * Remove clickable functionality from an image
         * @param {HTMLImageElement} imgElement - Image element to remove functionality from
         */
        removeClickable(imgElement) {
            if (!imgElement || imgElement.tagName !== 'IMG') {
                return;
            }
            
            imgElement.style.cursor = '';
            imgElement.title = '';
            
            if (imgElement._imageViewerHandler) {
                imgElement.removeEventListener('click', imgElement._imageViewerHandler);
                delete imgElement._imageViewerHandler;
            }
        }
        
        /**
         * Auto-setup all images with data-fullscreen attribute
         */
        autoSetup() {
            const images = document.querySelectorAll('img[data-fullscreen]');
            images.forEach(img => {
                const title = img.dataset.fullscreenTitle || img.alt || '';
                this.makeClickable(img, title);
            });
        }
    }
    
    if (typeof window !== 'undefined') {
        window.imageViewer = window.imageViewer || new ImageViewer();
        window.ImageViewer = window.imageViewer;
    }
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ImageViewer;
    }
    
})(window);
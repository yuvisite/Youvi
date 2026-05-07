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
    
    const selectedImages = [];
    const replyImages = new Map();
    const nestedReplyImages = new Map();
    
    function initCommentImages() {
        setupMainCommentImages();
        setupReplyImageHandlers();
        setupImageModal();
    }
    
    function setupMainCommentImages() {
        const insertImageBtn = document.getElementById('insertImageBtn');
        const imageFileInput = document.getElementById('imageFileInput');
        
        if (insertImageBtn && imageFileInput) {
            insertImageBtn.addEventListener('click', function(e) {
                e.preventDefault();
                imageFileInput.click();
            });
            
            imageFileInput.addEventListener('change', function(e) {
                handleImageSelection(e.target.files);
            });
        }
    }
    
    function handleImageSelection(files) {
        if (!files || files.length === 0) return;
        
        const commentText = document.getElementById('commentText');
        if (!commentText) return;
        
        let previewContainer = document.getElementById('mainCommentImagePreview');
        if (!previewContainer) {
            previewContainer = document.createElement('div');
            previewContainer.id = 'mainCommentImagePreview';
            previewContainer.className = 'comment-image-preview';
            previewContainer.style.display = 'none';
            commentText.parentNode.insertBefore(previewContainer, commentText.nextSibling);
        }
        
        previewContainer.style.display = 'flex';
        
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageData = e.target.result;
                
                selectedImages.push({
                    dataUrl: imageData,
                    file: file
                });
                
                const previewItem = document.createElement('div');
                previewItem.className = 'comment-image-preview-item';
                previewItem.innerHTML = `
                    <img src="${imageData}" alt="Preview">
                    <button class="remove-image" data-index="${selectedImages.length - 1}">×</button>
                `;
                
                previewItem.querySelector('.remove-image').addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    selectedImages.splice(index, 1);
                    previewItem.remove();
                    
                    if (selectedImages.length === 0 && previewContainer) {
                        previewContainer.style.display = 'none';
                    }
                });
                
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        });
        
        document.getElementById('imageFileInput').value = '';
    }
    
    function setupReplyImageHandlers() {
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('reply-image-input')) {
                const commentId = e.target.id.replace('replyImageInput_', '');
                handleReplyImageSelection(commentId, e.target.files);
                e.target.value = '';
            }
            
            if (e.target.classList.contains('nested-reply-image-input')) {
                const replyId = e.target.id.replace('nestedReplyImageInput_', '');
                handleNestedReplyImageSelection(replyId, e.target.files);
                e.target.value = '';
            }
        });
    }
    
    function handleReplyImageSelection(commentId, files) {
        if (!files || files.length === 0) return;
        
        let previewContainer = document.getElementById(`replyImagePreview_${commentId}`);
        if (!previewContainer) return;
        
        previewContainer.style.display = 'flex';
        
        if (!replyImages.has(commentId)) {
            replyImages.set(commentId, []);
        }
        
        const images = replyImages.get(commentId);
        
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageData = e.target.result;
                
                images.push({
                    dataUrl: imageData,
                    file: file
                });
                
                const previewItem = document.createElement('div');
                previewItem.className = 'comment-image-preview-item';
                previewItem.innerHTML = `
                    <img src="${imageData}" alt="Preview">
                    <button class="remove-image" data-index="${images.length - 1}">×</button>
                `;
                
                previewItem.querySelector('.remove-image').addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    images.splice(index, 1);
                    previewItem.remove();
                    
                    if (images.length === 0) {
                        previewContainer.style.display = 'none';
                    }
                });
                
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        });
    }
    
    function handleNestedReplyImageSelection(replyId, files) {
        if (!files || files.length === 0) return;
        
        let previewContainer = document.getElementById(`nestedReplyImagePreview_${replyId}`);
        if (!previewContainer) return;
        
        previewContainer.style.display = 'flex';
        
        if (!nestedReplyImages.has(replyId)) {
            nestedReplyImages.set(replyId, []);
        }
        
        const images = nestedReplyImages.get(replyId);
        
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageData = e.target.result;
                
                images.push({
                    dataUrl: imageData,
                    file: file
                });
                
                const previewItem = document.createElement('div');
                previewItem.className = 'comment-image-preview-item';
                previewItem.innerHTML = `
                    <img src="${imageData}" alt="Preview">
                    <button class="remove-image" data-index="${images.length - 1}">×</button>
                `;
                
                previewItem.querySelector('.remove-image').addEventListener('click', function() {
                    const index = parseInt(this.getAttribute('data-index'));
                    images.splice(index, 1);
                    previewItem.remove();
                    
                    if (images.length === 0) {
                        previewContainer.style.display = 'none';
                    }
                });
                
                previewContainer.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        });
    }
    
    function insertReplyImage(commentId) {
        const input = document.getElementById(`replyImageInput_${commentId}`);
        if (input) {
            input.click();
        }
    }
    
    function insertNestedReplyImage(replyId) {
        const input = document.getElementById(`nestedReplyImageInput_${replyId}`);
        if (input) {
            input.click();
        }
    }
    
    function getSelectedImages() {
        return [...selectedImages];
    }
    
    function getReplyImages(commentId) {
        const images = replyImages.get(commentId) || [];
        replyImages.delete(commentId);
        return images;
    }
    
    function getNestedReplyImages(replyId) {
        const images = nestedReplyImages.get(replyId) || [];
        nestedReplyImages.delete(replyId);
        return images;
    }
    
    function clearSelectedImages() {
        selectedImages.length = 0;
        const previewContainer = document.getElementById('mainCommentImagePreview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.style.display = 'none';
        }
    }
    
    function clearPreviewContainer(selector) {
        const container = document.querySelector(selector);
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }
    
    function clearReplyPreview(commentId) {
        clearPreviewContainer(`#replyImagePreview_${commentId}`);
    }
    
    function clearNestedReplyPreview(replyId) {
        clearPreviewContainer(`#nestedReplyImagePreview_${replyId}`);
    }
    
    function openImageModal(src) {
        const modal = document.getElementById('imageModal');
        const modalImage = document.getElementById('modalImage');
        
        if (modal && modalImage) {
            modalImage.src = src;
            modal.style.display = 'flex';
        }
    }
    
    function setupImageModal() {
        const modal = document.getElementById('imageModal');
        const closeBtn = modal ? modal.querySelector('.close') : null;
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                modal.style.display = 'none';
            });
        }
        
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });
    }
    
    window.CommentImages = {
        init: initCommentImages,
        insertReplyImage: insertReplyImage,
        insertNestedReplyImage: insertNestedReplyImage,
        getSelectedImages: getSelectedImages,
        getReplyImages: getReplyImages,
        getNestedReplyImages: getNestedReplyImages,
        clearSelectedImages: clearSelectedImages,
        clearReplyPreview: clearReplyPreview,
        clearNestedReplyPreview: clearNestedReplyPreview,
        openImageModal: openImageModal
    };
    
})(window);
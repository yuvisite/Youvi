// Image crop functionality
class ImageCropper {
    constructor(imageFile, onComplete) {
        this.imageFile = imageFile;
        this.onComplete = onComplete;
        this.image = null;
        this.canvas = null;
        this.ctx = null;
        this.scale = 1;
        this.rotation = 0;
        this.cropX = 0;
        this.cropY = 0;
        this.cropSize = 300;
        this.isDragging = false;
        this.isResizing = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.startCropX = 0;
        this.startCropY = 0;
        this.startCropSize = 0;
        
        this.init();
    }
    
    init() {
        this.createModal();
        this.loadImage();
    }
    
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'crop-modal';
        modal.innerHTML = `
            <div class="crop-container">
                <div class="crop-header">
                    <h3>Обрезать изображение</h3>
                    <button class="modal-close" id="cropClose">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                
                <div class="crop-canvas-wrapper">
                    <canvas id="cropCanvas" class="crop-canvas"></canvas>
                    <div class="crop-overlay">
                        <div class="crop-selection" id="cropSelection">
                            <div class="crop-handle nw" data-handle="nw"></div>
                            <div class="crop-handle ne" data-handle="ne"></div>
                            <div class="crop-handle sw" data-handle="sw"></div>
                            <div class="crop-handle se" data-handle="se"></div>
                        </div>
                    </div>
                </div>
                
                <div class="crop-controls">
                    <div class="crop-control-group">
                        <label>Масштаб</label>
                        <input type="range" class="crop-slider" id="scaleSlider" min="100" max="300" value="100">
                        <span class="crop-value" id="scaleValue">100%</span>
                    </div>
                    <div class="crop-control-group">
                        <label>Размер</label>
                        <input type="range" class="crop-slider" id="sizeSlider" min="100" max="400" value="300">
                        <span class="crop-value" id="sizeValue">300px</span>
                    </div>
                </div>
                
                <div class="crop-footer">
                    <button class="btn" id="cropCancel">Отмена</button>
                    <button class="btn btn-primary" id="cropApply">Применить</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.modal = modal;
        this.canvas = document.getElementById('cropCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.selection = document.getElementById('cropSelection');
        
        this.setupEvents();
    }
    
    loadImage() {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.image = new Image();
            this.image.onload = () => {
                this.setupCanvas();
                this.render();
            };
            this.image.src = e.target.result;
        };
        reader.readAsDataURL(this.imageFile);
    }
    
    setupCanvas() {
        const maxSize = 512;
        let width = this.image.width;
        let height = this.image.height;
        
        if (width > height) {
            if (width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            }
        } else {
            if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
        }
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvasWidth = width;
        this.canvasHeight = height;
        
        // Set initial crop size to fit within image
        const minDimension = Math.min(width, height);
        this.cropSize = Math.min(300, minDimension);
        
        // Update size slider
        const sizeSlider = document.getElementById('sizeSlider');
        sizeSlider.max = minDimension;
        sizeSlider.value = Math.round(this.cropSize);
        document.getElementById('sizeValue').textContent = Math.round(this.cropSize) + 'px';
        
        // Center crop area
        this.cropX = (width - this.cropSize) / 2;
        this.cropY = (height - this.cropSize) / 2;
        
        this.updateSelection();
    }
    
    setupEvents() {
        // Close buttons
        document.getElementById('cropClose').addEventListener('click', () => this.close());
        document.getElementById('cropCancel').addEventListener('click', () => this.close());
        
        // Apply button
        document.getElementById('cropApply').addEventListener('click', () => this.apply());
        
        // Scale slider
        const scaleSlider = document.getElementById('scaleSlider');
        scaleSlider.addEventListener('input', (e) => {
            this.scale = e.target.value / 100;
            document.getElementById('scaleValue').textContent = e.target.value + '%';
            this.render();
        });
        
        // Size slider
        const sizeSlider = document.getElementById('sizeSlider');
        sizeSlider.addEventListener('input', (e) => {
            const requestedSize = parseInt(e.target.value);
            // Constrain to canvas size
            const maxSize = Math.min(this.canvasWidth, this.canvasHeight);
            this.cropSize = Math.min(requestedSize, maxSize);
            // Ensure crop area stays within bounds
            this.cropX = Math.max(0, Math.min(this.cropX, this.canvasWidth - this.cropSize));
            this.cropY = Math.max(0, Math.min(this.cropY, this.canvasHeight - this.cropSize));
            document.getElementById('sizeValue').textContent = Math.round(this.cropSize) + 'px';
            this.updateSelection();
        });
        
        // Drag selection
        let activeHandle = null;
        
        // Handle dragging
        document.querySelectorAll('.crop-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                activeHandle = e.target.dataset.handle;
                this.isDragging = false;
                this.isResizing = true;
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.startCropX = this.cropX;
                this.startCropY = this.cropY;
                this.startCropSize = this.cropSize;
            });
        });
        
        this.selection.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) return;
            e.stopPropagation();
            this.isDragging = true;
            this.isResizing = false;
            // Store offset from mouse to crop position
            const rect = this.canvas.getBoundingClientRect();
            const canvasX = e.clientX - rect.left;
            const canvasY = e.clientY - rect.top;
            this.dragOffsetX = canvasX - this.cropX;
            this.dragOffsetY = canvasY - this.cropY;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isResizing && activeHandle) {
                const deltaX = e.clientX - this.dragStartX;
                const deltaY = e.clientY - this.dragStartY;
                
                if (activeHandle === 'se') {
                    // Bottom-right: increase size
                    const maxSize = Math.min(this.canvasWidth - this.startCropX, this.canvasHeight - this.startCropY);
                    const newSize = Math.max(100, Math.min(maxSize, this.startCropSize + Math.max(deltaX, deltaY)));
                    this.cropSize = newSize;
                } else if (activeHandle === 'nw') {
                    // Top-left: move and decrease size
                    const delta = Math.min(deltaX, deltaY);
                    const maxDelta = Math.min(this.startCropX, this.startCropY);
                    const constrainedDelta = Math.max(-this.startCropSize + 100, Math.min(maxDelta, delta));
                    const newSize = this.startCropSize - constrainedDelta;
                    this.cropSize = newSize;
                    this.cropX = this.startCropX + constrainedDelta;
                    this.cropY = this.startCropY + constrainedDelta;
                } else if (activeHandle === 'ne') {
                    // Top-right: increase width, decrease height
                    const maxWidth = this.canvasWidth - this.startCropX;
                    const maxHeight = this.startCropY + this.startCropSize;
                    const delta = Math.max(deltaX, -deltaY);
                    const maxSize = Math.min(maxWidth, maxHeight);
                    const newSize = Math.max(100, Math.min(maxSize, this.startCropSize + delta));
                    this.cropSize = newSize;
                    this.cropY = this.startCropY + this.startCropSize - newSize;
                } else if (activeHandle === 'sw') {
                    // Bottom-left: decrease width, increase height
                    const maxWidth = this.startCropX + this.startCropSize;
                    const maxHeight = this.canvasHeight - this.startCropY;
                    const delta = Math.max(-deltaX, deltaY);
                    const maxSize = Math.min(maxWidth, maxHeight);
                    const newSize = Math.max(100, Math.min(maxSize, this.startCropSize + delta));
                    this.cropSize = newSize;
                    this.cropX = this.startCropX + this.startCropSize - newSize;
                }
                
                // Constrain to canvas
                this.cropX = Math.max(0, Math.min(this.cropX, this.canvasWidth - this.cropSize));
                this.cropY = Math.max(0, Math.min(this.cropY, this.canvasHeight - this.cropSize));
                
                document.getElementById('sizeSlider').value = Math.round(this.cropSize);
                document.getElementById('sizeValue').textContent = Math.round(this.cropSize) + 'px';
                this.updateSelection();
            } else if (this.isDragging) {
                const rect = this.canvas.getBoundingClientRect();
                const canvasX = e.clientX - rect.left;
                const canvasY = e.clientY - rect.top;
                
                const newX = canvasX - this.dragOffsetX;
                const newY = canvasY - this.dragOffsetY;
                
                this.cropX = Math.max(0, Math.min(newX, this.canvasWidth - this.cropSize));
                this.cropY = Math.max(0, Math.min(newY, this.canvasHeight - this.cropSize));
                
                this.updateSelection();
            }
        });
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.isResizing = false;
            activeHandle = null;
        });
    }
    
    updateSelection() {
        this.selection.style.left = this.cropX + 'px';
        this.selection.style.top = this.cropY + 'px';
        this.selection.style.width = this.cropSize + 'px';
        this.selection.style.height = this.cropSize + 'px';
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const scaledWidth = this.canvasWidth * this.scale;
        const scaledHeight = this.canvasHeight * this.scale;
        const offsetX = (this.canvasWidth - scaledWidth) / 2;
        const offsetY = (this.canvasHeight - scaledHeight) / 2;
        
        this.ctx.drawImage(this.image, offsetX, offsetY, scaledWidth, scaledHeight);
    }
    
    apply() {
        // Create final cropped image
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = 512;
        cropCanvas.height = 512;
        const cropCtx = cropCanvas.getContext('2d');
        
        // Calculate source coordinates
        const scaledWidth = this.canvasWidth * this.scale;
        const scaledHeight = this.canvasHeight * this.scale;
        const offsetX = (this.canvasWidth - scaledWidth) / 2;
        const offsetY = (this.canvasHeight - scaledHeight) / 2;
        
        const sourceX = (this.cropX - offsetX) / this.scale;
        const sourceY = (this.cropY - offsetY) / this.scale;
        const sourceSize = this.cropSize / this.scale;
        
        cropCtx.drawImage(
            this.image,
            sourceX, sourceY, sourceSize, sourceSize,
            0, 0, 512, 512
        );
        
        cropCanvas.toBlob((blob) => {
            this.onComplete(blob);
            this.close();
        }, this.imageFile.type, 0.9);
    }
    
    close() {
        this.modal.remove();
    }
}

// Export for use in other files
window.ImageCropper = ImageCropper;

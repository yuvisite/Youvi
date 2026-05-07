# YouVi Hover Preview System

A modular hover preview system for video cards that provides smooth video previews when users hover over video thumbnails.

## Files Structure

```
youvi/hover/
├── hover-preview-queue.js    # Queue management system
├── hover-preview.js          # Core hover functionality
├── hover-init.js            # Initialization utilities
├── hover-bundle.js          # Bundle with global exposure
├── hover-includes.html      # HTML include helper
└── README.md               # This documentation
```

## Quick Start

### Option 1: Include All Files
```html
<script src="youvi/hover/hover-preview-queue.js"></script>
<script src="youvi/hover/hover-preview.js"></script>
<script src="youvi/hover/hover-init.js"></script>
<script src="youvi/hover/hover-bundle.js"></script>
```

### Option 2: Use Bundle (Recommended)
```html
<script src="youvi/hover/hover-preview-queue.js"></script>
<script src="youvi/hover/hover-preview.js"></script>
<script src="youvi/hover/hover-init.js"></script>
<script src="youvi/hover/hover-bundle.js"></script>
```

## Usage Examples

### Basic Usage - Single Video Card
```javascript
// Add hover preview to a single video thumbnail
const thumbnailElement = document.querySelector('.video-thumbnail');
const videoData = {
  name: 'video.mp4',
  file: videoFileObject,  // File object from FileSystem API
  handle: videoHandle     // DirectoryHandle from FileSystem API
};

addHoverPreview(thumbnailElement, videoData);
```

### Carousel Videos
```javascript
// Initialize hover for carousel videos
const videosData = [
  { name: 'video1.mp4', file: file1, handle: handle1 },
  { name: 'video2.mp4', file: file2, handle: handle2 }
];

initCarouselHoverPreviews('carousel-id', videosData);
```

### Grid Videos
```javascript
// Initialize hover for grid layout
initGridHoverPreviews('grid-id', videosData);
```

### Auto-Detection
```javascript
// Automatically detect and initialize all video cards in a container
autoInitHoverPreviews('container-id', videosData);
```

### Advanced Configuration
```javascript
// Custom configuration options
const options = {
  hoverDelay: 500,        // Delay before preview starts (ms)
  segmentDuration: 4,     // Duration of each preview segment (seconds)
  segmentCount: 8,        // Number of preview segments
  borderRadius: '6px',    // Border radius for video element
  longVideoThreshold: 1800, // Threshold for long video handling (seconds)
  maxBaseOffset: 600      // Maximum base offset for long videos (seconds)
};

addHoverPreview(thumbnailElement, videoData, options);
```

## 🚀 Performance Optimizations

### Long Video Optimization
The system includes several optimizations for videos longer than 30 minutes:

- **preload='none'**: Videos don't preload metadata, reducing initial loading time
- **Quick Start**: For long videos with known duration, segments are pre-calculated and playback starts immediately  
- **Metadata Timeout**: If metadata loading takes too long (>2 seconds), fallback to estimated segments
- **Seek Timeout**: If video seeking gets stuck (>3 seconds), automatically skip to next segment
- **Reduced Delays**: First segment delays are reduced for long videos (8s max instead of 20s)
- **Fast Recovery**: Errors are handled quickly with 300ms recovery instead of 1000ms

### Performance Configuration
```javascript
const optimizedConfig = {
  hoverDelay: 500,
  segmentDuration: 4,
  segmentCount: 8,
  longVideoThreshold: 1800, // 30 minutes
  maxBaseOffset: 600, // 10 minutes
  seekTimeout: 3000, // 3 seconds timeout for seeks
  metadataTimeout: 2000, // 2 seconds timeout for metadata
  estimatedDuration: null // Can provide to skip metadata loading entirely
};

addHoverPreview(thumbnailElement, videoData, optimizedConfig);
```

### Using Presets
```javascript
// Use predefined configuration presets
YouViHover.addHoverPreview(thumbnailElement, videoData, YouViHover.presets.fast);
YouViHover.addHoverPreview(thumbnailElement, videoData, YouViHover.presets.slow);
```

### Batch Initialization
```javascript
// Initialize multiple containers at once
const containers = [
  {
    type: 'carousel',
    containerId: 'carousel-1',
    videosData: carousel1Videos,
    options: { hoverDelay: 300 }
  },
  {
    type: 'grid',
    containerId: 'latest-grid',
    videosData: gridVideos
  }
];

batchInitHoverPreviews(containers);
```

## Integration with Existing Pages

### For youvi_main.html
Replace the inline hover code with:

```html
<!-- Include hover system -->
<script src="youvi/hover/hover-preview-queue.js"></script>
<script src="youvi/hover/hover-preview.js"></script>
<script src="youvi/hover/hover-init.js"></script>
<script src="youvi/hover/hover-bundle.js"></script>

<script>
// In renderPlaylistCarousel function, replace hover code with:
if (videoWithMetadata.file && videoWithMetadata.handle) {
  addHoverPreview(link, videoWithMetadata);
}

// In renderLatestVideos function, replace hover code with:
if (videoData && videoData.file && videoData.handle) {
  addHoverPreview(thumb, videoData);
}

// In render functions, replace cleanup code with:
clearAllHoverPreviews();
</script>
```

### For screen_video.html and other pages
```javascript
// Initialize after video cards are rendered
document.addEventListener('DOMContentLoaded', function() {
  // Auto-detect and initialize hover previews
  autoInitHoverPreviews('video-container', videosDataArray);
});
```

## API Reference

### Core Functions

#### `addHoverPreview(thumbElement, videoData, options)`
Adds hover preview functionality to a single video thumbnail.

**Parameters:**
- `thumbElement` (HTMLElement) - The thumbnail element to add hover to
- `videoData` (Object) - Video data containing file and handle
- `options` (Object) - Configuration options (optional)

#### `clearAllHoverPreviews()`
Clears all active hover previews and resets the queue.

### Initialization Functions

#### `initCarouselHoverPreviews(carouselId, videosData, options)`
Initialize hover previews for carousel videos.

#### `initGridHoverPreviews(gridId, videosData, options)`
Initialize hover previews for grid layout videos.

#### `autoInitHoverPreviews(containerId, videosData, options)`
Auto-detect and initialize hover previews for all video cards in a container.

### Utility Functions

#### `initHoverWithCleanup(initFunction, ...args)`
Initialize hover previews with automatic cleanup of existing previews.

#### `batchInitHoverPreviews(containers, globalOptions)`
Initialize multiple containers with hover previews in batch.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hoverDelay` | Number | 500 | Delay before preview starts (milliseconds) |
| `segmentDuration` | Number | 4 | Duration of each preview segment (seconds) |
| `segmentCount` | Number | 8 | Number of preview segments to generate |
| `borderRadius` | String | '6px' | Border radius for video preview element |
| `longVideoThreshold` | Number | 1800 | Threshold for long video special handling (seconds) |
| `maxBaseOffset` | Number | 600 | Maximum base offset for long videos (seconds) |

## Browser Support

- Chrome/Edge (File System Access API required)
- Modern browsers with Video API support
- ES6+ features used (arrow functions, const/let, etc.)

## Performance Considerations

- Only one hover preview plays at a time (queue management)
- Video elements are properly cleaned up on mouse leave
- Memory leaks prevented through proper URL.revokeObjectURL() calls
- Segment calculation optimized for different video lengths

## Troubleshooting

### Common Issues

1. **Hover previews don't work**: Ensure video data contains valid `file` and `handle` objects
2. **Multiple videos playing**: Queue system should prevent this - check for conflicts
3. **Memory issues**: Ensure `clearAllHoverPreviews()` is called when navigating/re-rendering

### Debug Mode

Enable debug logging:
```javascript
// Add to console to see hover preview activity
window.DEBUG_HOVER = true;
```

## Migration Guide

### From Inline Code
1. Remove inline hover code from HTML files
2. Include hover system files
3. Replace hover initialization calls
4. Update cleanup calls in render functions

### From index.html Style
The system is designed to be compatible with index.html hover functionality. Simply replace the inline code with function calls.
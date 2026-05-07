# Drag-to-Seek Module

A video player enhancement that allows users to seek through video content by clicking and dragging horizontally within the player area.

## Features

- **Proportional Seeking**: Mouse position corresponds directly to video position
  - At 60% of player width → seeks to 60% of video duration
  - At 25% of player width → seeks to 25% of video duration
- **Visual Feedback**: Real-time preview showing target time and direction
- **Smart Detection**: Automatically ignores clicks on controls and interactive elements
- **Smooth Experience**: Video pauses during drag, resumes after (if it was playing)
- **Directional Indicators**: 
  - Green arrow for seeking forward
  - Orange arrow for seeking backward

## Usage

### Automatic Initialization

The module automatically initializes when the page loads, looking for:
- Video element with id `video` or any `<video>` tag
- Container element with class `.video-container` or `.video-player`

### Manual Initialization

```javascript
const video = document.getElementById('video');
const container = document.querySelector('.video-container');
const dragSeek = new DragSeek(video, container);
```

### Cleanup

```javascript
dragSeek.destroy();
```

## How It Works

1. **User clicks** inside the video player (not on controls)
2. **Module activates** drag mode and pauses video
3. **User drags** mouse left or right
4. **Preview indicator** shows target time at mouse position
5. **Video seeks** to position proportional to mouse X coordinate
6. **User releases** mouse button
7. **Video resumes** playback (if it was playing before)

## Files

- `drag-seek.js` - Main module logic
- `drag-seek.css` - Styling for visual feedback
- `README.md` - This documentation

## Integration

Add to your HTML:

```html
<!-- In <head> -->
<link rel="preload" href="player/drag-seek/drag-seek.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="player/drag-seek/drag-seek.css"></noscript>

<!-- Before </body> -->
<script src="player/drag-seek/drag-seek.js"></script>
```

## Compatibility

- Works with standard HTML5 video elements
- Compatible with existing video controls
- Responsive and works in fullscreen mode
- No external dependencies required

## Browser Support

- Chrome/Edge: ✅
- Firefox: ✅
- Safari: ✅
- Opera: ✅

## Notes

- The module automatically avoids conflicts with existing controls
- Dragging only works when video metadata is loaded
- Z-index ensures preview appears above video content
- User selection is disabled during drag to prevent text selection

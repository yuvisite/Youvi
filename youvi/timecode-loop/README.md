# Timecode Loop Module

Provides context menu functionality for timecodes using existing AB repeat system.

## Features

- **Right-click context menu** on timecodes in descriptions and comments
- **Loop timecode segments** (10 seconds around clicked timecode)
- **Exit active loops** via context menu
- **Integrates with existing AB repeat system** (Shift+click on progress bar)
- **Smart click handling**: Shows context menu when loop is active, otherwise seeks normally

## How It Works

The module uses the existing AB repeat system:
- **Shift+click on progress bar**: Set A point → Set B point → Reset (3-click cycle)
- **Right-click on timecode**: Shows context menu with loop options
- **Left-click on timecode**: 
  - If loop active: Shows context menu
  - If no loop: Seeks to timecode

## Files

- `timecode-loop.js` - Main module logic
- `timecode-loop.css` - Context menu styling
- `README.md` - This file

## Global Functions

The module exposes these functions:

- `window.showTimecodeContextMenu(event, timecodeElement)` - Show context menu
- `window.hideTimecodeContextMenu()` - Hide context menu
- `window.setTimecodeLoop(timecodeElement)` - Set 10-second loop around timecode
- `window.exitTimecodeLoop()` - Exit current loop (resets AB segments)
- `window.handleTimecodeClick(event, timecodeElement)` - Smart click handler

## Dependencies

Requires these global variables (set by main video player):
- `window.abSegmentA` - AB repeat start time
- `window.abSegmentB` - AB repeat end time
- `window.abSegmentMode` - AB repeat mode (0=off, 1=setting A, 2=active loop, 3=reset)
- `window.updateABMarkers()` - Update AB markers on progress bar
- `window.seekToTime(seconds)` - Seek video to time
- `window.formatDuration(seconds)` - Format time display (optional)

## Integration

Add to HTML:
```html
<link rel="stylesheet" href="youvi/timecode-loop/timecode-loop.css">
<script src="youvi/timecode-loop/timecode-loop.js"></script>

<!-- Context Menu HTML (before </body>) -->
<div id="timecodeContextMenu" class="timecode-context-menu">
    <button class="timecode-context-menu-item" data-action="loop">Зациклить</button>
    <button class="timecode-context-menu-item" data-action="exit-loop">Выйти из цикла</button>
</div>
```

Attach to timecodes:
```javascript
// Left click
timecodeElement.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.handleTimecodeClick(e, timecodeElement);
});

// Right click
timecodeElement.addEventListener('contextmenu', (e) => {
    window.showTimecodeContextMenu(e, timecodeElement);
});
```

## Context Menu Behavior

- **When no loop is active**: Shows only "Зациклить" option
- **When loop is active**: Shows both "Зациклить" (to change loop) and "Выйти из цикла" options
- **Auto-hides** on: click outside, scroll, or after selecting an option

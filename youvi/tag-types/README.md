# Tag Types Module

A modular tag system with type validation and color coding for video tags.

## Features

- **Type-based validation**: All tags must have a type designation
- **Color coding**: Each tag type has a unique soft color with white text
- **SVG Icons**: Each tag has a visual icon for quick identification
- **Channel tag handling**: Special handling for channel tags (not displayed)
- **Validation**: Prevents invalid tags and enforces rules (e.g., only one channel tag)
- **Simple hover effect**: Subtle opacity change on hover

## Tag Types

| Type Code | Name | Color | Display | Description |
|-----------|------|-------|---------|-------------|
| `(ка)` | channel | Gray | No | Channel/Author tag (hidden from display) |
| `(gt)` | general_tag | Gray | Yes | General purpose tags |
| `(ch)` | character | Soft Green | Yes | Character names |
| `(au)` | author | Soft Red/Pink | Yes | Author/Artist names |
| `(ge)` | genre | Soft Blue | Yes | Genre classification |
| `(tp)` | type | Soft Orange | Yes | Content type |
| `(yr)` | year | Soft Yellow/Gold | Yes | Year of release |
| `(st)` | studio | Soft Red | Yes | Production studio |
| `(ct)` | category | Soft Cyan | Yes | Category classification |
| `(ra)` | rating | Soft Pink | Yes | Content rating |
| `(at)` | anime_title | Soft Purple | Yes | Anime title/franchise |
| `(ser)` | serial_title | Soft Blue | Yes | TV series title/franchise |
| `(mt)` | movie_title | Soft Brown/Gold | Yes | Movie title/franchise |
| `(nat)` | animation_title | Soft Green | Yes | Non-anime animation title/franchise |

## Usage

### Include in HTML

```html
<link rel="stylesheet" href="youvi/tag-types/tag-types.css">
<script src="youvi/tag-types/tag-types.js"></script>
```

### Tag Format

All tags must follow the format: `Name (type)`

Examples:
- `HDanime7 (ка)` - Channel tag
- `Action (ge)` - Genre tag
- `Naruto (ch)` - Character tag
- `Studio Ghibli (st)` - Studio tag
- `2024 (yr)` - Year tag
- `Naruto Shippuden (at)` - Anime title tag
- `Breaking Bad (ser)` - Serial title tag
- `Inception (mt)` - Movie title tag
- `Toy Story (nat)` - Animation title tag

### JavaScript API

```javascript
// Parse a single tag
const parsed = TagTypes.parseTag("Action (ge)");
// Returns: {content: "Action", typeCode: "ge", type: "genre", display: true, color: "#1e3a8a", ...}

// Validate an array of tags
const validation = TagTypes.validateTags([
    "Channel Name (ка)",
    "Action (ge)",
    "Invalid Tag"  // This will fail
]);
// Returns: {valid: false, errors: [...], parsedTags: [...]}

// Render tags as HTML (default: 24 tags max)
const html = TagTypes.renderTags([
    "Action (ge)",
    "Naruto (ch)",
    "2024 (yr)"
]);

// Render with custom limit
const htmlLimited = TagTypes.renderTags(tags, 50); // Show up to 50 tags

// Get channel name from tags
const channel = TagTypes.getChannelFromTags([
    "My Channel (ка)",
    "Action (ge)"
]);
// Returns: "My Channel"

// Get displayable tags (excludes channel tags)
const displayTags = TagTypes.getDisplayableTags([
    "My Channel (ка)",
    "Action (ge)"
]);
// Returns: ["Action (ge)"]
```

## Validation Rules

1. **Format Required**: All tags must be in format `Name (type)`
2. **Valid Type Code**: Type code must be one of the defined types
3. **Single Channel Tag**: Only one channel tag `(ка)` is allowed per video
4. **No Plain Tags**: Tags without type designation are rejected

## Integration Example

```javascript
// In tag save handler
const newTags = input.value.split(',').map(t => t.trim()).filter(t => t);

// Validate tags
const validation = TagTypes.validateTags(newTags);

if (!validation.valid) {
    alert('Invalid tags:\n' + validation.errors.join('\n'));
    return;
}

// Save and render
await saveVideoMetadata(handle, name, {tags: newTags});
const html = TagTypes.renderTags(newTags);
tagsContainer.innerHTML = html;
```

## Color Palette

The color palette uses softer, more readable colors with white text and SVG icons:

- **Darker Gray** (#6b7280): Neutral/General
- **Soft Green** (#6b9e4d): Characters
- **Soft Red/Pink** (#ef6c7d): Authors/Artists
- **Soft Blue** (#6b9bd1): Genres
- **Soft Orange** (#f59e6c): Types
- **Soft Yellow/Gold** (#eab676): Years
- **Soft Red** (#f28b8b): Studios
- **Soft Cyan** (#67c5d6): Categories
- **Soft Pink** (#f5a3c7): Ratings
- **Soft Purple** (#a78bdb): Anime Titles
- **Soft Blue** (#8db8d6): Serial Titles
- **Soft Brown/Gold** (#d4a373): Movie Titles
- **Soft Green** (#9dd6a8): Animation Titles

Each tag includes an SVG icon on the left to help identify the tag type visually.

## Dark Theme Support

The module includes dark theme support with adjusted backgrounds for input hints and examples while maintaining tag colors for visibility.

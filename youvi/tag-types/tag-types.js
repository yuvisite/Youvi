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
 * Tag Types Module
 * Handles tag validation, parsing, and rendering with color-coded types
 */

(function() {
    'use strict';

    const TAG_TYPES = {
        'ка': {
            name: 'channel',
            color: '#9ca3af',
            display: false,
            label: 'Channel',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v2"/></svg>'
        },
        'gt': {
            name: 'general_tag',
            color: '#6b7280',
            display: true,
            label: 'General Tag',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>'
        },
        'ch': {
            name: 'character',
            color: '#6b9e4d',
            display: true,
            label: 'Character',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        },
        'au': {
            name: 'author',
            color: '#ef6c7d',
            display: true,
            label: 'Author/Artist',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>'
        },
        'ge': {
            name: 'genre',
            color: '#6b9bd1',
            display: true,
            label: 'Genre',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
        },
        'tp': {
            name: 'type',
            color: '#f59e6c',
            display: true,
            label: 'Type',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'
        },
        'yr': {
            name: 'year',
            color: '#eab676',
            display: true,
            label: 'Year',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
        },
        'st': {
            name: 'studio',
            color: '#f28b8b',
            display: true,
            label: 'Studio',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>'
        },
        'ct': {
            name: 'category',
            color: '#67c5d6',
            display: true,
            label: 'Category',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
        },
        'ra': {
            name: 'rating',
            color: '#f5a3c7',
            display: true,
            label: 'Rating',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
        },
        'at': {
            name: 'anime_title',
            color: '#a78bdb',
            display: true,
            label: 'Anime Title',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="12" cy="12" r="2"/></svg>'
        },
        'ser': {
            name: 'serial_title',
            color: '#8db8d6',
            display: true,
            label: 'Serial Title',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
        },
        'mt': {
            name: 'movie_title',
            color: '#d4a373',
            display: true,
            label: 'Movie Title',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
        },
        'nat': {
            name: 'animation_title',
            color: '#9dd6a8',
            display: true,
            label: 'Animation Title',
            icon: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
        }
    };

    /**
     * Parse a tag string to extract type and content
     * @param {string} tagString - Tag in format "content (type)"
     * @returns {Object|null} - {type, content, typeCode, display, color} or null if invalid
     */
    function parseTag(tagString) {
        if (!tagString || typeof tagString !== 'string') {
            return null;
        }

        const trimmed = tagString.trim();
        
        const match = trimmed.match(/^(.+?)\s*\(([a-zа-я]{2,3})\)$/iu);
        
        if (!match) {
            return null;
        }

        const content = match[1].trim();
        const typeCode = match[2].toLowerCase();

        const typeInfo = TAG_TYPES[typeCode];
        if (!typeInfo) {
            return null;
        }

        return {
            content: content,
            typeCode: typeCode,
            type: typeInfo.name,
            display: typeInfo.display,
            color: typeInfo.color,
            label: typeInfo.label,
            icon: typeInfo.icon,
            fullTag: trimmed
        };
    }

    /**
     * Validate an array of tags
     * @param {Array<string>} tags - Array of tag strings
     * @returns {Object} - {valid: boolean, errors: Array<string>, parsedTags: Array}
     */
    function validateTags(tags) {
        const errors = [];
        const parsedTags = [];
        const channelTags = [];

        if (!Array.isArray(tags)) {
            return {
                valid: false,
                errors: ['Tags must be an array'],
                parsedTags: []
            };
        }

        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            const parsed = parseTag(tag);

            if (!parsed) {
                errors.push(`Invalid tag format: "${tag}". Tags must be in format "Name (type)"`);
                continue;
            }

            if (parsed.typeCode === 'ка') {
                channelTags.push(parsed);
            }

            parsedTags.push(parsed);
        }

        if (channelTags.length > 1) {
            errors.push(`Only one channel tag (ка) is allowed. Found ${channelTags.length}: ${channelTags.map(t => t.fullTag).join(', ')}`);
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            parsedTags: parsedTags
        };
    }

    /**
     * Render a single tag as HTML
     * @param {Object} parsedTag - Parsed tag object
     * @param {boolean} isLink - Whether to render as link or span
     * @returns {string} - HTML string
     */
    function renderTag(parsedTag, isLink = true) {
        if (!parsedTag || !parsedTag.display) {
            return '';
        }

        const escapedContent = escapeHtml(parsedTag.content);
        const escapedFullTag = escapeHtml(parsedTag.fullTag);
        const style = `background-color: ${parsedTag.color};`;
        const title = `${parsedTag.label}: ${escapedContent}`;
        const iconHtml = parsedTag.icon ? `<span class="tag-icon">${parsedTag.icon}</span>` : '';

        if (isLink) {
            const href = `youvi_main.html?tag=${encodeURIComponent(parsedTag.fullTag)}`;
            return `<a class="video-tag video-tag-${parsedTag.type}" href="${href}" style="${style}" title="${title}" data-tag-type="${parsedTag.typeCode}">${iconHtml}${escapedContent}</a>`;
        } else {
            return `<span class="video-tag video-tag-${parsedTag.type}" style="${style}" title="${title}" data-tag-type="${parsedTag.typeCode}">${iconHtml}${escapedContent}</span>`;
        }
    }

    /**
     * Render an array of tags as HTML
     * @param {Array<string>} tags - Array of tag strings
     * @param {number} maxDisplay - Maximum number of tags to display (default 24)
     * @param {boolean} asLinks - Whether to render as links
     * @returns {string} - HTML string
     */
    function renderTags(tags, maxDisplay = 24, asLinks = true) {
        if (!Array.isArray(tags) || tags.length === 0) {
            return '';
        }

        const parsedTags = tags
            .map(tag => parseTag(tag))
            .filter(parsed => parsed && parsed.display);

        const displayTags = parsedTags.slice(0, maxDisplay);
        
        return displayTags
            .map(parsed => renderTag(parsed, asLinks))
            .join('');
    }

    /**
     * Get channel name from tags
     * @param {Array<string>} tags - Array of tag strings
     * @returns {string} - Channel name or empty string
     */
    function getChannelFromTags(tags) {
        if (!Array.isArray(tags)) {
            return '';
        }

        const channelTag = tags
            .map(tag => parseTag(tag))
            .find(parsed => parsed && parsed.typeCode === 'ка');

        return channelTag ? channelTag.content : '';
    }

    /**
     * Filter tags for display (exclude non-displayable types)
     * @param {Array<string>} tags - Array of tag strings
     * @returns {Array<string>} - Filtered tags
     */
    function getDisplayableTags(tags) {
        if (!Array.isArray(tags)) {
            return [];
        }

        return tags.filter(tag => {
            const parsed = parseTag(tag);
            return parsed && parsed.display;
        });
    }

    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get all tag types information
     * @returns {Object} - Tag types configuration
     */
    function getTagTypes() {
        return TAG_TYPES;
    }

    window.TagTypes = {
        parseTag,
        validateTags,
        renderTag,
        renderTags,
        getChannelFromTags,
        getDisplayableTags,
        getTagTypes,
        TAG_TYPES
    };

})();
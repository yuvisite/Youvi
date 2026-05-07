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
 * Tag Database Schema Definition
 * Defines the structure and validation for the centralized tag database
 */

const TagDatabaseSchema = {
  /**
   * Current schema version for migration support
   */
  SCHEMA_VERSION: '1.0.0',

  /**
   * Tag type suffixes mapping
   */
  TAG_TYPES: {
    'ка': { prefix: 'channel:', label: 'Channel', color: '#9ca3af' },
    'gt': { prefix: 'general:', label: 'General', color: '#6b7280' },
    'ch': { prefix: 'character:', label: 'Character', color: '#6b9e4d' },
    'au': { prefix: 'author:', label: 'Author/Artist', color: '#ef6c7d' },
    'ge': { prefix: 'genre:', label: 'Genre', color: '#6b9bd1' },
    'tp': { prefix: 'type:', label: 'Type', color: '#f59e6c' },
    'yr': { prefix: 'year:', label: 'Year', color: '#eab676' },
    'st': { prefix: 'studio:', label: 'Studio', color: '#f28b8b' },
    'ct': { prefix: 'category:', label: 'Category', color: '#67c5d6' },
    'ra': { prefix: 'rating:', label: 'Rating', color: '#f5a3c7' },
    'at': { prefix: 'anime:', label: 'Anime', color: '#a78bdb' },
    'ser': { prefix: 'serial:', label: 'Serial', color: '#8db8d6' },
    'mt': { prefix: 'movie:', label: 'Movie', color: '#d4a373' },
    'nat': { prefix: 'animation:', label: 'Animation', color: '#9dd6a8' }
  },

  /**
   * Creates an empty database structure
   */
  createEmpty() {
    return {
      version: this.SCHEMA_VERSION,
      lastUpdated: Date.now(),
      tags: {},
      aliasIndex: {}
    };
  },

  /**
   * Creates a tag entry
   * @param {string} canonical - Canonical tag name (e.g., "Naruto (at)")
   * @param {object} options - Additional options
   */
  createTag(canonical, options = {}) {
    const normalized = this.normalizeTagName(canonical);
    const type = this.extractTagType(canonical);
    
    return {
      canonical: canonical,
      type: type,
      aliases: options.aliases || [],
      implies: options.implies || [],
      usageCount: options.usageCount || 0,
      createdAt: options.createdAt || Date.now(),
      color: this.getTagColor(type)
    };
  },

  /**
   * Normalizes tag name for indexing (lowercase, no extra spaces)
   * @param {string} tagName
   * @returns {string}
   */
  normalizeTagName(tagName) {
    return tagName.toLowerCase().trim().replace(/\s+/g, ' ');
  },

  /**
   * Extracts tag type suffix from tag name
   * @param {string} tagName - Tag name like "Naruto (at)"
   * @returns {string|null} - Type suffix like "at" or null
   */
  extractTagType(tagName) {
    const match = tagName.match(/\(([a-zа-я]{2,3})\)$/i);
    return match ? match[1].toLowerCase() : null;
  },

  /**
   * Gets color for tag type
   * @param {string} type - Tag type suffix
   * @returns {string} - Hex color code
   */
  getTagColor(type) {
    return this.TAG_TYPES[type]?.color || '#6b7280';
  },

  /**
   * Gets prefix for tag type
   * @param {string} type - Tag type suffix
   * @returns {string} - Search prefix like "anime:"
   */
  getTagPrefix(type) {
    return this.TAG_TYPES[type]?.prefix || '';
  },

  /**
   * Validates database structure
   * @param {object} data - Database object to validate
   * @returns {boolean}
   */
  validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data.version || !data.lastUpdated) return false;
    if (!data.tags || typeof data.tags !== 'object') return false;
    if (!data.aliasIndex || typeof data.aliasIndex !== 'object') return false;
    return true;
  },

  /**
   * Migrates database to current schema version
   * @param {object} data - Old database structure
   * @returns {object} - Migrated database
   */
  migrate(data) {
    const migrated = {
      version: this.SCHEMA_VERSION,
      lastUpdated: data.lastUpdated || Date.now(),
      tags: data.tags || {},
      aliasIndex: data.aliasIndex || {}
    };

    Object.keys(migrated.tags).forEach(key => {
      const tag = migrated.tags[key];
      if (!tag.createdAt) tag.createdAt = Date.now();
      if (!tag.usageCount) tag.usageCount = 0;
      if (!tag.aliases) tag.aliases = [];
      if (!tag.implies) tag.implies = [];
      if (!tag.type) tag.type = this.extractTagType(tag.canonical);
      if (!tag.color) tag.color = this.getTagColor(tag.type);
    });

    return migrated;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TagDatabaseSchema;
}
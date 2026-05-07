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
﻿/**
 * Tag Alias Search Integration
 * Optimized for large tag databases (10k+ tags)
 */

const TAG_ALIAS_SEARCH_DEBUG = false;

class TagAliasSearch {
  constructor(tagDatabaseManager) {
    this.tagDB = tagDatabaseManager;
    this.aliasCache = new Map();
    this.prefixCache = new Map();
    this.cacheValid = false;
    
    if (this.tagDB) {
      this.tagDB.addEventListener(this._onDatabaseChange.bind(this));
    }
  }
  
  /**
   * Handle database changes
   */
  _onDatabaseChange(event) {
    if (['tagAdded', 'tagRemoved', 'tagAliasUpdated', 'batchCompleted', 'saved'].includes(event.event)) {
      this.cacheValid = false;
    }
  }

  /**
   * Resolve tag name from alias - O(1) exact + O(log n) prefix fallback
   * @param {string} searchTerm - Term to search
   * @returns {Array} - Array of canonical tag names
   */
  resolveAliases(searchTerm) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return [searchTerm];
    }

    this._ensureCacheBuilt();
    
    const normalized = searchTerm.toLowerCase().trim();
    
    const exactMatch = this.aliasCache.get(normalized);
    if (exactMatch) {
      return exactMatch;
    }
    
    const prefixResults = this._prefixSearch(normalized, 20);
    
    return prefixResults.length > 0 ? [...new Set(prefixResults)] : [searchTerm];
  }

  /**
   * Fast prefix search using prefix cache
   * @param {string} prefix - Search prefix
   * @param {number} limit - Max results
   * @returns {Array} - Canonical tag names
   */
  _prefixSearch(prefix, limit = 20) {
    const results = [];
    const seen = new Set();
    
    for (let len = prefix.length; len >= Math.max(1, prefix.length - 2); len--) {
      const bucket = prefix.substring(0, len);
      const keys = this.prefixCache.get(bucket);
      
      if (!keys) continue;
      
      for (const key of keys) {
        if (!key.startsWith(prefix)) continue;
        
        const canonicals = this.aliasCache.get(key);
        if (!canonicals) continue;
        
        for (const canonical of canonicals) {
          if (seen.has(canonical)) continue;
          seen.add(canonical);
          results.push(canonical);
          
          if (results.length >= limit) return results;
        }
      }
      
      if (results.length > 0) break;
    }
    
    return results;
  }

  /**
   * Expand search query to include aliases
   * @param {string} query - Original search query
   * @returns {string} - Expanded query
   */
  expandQueryWithAliases(query) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return query;
    }

    const words = query.trim().split(/\s+/);
    const expandedTerms = [];

    for (const word of words) {
      const wordLower = word.toLowerCase();
      
      if (['and', 'or', 'not', '&&', '||', '!', '&', '|', '-'].includes(wordLower) ||
          word.startsWith('"') || word.endsWith('"') || word.includes(':')) {
        expandedTerms.push(word);
        continue;
      }

      const resolvedTags = this.resolveAliases(word);
      
      if (resolvedTags.length > 1) {
        const limitedTags = resolvedTags.slice(0, 10);
        const orGroup = '(' + limitedTags.map(tag => 
          tag.replace(/\s*\([a-zа-я]{2,3}\)$/i, '')
        ).join(' OR ') + ')';
        expandedTerms.push(orGroup);
      } else if (resolvedTags.length === 1 && resolvedTags[0] !== word) {
        const canonical = resolvedTags[0].replace(/\s*\([a-zа-я]{2,3}\)$/i, '');
        expandedTerms.push(canonical);
      } else {
        expandedTerms.push(word);
      }
    }

    return expandedTerms.join(' ');
  }

  /**
   * Check if video matches by tag aliases
   * @param {object} video - Video object with tags
   * @param {string} searchTerm - Search term
   * @returns {boolean}
   */
  videoMatchesAlias(video, searchTerm) {
    if (!video.tags || !Array.isArray(video.tags)) {
      return false;
    }

    const resolvedTags = this.resolveAliases(searchTerm);
    const searchTermLower = searchTerm.toLowerCase();
    
    for (const videoTag of video.tags) {
      const videoTagLower = videoTag.toLowerCase();
      
      if (videoTagLower.includes(searchTermLower)) {
        return true;
      }
      
      for (const resolvedTag of resolvedTags) {
        if (videoTagLower.includes(resolvedTag.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get alias suggestions for autocomplete - optimized with early exit
   * @param {string} partial - Partial term
   * @param {number} limit - Max suggestions
   * @returns {Array} - Array of suggestion objects
   */
  getAliasSuggestions(partial, limit = 10) {
    if (!this.tagDB || !this.tagDB.isLoaded || !partial) {
      return [];
    }

    this._ensureCacheBuilt();
    
    const normalized = partial.toLowerCase().trim();
    const suggestions = [];
    const seenCanonicals = new Set();
    
    const prefixLen = Math.min(normalized.length, 3);
    const prefixKey = normalized.substring(0, prefixLen);
    const relevantKeys = this.prefixCache.get(prefixKey) || new Set();
    
    for (const key of relevantKeys) {
      if (!key.includes(normalized)) continue;
      
      const canonicals = this.aliasCache.get(key);
      if (!canonicals) continue;
      
      for (const canonical of canonicals) {
        if (seenCanonicals.has(canonical)) continue;
        seenCanonicals.add(canonical);
        
        const tag = this.tagDB.getTag(canonical);
        if (!tag) continue;
        
        suggestions.push({
          text: key === canonical.toLowerCase() ? canonical : key,
          isAlias: key !== canonical.toLowerCase(),
          canonical: canonical,
          usageCount: tag.usageCount || 0
        });
        
        if (suggestions.length >= limit * 3) break;
      }
      
      if (suggestions.length >= limit * 3) break;
    }

    suggestions.sort((a, b) => {
      const aExact = a.text.toLowerCase() === normalized ? 1 : 0;
      const bExact = b.text.toLowerCase() === normalized ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      
      const aStarts = a.text.toLowerCase().startsWith(normalized) ? 1 : 0;
      const bStarts = b.text.toLowerCase().startsWith(normalized) ? 1 : 0;
      if (aStarts !== bStarts) return bStarts - aStarts;
      
      return b.usageCount - a.usageCount;
    });

    return suggestions.slice(0, limit);
  }

  /**
   * Build alias lookup cache with prefix indexing
   */
  _ensureCacheBuilt() {
    if (this.cacheValid) return;
    
    if (!this.tagDB || !this.tagDB.isLoaded) return;

    this.aliasCache.clear();
    this.prefixCache.clear();
    
    const allTags = this.tagDB.getAllTags();

    for (const tag of allTags) {
      const canonical = tag.canonical.toLowerCase();
      
      this._addToCache(canonical, tag.canonical);

      if (tag.aliases && Array.isArray(tag.aliases)) {
        for (const alias of tag.aliases) {
          const aliasLower = alias.toLowerCase();
          this._addToCache(aliasLower, tag.canonical);
        }
      }
    }

    this.cacheValid = true;
  }
  
  /**
   * Add entry to both alias cache and prefix cache
   * @param {string} key - Lowercase key (alias or canonical)
   * @param {string} canonical - Canonical tag name
   */
  _addToCache(key, canonical) {
    if (!this.aliasCache.has(key)) {
      this.aliasCache.set(key, []);
    }
    this.aliasCache.get(key).push(canonical);
    
    for (let len = 1; len <= Math.min(4, key.length); len++) {
      const prefix = key.substring(0, len);
      if (!this.prefixCache.has(prefix)) {
        this.prefixCache.set(prefix, new Set());
      }
      this.prefixCache.get(prefix).add(key);
    }
  }

  /**
   * Fast alias lookup - O(1)
   * @param {string} term - Term to look up
   * @returns {Array} - Array of canonical tags
   */
  fastLookup(term) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return [term];
    }
    
    this._ensureCacheBuilt();
    
    const normalized = term.toLowerCase().trim();
    return this.aliasCache.get(normalized) || [term];
  }
  
  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      aliasCount: this.aliasCache.size,
      prefixBuckets: this.prefixCache.size,
      isValid: this.cacheValid,
      avgPrefixSize: this.prefixCache.size > 0 
        ? Array.from(this.prefixCache.values()).reduce((sum, set) => sum + set.size, 0) / this.prefixCache.size 
        : 0
    };
  }
}

window.TagAliasSearch = TagAliasSearch;

let tagAliasSearch = null;

function initTagAliasSearch() {
  if (window.tagDatabaseManager && window.tagDatabaseManager.isLoaded) {
    tagAliasSearch = new TagAliasSearch(window.tagDatabaseManager);
    window.tagAliasSearch = tagAliasSearch;
    if (TAG_ALIAS_SEARCH_DEBUG) console.log('[TagAliasSearch] ✅ Initialized');
    document.dispatchEvent(new CustomEvent('tagAliasSearchReady'));
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!initTagAliasSearch()) {
    const dbReadyListener = () => {
      if (initTagAliasSearch()) {
        document.removeEventListener('tagDatabaseReady', dbReadyListener);
      }
    };
    document.addEventListener('tagDatabaseReady', dbReadyListener);
    
    setTimeout(() => {
      if (!window.tagAliasSearch) {
        initTagAliasSearch();
      }
    }, 1000);
  }
});
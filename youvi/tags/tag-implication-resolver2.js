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
 * Tag Implication Resolver
 * Handles transitive closure computation and cycle detection for tag implications
 * Optimized for performance with caching and minimal redundant operations
 */

class TagImplicationResolver {
  constructor(tagDatabaseManager) {
    this.tagDB = tagDatabaseManager;
    this.implicationCache = new Map();
    this.directImplicationsCache = new Map();
    this.cacheValid = false;
    
    this._boundOnChange = this._onDatabaseChange.bind(this);
    
    if (this.tagDB) {
      this.tagDB.addEventListener(this._boundOnChange);
    }
    
    console.log('[TagImplicationResolver] ✅ Initialized');
  }
  
  /**
   * Cleanup method to prevent memory leaks
   */
  destroy() {
    if (this.tagDB && this._boundOnChange) {
      this.tagDB.removeEventListener(this._boundOnChange);
    }
    this.implicationCache.clear();
    this.directImplicationsCache.clear();
  }
  
  /**
   * Handle database changes
   */
  _onDatabaseChange(event) {
    if (['tagAdded', 'tagRemoved', 'tagImplicationUpdated', 'batchCompleted', 'saved'].includes(event.event)) {
      this.cacheValid = false;
    }
  }

  /**
   * Normalize tag name (internal helper)
   * @private
   */
  _normalize(tagName) {
    return window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(tagName) : 
      tagName.toLowerCase();
  }

  /**
   * Resolve all implications for a tag (with transitive closure)
   * @param {string} tagName - Tag name to resolve
   * @returns {Set} - Set of all implied tag names (canonical)
   */
  resolveImplications(tagName) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return new Set();
    }

    this._ensureCacheBuilt();
    
    const tag = this.tagDB.getTag(tagName);
    if (!tag) {
      return new Set();
    }

    const normalized = this._normalize(tag.canonical);
    return this.implicationCache.get(normalized) || new Set();
  }

  /**
   * Resolve implications using pre-normalized key (internal optimization)
   * @private
   */
  _resolveImplicationsNormalized(normalizedTag) {
    return this.implicationCache.get(normalizedTag) || new Set();
  }

  /**
   * Get direct implications only (no transitive closure)
   * @param {string} tagName - Tag name
   * @returns {Array} - Array of directly implied tag names
   */
  getDirectImplications(tagName) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return [];
    }

    const tag = this.tagDB.getTag(tagName);
    if (!tag) {
      return [];
    }

    return tag.implies || [];
  }

  /**
   * Compute transitive closure for all tags using DFS with cycle detection
   */
  _ensureCacheBuilt() {
    if (this.cacheValid) return;
    
    if (!this.tagDB || !this.tagDB.isLoaded) return;

    console.log('[TagImplicationResolver] 🔄 Building implication cache...');
    const startTime = performance.now();

    this.implicationCache.clear();
    this.directImplicationsCache.clear();
    
    const allTags = this.tagDB.getAllTags();

    for (const tag of allTags) {
      const normalized = this._normalize(tag.canonical);
      const directImplies = tag.implies || [];
      
      this.directImplicationsCache.set(
        normalized, 
        new Set(directImplies.map(t => this._normalize(t)))
      );
    }

    const visited = new Set();
    
    for (const tag of allTags) {
      const normalized = this._normalize(tag.canonical);
      
      if (!visited.has(normalized)) {
        const closure = this._computeTransitiveClosure(normalized, visited, new Set());
        this.implicationCache.set(normalized, closure);
      }
    }

    this.cacheValid = true;
    const duration = performance.now() - startTime;
    console.log(`[TagImplicationResolver] ✅ Cache built in ${duration.toFixed(2)}ms - ${allTags.length} tags processed`);
  }

  /**
   * Compute transitive closure for a single tag using DFS
   * @param {string} tagNormalized - Normalized tag name
   * @param {Set} visited - Set of visited tags (for cycle detection)
   * @param {Set} currentPath - Current path in DFS (for cycle detection)
   * @returns {Set} - Set of all implied tags
   */
  _computeTransitiveClosure(tagNormalized, visited, currentPath) {
    if (currentPath.has(tagNormalized)) {
      console.warn('[TagImplicationResolver] ⚠️ Cycle detected at:', tagNormalized);
      this.implicationCache.set(tagNormalized, new Set());
      visited.add(tagNormalized);
      return new Set();
    }

    if (visited.has(tagNormalized)) {
      return this.implicationCache.get(tagNormalized) || new Set();
    }

    visited.add(tagNormalized);
    currentPath.add(tagNormalized);

    const result = new Set();
    const directImplies = this.directImplicationsCache.get(tagNormalized);

    if (directImplies && directImplies.size > 0) {
      for (const impliedTag of directImplies) {
        result.add(impliedTag);
        
        const transitive = this._computeTransitiveClosure(impliedTag, visited, new Set(currentPath));
        
        if (transitive.size > 0) {
          for (const t of transitive) {
            result.add(t);
          }
        }
      }
    }

    currentPath.delete(tagNormalized);
    
    this.implicationCache.set(tagNormalized, result);
    
    return result;
  }

  /**
   * Resolve implications for multiple tags at once
   * @param {Array} tagNames - Array of tag names
   * @returns {Set} - Set of all implied tags (union)
   */
  resolveImplicationsBatch(tagNames) {
    if (!Array.isArray(tagNames) || tagNames.length === 0) {
      return new Set();
    }

    this._ensureCacheBuilt();

    const allImplied = new Set();
    
    for (const tagName of tagNames) {
      const tag = this.tagDB.getTag(tagName);
      if (!tag) continue;
      
      const normalized = this._normalize(tag.canonical);
      const implied = this._resolveImplicationsNormalized(normalized);
      
      for (const t of implied) {
        allImplied.add(t);
      }
    }

    return allImplied;
  }

  /**
   * Check if adding an implication would create a cycle
   * @param {string} fromTag - Source tag
   * @param {string} toTag - Target tag to imply
   * @returns {boolean} - True if cycle would be created
   */
  wouldCreateCycle(fromTag, toTag) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return false;
    }

    const fromTagData = this.tagDB.getTag(fromTag);
    const toTagData = this.tagDB.getTag(toTag);
    
    if (!fromTagData || !toTagData) {
      return false;
    }

    const fromNormalized = this._normalize(fromTagData.canonical);
    const toNormalized = this._normalize(toTagData.canonical);

    if (fromNormalized === toNormalized) {
      return true;
    }

    this._ensureCacheBuilt();

    const toImplications = this._resolveImplicationsNormalized(toNormalized);
    return toImplications.has(fromNormalized);
  }

  /**
   * Get all tags that would be affected by adding/removing an implication
   * @param {string} tagName - Tag name
   * @returns {Array} - Array of affected tag names
   */
  getAffectedTags(tagName) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return [];
    }

    const tag = this.tagDB.getTag(tagName);
    if (!tag) {
      return [];
    }

    const normalized = this._normalize(tag.canonical);
    this._ensureCacheBuilt();

    const affected = [];
    const allTags = this.tagDB.getAllTags();

    for (const otherTag of allTags) {
      const otherNormalized = this._normalize(otherTag.canonical);
      
      if (otherNormalized === normalized) continue;

      const implications = this._resolveImplicationsNormalized(otherNormalized);
      if (implications.has(normalized)) {
        affected.push(otherTag.canonical);
      }
    }

    return affected;
  }

  /**
   * Apply implications to a set of tags (returns expanded set)
   * Optimized for bulk operations
   * @param {Array} tags - Array of tag names
   * @returns {Array} - Array with implied tags added
   */
  applyImplications(tags) {
    if (!Array.isArray(tags)) {
      console.warn('[TagImplicationResolver] Invalid input, not an array');
      return [];
    }
    
    if (tags.length === 0) {
      return tags;
    }

    if (!this.tagDB || !this.tagDB.isLoaded) {
      console.warn('[TagImplicationResolver] Database not loaded, returning original tags');
      return tags;
    }

    this._ensureCacheBuilt();

    const expandedSet = new Set();
    let addedCount = 0;
    
    const normalizedTags = new Map();
    for (const tag of tags) {
      const tagData = this.tagDB.getTag(tag);
      if (tagData) {
        const normalized = this._normalize(tagData.canonical);
        normalizedTags.set(normalized, tagData.canonical);
        expandedSet.add(tagData.canonical);
      }
    }
    
    for (const [normalized, canonical] of normalizedTags) {
      const implied = this._resolveImplicationsNormalized(normalized);
      
      for (const impliedNormalized of implied) {
        const impliedTagData = this.tagDB.database.tags[impliedNormalized];
        if (impliedTagData && !expandedSet.has(impliedTagData.canonical)) {
          expandedSet.add(impliedTagData.canonical);
          addedCount++;
        }
      }
    }

    const result = Array.from(expandedSet);
    
    if (addedCount > 0) {
      console.log(`[TagImplicationResolver] ✅ Added ${addedCount} implied tags`);
    }
    
    return result;
  }

  /**
   * Get only newly implied tags for a specific tag (incremental update)
   * @param {string} tagName - Tag name that was added
   * @param {Set} existingTags - Set of existing tag names
   * @returns {Array} - Array of new implied tags not in existingTags
   */
  getNewImpliedTags(tagName, existingTags) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return [];
    }

    const tag = this.tagDB.getTag(tagName);
    if (!tag) {
      return [];
    }

    this._ensureCacheBuilt();

    const normalized = this._normalize(tag.canonical);
    const implied = this._resolveImplicationsNormalized(normalized);
    
    const newTags = [];
    
    for (const impliedNormalized of implied) {
      const impliedTagData = this.tagDB.database.tags[impliedNormalized];
      if (impliedTagData && !existingTags.has(impliedTagData.canonical)) {
        newTags.push(impliedTagData.canonical);
      }
    }
    
    return newTags;
  }

  /**
   * Get implication graph statistics
   * @returns {Object} - Statistics about implications
   */
  getStats() {
    this._ensureCacheBuilt();

    let totalDirectImplications = 0;
    let totalTransitiveImplications = 0;
    let maxDepth = 0;

    for (const [tag, implications] of this.implicationCache.entries()) {
      const direct = this.directImplicationsCache.get(tag) || new Set();
      totalDirectImplications += direct.size;
      totalTransitiveImplications += implications.size;
      
      if (implications.size > maxDepth) {
        maxDepth = implications.size;
      }
    }

    return {
      totalTags: this.implicationCache.size,
      totalDirectImplications,
      totalTransitiveImplications,
      maxDepth,
      avgDirectPerTag: this.implicationCache.size > 0 ? 
        (totalDirectImplications / this.implicationCache.size).toFixed(2) : 0,
      avgTransitivePerTag: this.implicationCache.size > 0 ? 
        (totalTransitiveImplications / this.implicationCache.size).toFixed(2) : 0,
      cacheValid: this.cacheValid
    };
  }

  /**
   * Invalidate cache (force rebuild on next access)
   */
  invalidateCache() {
    this.cacheValid = false;
    console.log('[TagImplicationResolver] 🔄 Cache invalidated');
  }

  /**
   * Get human-readable implication chain
   * @param {string} fromTag - Source tag
   * @param {string} toTag - Target tag
   * @returns {Array|null} - Chain of implications or null if no path
   */
  getImplicationChain(fromTag, toTag) {
    if (!this.tagDB || !this.tagDB.isLoaded) {
      return null;
    }

    const fromTagData = this.tagDB.getTag(fromTag);
    const toTagData = this.tagDB.getTag(toTag);
    
    if (!fromTagData || !toTagData) {
      return null;
    }

    const fromNormalized = this._normalize(fromTagData.canonical);
    const toNormalized = this._normalize(toTagData.canonical);

    this._ensureCacheBuilt();

    const queue = [[fromNormalized]];
    const visited = new Set([fromNormalized]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toNormalized) {
        return path.map(normalized => {
          const tag = this.tagDB.database.tags[normalized];
          return tag ? tag.canonical : normalized;
        });
      }

      const directImplies = this.directImplicationsCache.get(current);
      if (directImplies) {
        for (const next of directImplies) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push([...path, next]);
          }
        }
      }
    }

    return null;
  }
}

window.TagImplicationResolver = TagImplicationResolver;

let tagImplicationResolver = null;

function initTagImplicationResolver() {
  if (window.tagDatabaseManager && window.tagDatabaseManager.isLoaded) {
    tagImplicationResolver = new TagImplicationResolver(window.tagDatabaseManager);
    window.tagImplicationResolver = tagImplicationResolver;
    console.log('[TagImplicationResolver] ✅ Ready');
    document.dispatchEvent(new CustomEvent('tagImplicationResolverReady'));
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!initTagImplicationResolver()) {
    const dbReadyListener = () => {
      if (initTagImplicationResolver()) {
        document.removeEventListener('tagDatabaseReady', dbReadyListener);
      }
    };
    document.addEventListener('tagDatabaseReady', dbReadyListener);
    
    setTimeout(() => {
      if (!window.tagImplicationResolver) {
        initTagImplicationResolver();
      }
    }, 1000);
  }
});

/**
 * Global utility function to apply implications to video tags
 * Call this whenever video tags are modified
 * @param {Array} tags - Array of tag names
 * @returns {Array} - Expanded array with implied tags
 */
window.applyTagImplications = function(tags) {
  if (!window.tagImplicationResolver) {
    console.warn('[TagImplication] Resolver not ready, returning original tags');
    return tags;
  }
  
  if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
    console.warn('[TagImplication] Database not loaded, returning original tags');
    return tags;
  }
  
  if (!Array.isArray(tags) || tags.length === 0) {
    return tags;
  }
  
  try {
    const expandedTags = window.tagImplicationResolver.applyImplications(tags);
    
    if (expandedTags.length > tags.length) {
      const addedCount = expandedTags.length - tags.length;
      const addedTags = expandedTags.filter(t => !tags.includes(t));
      console.log(`[TagImplication] ✅ Added ${addedCount} implied tags:`, addedTags);
    }
    
    return expandedTags;
  } catch (error) {
    console.error('[TagImplication] ❌ Failed to apply implications:', error);
    return tags;
  }
};

/**
 * Global utility to check if implications are available
 * @returns {boolean}
 */
window.hasTagImplications = function() {
  return !!(window.tagImplicationResolver && window.tagImplicationResolver.cacheValid);
};
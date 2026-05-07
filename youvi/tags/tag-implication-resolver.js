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
 */

const TAG_IMPL_DEBUG = false;

class TagImplicationResolver {
  constructor(tagDatabaseManager) {
    this.tagDB = tagDatabaseManager;
    this.implicationCache = new Map();
    this.directImplicationsCache = new Map();
    this.cacheValid = false;
    
    if (this.tagDB) {
      this.tagDB.addEventListener(this._onDatabaseChange.bind(this));
    }
    
    if (TAG_IMPL_DEBUG) console.log('[TagImplicationResolver] ✅ Initialized');
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

    const normalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(tag.canonical) : 
      tag.canonical.toLowerCase();
    
    return this.implicationCache.get(normalized) || new Set();
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

    if (TAG_IMPL_DEBUG) console.log('[TagImplicationResolver] 🔄 Building implication cache...');
    const startTime = performance.now();

    this.implicationCache.clear();
    this.directImplicationsCache.clear();
    
    const allTags = this.tagDB.getAllTags();

    for (const tag of allTags) {
      const normalized = window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(tag.canonical) : 
        tag.canonical.toLowerCase();
      
      const directImplies = tag.implies || [];
      this.directImplicationsCache.set(normalized, new Set(directImplies.map(t => 
        window.TagDatabaseSchema ? 
          window.TagDatabaseSchema.normalizeTagName(t) : 
          t.toLowerCase()
      )));
    }

    for (const tag of allTags) {
      const normalized = window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(tag.canonical) : 
        tag.canonical.toLowerCase();
      
      const closure = this._computeTransitiveClosure(normalized, new Set(), new Set());
      this.implicationCache.set(normalized, closure);
    }

    this.cacheValid = true;
    const duration = performance.now() - startTime;
    if (TAG_IMPL_DEBUG) console.log(`[TagImplicationResolver] ✅ Cache built in ${duration.toFixed(2)}ms - ${allTags.length} tags processed`);
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
      if (TAG_IMPL_DEBUG) console.warn('[TagImplicationResolver] ⚠️ Cycle detected at:', tagNormalized);
      return new Set();
    }

    if (visited.has(tagNormalized)) {
      return this.implicationCache.get(tagNormalized) || new Set();
    }

    visited.add(tagNormalized);
    currentPath.add(tagNormalized);

    const result = new Set();
    const directImplies = this.directImplicationsCache.get(tagNormalized) || new Set();

    for (const impliedTag of directImplies) {
      result.add(impliedTag);
      
      const transitive = this._computeTransitiveClosure(impliedTag, visited, new Set(currentPath));
      for (const t of transitive) {
        result.add(t);
      }
    }

    currentPath.delete(tagNormalized);
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

    const allImplied = new Set();
    
    for (const tagName of tagNames) {
      const implied = this.resolveImplications(tagName);
      for (const tag of implied) {
        allImplied.add(tag);
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

    const fromNormalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(fromTagData.canonical) : 
      fromTagData.canonical.toLowerCase();
    
    const toNormalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(toTagData.canonical) : 
      toTagData.canonical.toLowerCase();

    if (fromNormalized === toNormalized) {
      return true;
    }

    this._ensureCacheBuilt();

    const toImplications = this.implicationCache.get(toNormalized) || new Set();
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

    const normalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(tag.canonical) : 
      tag.canonical.toLowerCase();

    const affected = [];
    const allTags = this.tagDB.getAllTags();

    for (const otherTag of allTags) {
      const otherNormalized = window.TagDatabaseSchema ? 
        window.TagDatabaseSchema.normalizeTagName(otherTag.canonical) : 
        otherTag.canonical.toLowerCase();
      
      if (otherNormalized === normalized) continue;

      const implications = this.resolveImplications(otherTag.canonical);
      if (implications.has(normalized)) {
        affected.push(otherTag.canonical);
      }
    }

    return affected;
  }

  /**
   * Apply implications to a set of tags (returns expanded set)
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

    const expandedSet = new Set(tags);
    let addedCount = 0;
    
    for (const tag of tags) {
      const implied = this.resolveImplications(tag);
      
      for (const impliedTag of implied) {
        const impliedTagData = this.tagDB.getTag(impliedTag);
        if (impliedTagData) {
          if (!expandedSet.has(impliedTagData.canonical)) {
            expandedSet.add(impliedTagData.canonical);
            addedCount++;
          }
        }
      }
    }

    const result = Array.from(expandedSet);
    
    if (TAG_IMPL_DEBUG && addedCount > 0) {
      console.log(`[TagImplicationResolver] ✅ Added ${addedCount} implied tags`);
    }
    
    return result;
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
    if (TAG_IMPL_DEBUG) console.log('[TagImplicationResolver] 🔄 Cache invalidated');
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

    const fromNormalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(fromTagData.canonical) : 
      fromTagData.canonical.toLowerCase();
    
    const toNormalized = window.TagDatabaseSchema ? 
      window.TagDatabaseSchema.normalizeTagName(toTagData.canonical) : 
      toTagData.canonical.toLowerCase();

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

      const directImplies = this.directImplicationsCache.get(current) || new Set();
      for (const next of directImplies) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
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
    if (TAG_IMPL_DEBUG) console.log('[TagImplicationResolver] ✅ Ready');
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
    if (TAG_IMPL_DEBUG) console.warn('[TagImplication] Resolver not ready, returning original tags');
    return tags;
  }
  
  if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
    if (TAG_IMPL_DEBUG) console.warn('[TagImplication] Database not loaded, returning original tags');
    return tags;
  }
  
  if (!Array.isArray(tags) || tags.length === 0) {
    return tags;
  }
  
  try {
    const expandedTags = window.tagImplicationResolver.applyImplications(tags);
    
    if (TAG_IMPL_DEBUG && expandedTags.length > tags.length) {
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
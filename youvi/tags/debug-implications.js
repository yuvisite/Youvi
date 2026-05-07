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
 * Debug utilities for Tag Implications
 * Use in browser console to debug implication issues
 */

const DEBUG_IMPL_INIT = false;

window.debugImplications = {
  /**
   * Check if a tag has implications
   */
  checkTag: (tagName) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return null;
    }
    
    const tag = window.tagDatabaseManager.getTag(tagName);
    if (!tag) {
      console.error('❌ Tag not found:', tagName);
      return null;
    }
    
    console.log('✅ Tag found:', tag);
    console.log('Direct implications:', tag.implies);
    
    if (window.tagImplicationResolver) {
      const allImplied = window.tagImplicationResolver.resolveImplications(tagName);
      console.log('All implied tags (transitive):', Array.from(allImplied));
      
      allImplied.forEach(impliedTag => {
        const chain = window.tagImplicationResolver.getImplicationChain(tagName, impliedTag);
        if (chain) {
          console.log(`  ${tagName} → ${impliedTag}:`, chain.join(' → '));
        }
      });
    }
    
    return tag;
  },
  
  /**
   * Test applying implications to a set of tags
   */
  testApply: (tags) => {
    console.log('Testing implications for tags:', tags);
    
    if (!window.applyTagImplications) {
      console.error('❌ applyTagImplications not available');
      return tags;
    }
    
    const result = window.applyTagImplications(tags);
    console.log('Result:', result);
    console.log('Added tags:', result.filter(t => !tags.includes(t)));
    
    return result;
  },
  
  /**
   * List all tags with implications
   */
  listAll: () => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return [];
    }
    
    const allTags = window.tagDatabaseManager.getAllTags();
    const tagsWithImplications = allTags.filter(tag => tag.implies && tag.implies.length > 0);
    
    console.log(`Found ${tagsWithImplications.length} tags with implications:`);
    tagsWithImplications.forEach(tag => {
      console.log(`  ${tag.canonical} →`, tag.implies);
    });
    
    return tagsWithImplications;
  },
  
  /**
   * Add implication for testing
   */
  addImplication: async (fromTag, toTag) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return false;
    }
    
    const fromTagData = window.tagDatabaseManager.getTag(fromTag);
    if (!fromTagData) {
      console.error('❌ Source tag not found:', fromTag);
      return false;
    }
    
    const toTagData = window.tagDatabaseManager.getTag(toTag);
    if (!toTagData) {
      console.error('❌ Target tag not found:', toTag);
      return false;
    }
    
    if (window.tagImplicationResolver && 
        window.tagImplicationResolver.wouldCreateCycle(fromTag, toTag)) {
      console.error('❌ Would create a cycle!');
      return false;
    }
    
    const updatedImplications = [...(fromTagData.implies || []), toTagData.canonical];
    await window.tagDatabaseManager.addTag(fromTag, {
      implies: updatedImplications,
      immediate: true
    });
    
    if (window.tagImplicationResolver) {
      window.tagImplicationResolver.invalidateCache();
    }
    
    console.log(`✅ Added implication: ${fromTag} → ${toTag}`);
    return true;
  },
  
  /**
   * Check system status
   */
  status: () => {
    console.log('Tag Implication System Status:');
    console.log('  tagDatabaseManager:', !!window.tagDatabaseManager);
    console.log('  Database loaded:', window.tagDatabaseManager?.isLoaded);
    console.log('  tagImplicationResolver:', !!window.tagImplicationResolver);
    console.log('  Resolver cache valid:', window.tagImplicationResolver?.cacheValid);
    console.log('  applyTagImplications:', !!window.applyTagImplications);
    console.log('  hasTagImplications:', !!window.hasTagImplications);
    
    if (window.tagImplicationResolver) {
      const stats = window.tagImplicationResolver.getStats();
      console.log('  Statistics:', stats);
    }
    
    if (window.tagDatabaseManager && window.tagDatabaseManager.isLoaded) {
      const allTags = window.tagDatabaseManager.getAllTags();
      const tagsWithImplications = allTags.filter(tag => tag.implies && tag.implies.length > 0);
      console.log(`  Tags with implications: ${tagsWithImplications.length} / ${allTags.length}`);
    }
  },
  
  /**
   * Show implication graph for a tag
   */
  showGraph: (tagName) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return;
    }
    
    const tag = window.tagDatabaseManager.getTag(tagName);
    if (!tag) {
      console.error('❌ Tag not found:', tagName);
      return;
    }
    
    console.log(`Implication graph for: ${tag.canonical}`);
    
    const direct = tag.implies || [];
    console.log('Direct implications:', direct);
    
    if (window.tagImplicationResolver) {
      const allImplied = window.tagImplicationResolver.resolveImplications(tagName);
      const transitive = Array.from(allImplied).filter(t => {
        const normalized = window.TagDatabaseSchema ? 
          window.TagDatabaseSchema.normalizeTagName(t) : 
          t.toLowerCase();
        const directNormalized = direct.map(d => 
          window.TagDatabaseSchema ? 
            window.TagDatabaseSchema.normalizeTagName(d) : 
            d.toLowerCase()
        );
        return !directNormalized.includes(normalized);
      });
      
      console.log('Transitive implications:', transitive);
      
      console.log('\nImplication tree:');
      console.log(`${tag.canonical}`);
      direct.forEach(d => {
        console.log(`  ├─ ${d}`);
        const dTag = window.tagDatabaseManager.getTag(d);
        if (dTag && dTag.implies && dTag.implies.length > 0) {
          dTag.implies.forEach((dd, idx) => {
            const isLast = idx === dTag.implies.length - 1;
            console.log(`  │  ${isLast ? '└─' : '├─'} ${dd}`);
          });
        }
      });
    }
  }
};

if (DEBUG_IMPL_INIT) {
  console.log('✅ Debug utilities loaded. Use window.debugImplications in console.');
  console.log('Available commands:');
  console.log('  debugImplications.status() - Check system status');
  console.log('  debugImplications.checkTag("tagName") - Check tag implications');
  console.log('  debugImplications.testApply(["tag1", "tag2"]) - Test applying implications');
  console.log('  debugImplications.listAll() - List all tags with implications');
  console.log('  debugImplications.showGraph("tagName") - Show implication graph');
  console.log('  debugImplications.addImplication("from", "to") - Add implication');
}
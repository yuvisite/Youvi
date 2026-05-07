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
 * Debug utilities for Tag Aliases
 * Use in browser console to debug alias issues
 */

const DEBUG_ALIAS_INIT = false;

window.debugAliases = {
  /**
   * Check if a tag has aliases
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
    console.log('Aliases:', tag.aliases);
    
    return tag;
  },
  
  /**
   * Test resolving an alias
   */
  testResolve: (input) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return null;
    }
    
    console.log('Testing alias resolution for:', input);
    
    const tag = window.tagDatabaseManager.getTag(input);
    if (tag) {
      console.log('✅ Resolved to:', tag.canonical);
      return tag.canonical;
    } else {
      console.log('❌ Not found, returning original:', input);
      return input;
    }
  },
  
  /**
   * List all tags with aliases
   */
  listAll: () => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return [];
    }
    
    const allTags = window.tagDatabaseManager.getAllTags();
    const tagsWithAliases = allTags.filter(tag => tag.aliases && tag.aliases.length > 0);
    
    console.log(`Found ${tagsWithAliases.length} tags with aliases:`);
    tagsWithAliases.forEach(tag => {
      console.log(`  ${tag.canonical}:`, tag.aliases);
    });
    
    return tagsWithAliases;
  },
  
  /**
   * Add alias for testing
   */
  addAlias: async (tagName, alias) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return false;
    }
    
    const tag = window.tagDatabaseManager.getTag(tagName);
    if (!tag) {
      console.error('❌ Tag not found:', tagName);
      return false;
    }
    
    const updatedAliases = [...(tag.aliases || []), alias];
    await window.tagDatabaseManager.addTag(tagName, {
      aliases: updatedAliases,
      immediate: true
    });
    
    console.log(`✅ Added alias: ${tagName} ← ${alias}`);
    return true;
  },
  
  /**
   * Test batch resolution
   */
  testBatch: (inputs) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return inputs;
    }
    
    console.log('Testing batch resolution for:', inputs);
    
    const resolved = inputs.map(input => {
      const tag = window.tagDatabaseManager.getTag(input);
      return tag ? tag.canonical : input;
    });
    
    console.log('Resolved to:', resolved);
    return resolved;
  },
  
  /**
   * Check alias index
   */
  checkIndex: () => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return null;
    }
    
    const aliasIndex = window.tagDatabaseManager.database.aliasIndex;
    console.log('Alias index entries:', Object.keys(aliasIndex).length);
    console.log('Sample entries:');
    
    let count = 0;
    for (const [alias, canonical] of Object.entries(aliasIndex)) {
      console.log(`  ${alias} → ${canonical}`);
      count++;
      if (count >= 10) break;
    }
    
    return aliasIndex;
  },
  
  /**
   * Search for alias
   */
  searchAlias: (query) => {
    if (!window.tagDatabaseManager || !window.tagDatabaseManager.isLoaded) {
      console.error('❌ Tag database not loaded');
      return [];
    }
    
    const aliasIndex = window.tagDatabaseManager.database.aliasIndex;
    const queryLower = query.toLowerCase();
    
    const matches = [];
    for (const [alias, canonical] of Object.entries(aliasIndex)) {
      if (alias.includes(queryLower)) {
        matches.push({ alias, canonical });
      }
    }
    
    console.log(`Found ${matches.length} matches for "${query}":`);
    matches.forEach(m => {
      console.log(`  ${m.alias} → ${m.canonical}`);
    });
    
    return matches;
  }
};

if (DEBUG_ALIAS_INIT) {
  console.log('✅ Alias debug utilities loaded. Use window.debugAliases in console.');
  console.log('Available commands:');
  console.log('  debugAliases.checkTag("tagName") - Check tag aliases');
  console.log('  debugAliases.testResolve("input") - Test alias resolution');
  console.log('  debugAliases.testBatch(["tag1", "tag2"]) - Test batch resolution');
  console.log('  debugAliases.listAll() - List all tags with aliases');
  console.log('  debugAliases.checkIndex() - Check alias index');
  console.log('  debugAliases.searchAlias("query") - Search for alias');
  console.log('  debugAliases.addAlias("tag", "alias") - Add alias');
}
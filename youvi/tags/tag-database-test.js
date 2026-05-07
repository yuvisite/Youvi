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
 * Tag Database System Tests
 * Simple test suite to verify functionality
 */

class TagDatabaseTests {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  /**
   * Add a test case
   */
  addTest(name, testFunction) {
    this.tests.push({ name, testFunction });
  }

  /**
   * Run all tests
   */
  async runTests() {
    console.log('[TagDB Tests] 🧪 Running', this.tests.length, 'tests...');
    this.results = [];

    for (const test of this.tests) {
      try {
        console.log(`[TagDB Tests] Running: ${test.name}`);
        const startTime = Date.now();
        
        await test.testFunction();
        
        const duration = Date.now() - startTime;
        this.results.push({
          name: test.name,
          status: 'PASS',
          duration,
          error: null
        });
        
        console.log(`[TagDB Tests] ✅ ${test.name} (${duration}ms)`);
        
      } catch (error) {
        this.results.push({
          name: test.name,
          status: 'FAIL',
          duration: 0,
          error: error.message
        });
        
        console.error(`[TagDB Tests] ❌ ${test.name}:`, error);
      }
    }

    this.printResults();
    return this.results;
  }

  /**
   * Print test results
   */
  printResults() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`[TagDB Tests] 📊 Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      console.log('[TagDB Tests] Failed tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  - ${result.name}: ${result.error}`);
      });
    }
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  /**
   * Setup basic tests
   */
  setupTests() {
    this.addTest('Schema creates empty database', () => {
      const db = TagDatabaseSchema.createEmpty();
      this.assert(db.version === TagDatabaseSchema.SCHEMA_VERSION, 'Version mismatch');
      this.assert(typeof db.tags === 'object', 'Tags not object');
      this.assert(typeof db.aliasIndex === 'object', 'AliasIndex not object');
      this.assert(typeof db.lastUpdated === 'number', 'LastUpdated not number');
    });

    this.addTest('Schema creates valid tag', () => {
      const tag = TagDatabaseSchema.createTag('Naruto (at)', {
        usageCount: 5,
        aliases: ['Наруто']
      });
      
      this.assert(tag.canonical === 'Naruto (at)', 'Canonical name incorrect');
      this.assert(tag.type === 'at', 'Type extraction failed');
      this.assert(tag.usageCount === 5, 'Usage count incorrect');
      this.assert(Array.isArray(tag.aliases), 'Aliases not array');
      this.assert(tag.aliases.includes('Наруто'), 'Alias not included');
      this.assert(typeof tag.color === 'string', 'Color not string');
    });

    this.addTest('Tag normalization works', () => {
      const normalized1 = TagDatabaseSchema.normalizeTagName('  Naruto (at)  ');
      const normalized2 = TagDatabaseSchema.normalizeTagName('NARUTO (AT)');
      
      this.assert(normalized1 === 'naruto (at)', 'Normalization failed');
      this.assert(normalized2 === 'naruto (at)', 'Case normalization failed');
    });

    this.addTest('Type extraction works', () => {
      this.assert(TagDatabaseSchema.extractTagType('Naruto (at)') === 'at', 'AT type failed');
      this.assert(TagDatabaseSchema.extractTagType('Action (ge)') === 'ge', 'GE type failed');
      this.assert(TagDatabaseSchema.extractTagType('NoType') === null, 'No type should be null');
    });

    this.addTest('Database validation works', () => {
      const validDb = TagDatabaseSchema.createEmpty();
      const invalidDb = { invalid: true };
      
      this.assert(TagDatabaseSchema.validate(validDb) === true, 'Valid DB rejected');
      this.assert(TagDatabaseSchema.validate(invalidDb) === false, 'Invalid DB accepted');
      this.assert(TagDatabaseSchema.validate(null) === false, 'Null DB accepted');
    });

    this.addTest('Manager can be created', () => {
      const manager = new TagDatabaseManager();
      this.assert(manager.isLoaded === false, 'Manager should start unloaded');
      this.assert(manager.database === null, 'Database should start null');
      this.assert(manager.listeners instanceof Set, 'Listeners should be Set');
    });

    this.addTest('Scanner can be created', () => {
      const mockManager = { addEventListener: () => {} };
      const scanner = new TagScanner(mockManager);
      this.assert(scanner.isScanning === false, 'Scanner should start inactive');
      this.assert(scanner.progress.current === 0, 'Progress should start at 0');
    });

    this.addTest('Integration can be created', () => {
      const integration = new TagDatabaseIntegration();
      this.assert(integration.isInitialized === false, 'Integration should start uninitialized');
      this.assert(integration.progressModal === null, 'Progress modal should start null');
    });

    this.addTest('Scanner processes video tags correctly', () => {
      const mockManager = { addEventListener: () => {} };
      const scanner = new TagScanner(mockManager);
      
      const mockVideo = {
        name: 'test.mp4',
        tags: ['Naruto (at)', 'Action (ge)', 'Shounen (ct)'],
        created: Date.now()
      };
      
      const tagStats = new Map();
      scanner.processVideoTags(mockVideo, tagStats);
      
      this.assert(tagStats.size === 3, 'Should process 3 tags');
      this.assert(tagStats.has('Naruto (at)'), 'Should have Naruto tag');
      this.assert(tagStats.get('Naruto (at)').count === 1, 'Count should be 1');
    });

    this.addTest('Tag colors are assigned correctly', () => {
      const animeColor = TagDatabaseSchema.getTagColor('at');
      const genreColor = TagDatabaseSchema.getTagColor('ge');
      const unknownColor = TagDatabaseSchema.getTagColor('unknown');
      
      this.assert(animeColor === '#a78bdb', 'Anime color incorrect');
      this.assert(genreColor === '#6b9bd1', 'Genre color incorrect');
      this.assert(unknownColor === '#6b7280', 'Unknown color should be default');
    });
  }

  /**
   * Run integration tests (requires actual system)
   */
  async runIntegrationTests() {
    if (typeof window === 'undefined' || !window.tagDatabaseManager) {
      console.log('[TagDB Tests] ⚠️ Integration tests require browser environment with loaded system');
      return;
    }

    console.log('[TagDB Tests] 🔗 Running integration tests...');

    this.addTest('Manager loads empty database', async () => {
      this.assert(typeof window.tagDatabaseManager === 'object', 'Manager not available');
      this.assert(typeof window.tagDatabaseManager.initialize === 'function', 'Initialize method missing');
    });

    await this.runTests();
  }
}

const tagDbTests = new TagDatabaseTests();
tagDbTests.setupTests();

window.tagDatabaseTests = tagDbTests;

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('[TagDB Tests] 🚀 Auto-running tests in development mode');
  setTimeout(() => {
    tagDbTests.runTests().then(() => {
      console.log('[TagDB Tests] ✅ Basic tests completed');
    });
  }, 1000);
}
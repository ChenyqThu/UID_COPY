#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Import modules for testing
const FileComparator = require('../lib/file-comparator');
const Validator = require('../lib/validator');
const logger = require('../lib/logger');

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runTest(test) {
    try {
      console.log(`Running: ${test.name}`);
      await test.testFn();
      this.passed++;
      console.log(`✅ PASSED: ${test.name}`);
    } catch (error) {
      this.failed++;
      console.log(`❌ FAILED: ${test.name}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  async runAll() {
    console.log('=== Running Tests ===\n');
    
    for (const test of this.tests) {
      await this.runTest(test);
    }
    
    console.log('\n=== Test Results ===');
    console.log(`Total: ${this.tests.length}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Test data setup
function setupTestData() {
  const testDir = path.join(__dirname, 'data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create test reference file
  const referenceData = {
    menu: {
      home: "Home",
      settings: "Settings"
    },
    common: {
      save: "Save",
      cancel: "Cancel"
    }
  };

  // Create test target file (incomplete)
  const targetData = {
    menu: {
      home: "Startseite"
      // Missing 'settings'
    }
    // Missing 'common' section
  };

  fs.writeFileSync(
    path.join(testDir, 'reference.json'), 
    JSON.stringify(referenceData, null, 2)
  );
  
  fs.writeFileSync(
    path.join(testDir, 'target.json'), 
    JSON.stringify(targetData, null, 2)
  );

  return { testDir, referenceData, targetData };
}

function setupInvalidTestData(testDir) {
  // Create invalid JSON file
  fs.writeFileSync(
    path.join(testDir, 'invalid.json'), 
    '{ "test": "invalid json" missing bracket'
  );
  
  // Create file with wrong structure
  const wrongStructure = {
    menu: "This should be an object",
    common: {
      save: null // Null value
    }
  };
  
  fs.writeFileSync(
    path.join(testDir, 'wrong-structure.json'), 
    JSON.stringify(wrongStructure, null, 2)
  );
}

// Initialize test runner
const runner = new TestRunner();

// Setup test data
const { testDir, referenceData, targetData } = setupTestData();
setupInvalidTestData(testDir);

// File Comparator Tests
runner.addTest('FileComparator: Load valid JSON file', () => {
  const comparator = new FileComparator();
  const referencePath = path.join(testDir, 'reference.json');
  const loaded = comparator.loadJsonFile(referencePath);
  
  if (JSON.stringify(loaded) !== JSON.stringify(referenceData)) {
    throw new Error('Loaded data does not match expected data');
  }
});

runner.addTest('FileComparator: Extract keys from nested object', () => {
  const comparator = new FileComparator();
  const keys = comparator.extractKeys(referenceData);
  
  const expectedKeys = new Set(['menu', 'menu.home', 'menu.settings', 'common', 'common.save', 'common.cancel']);
  
  for (const key of expectedKeys) {
    if (!keys.has(key)) {
      throw new Error(`Missing expected key: ${key}`);
    }
  }
});

runner.addTest('FileComparator: Compare files and find missing keys', () => {
  const comparator = new FileComparator();
  const referencePath = path.join(testDir, 'reference.json');
  const targetPath = path.join(testDir, 'target.json');
  
  const result = comparator.compare(referencePath, targetPath);
  
  if (result.missingCount !== 3) { // settings, common, common.save, common.cancel
    throw new Error(`Expected 3 missing keys, got ${result.missingCount}`);
  }
  
  if (!result.missingKeys.includes('menu.settings')) {
    throw new Error('Missing key "menu.settings" not detected');
  }
});

// Validator Tests
runner.addTest('Validator: Validate valid JSON file', () => {
  const validator = new Validator();
  const referencePath = path.join(testDir, 'reference.json');
  
  const result = validator.validateJsonFile(referencePath);
  
  if (!result.isValid) {
    throw new Error(`Valid file marked as invalid: ${result.errors[0]?.message}`);
  }
});

runner.addTest('Validator: Detect invalid JSON syntax', () => {
  const validator = new Validator();
  const invalidPath = path.join(testDir, 'invalid.json');
  
  const result = validator.validateJsonFile(invalidPath);
  
  if (result.isValid) {
    throw new Error('Invalid JSON file marked as valid');
  }
  
  if (result.errors.length === 0) {
    throw new Error('No errors reported for invalid JSON');
  }
});

runner.addTest('Validator: Detect structural issues', () => {
  const validator = new Validator();
  const wrongPath = path.join(testDir, 'wrong-structure.json');
  
  const result = validator.validateJsonFile(wrongPath);
  
  if (result.isValid && result.warningCount === 0) {
    throw new Error('Structural issues not detected');
  }
});

runner.addTest('Validator: Validate placeholder consistency', () => {
  const validator = new Validator();
  
  const reference = 'Hello {name}, welcome to {app}!';
  const validTranslation = 'Hallo {name}, willkommen bei {app}!';
  const invalidTranslation = 'Hallo {user}, willkommen!'; // Wrong placeholder
  
  const validResult = validator.validatePlaceholderConsistency(reference, validTranslation, 'test.key');
  const invalidResult = validator.validatePlaceholderConsistency(reference, invalidTranslation, 'test.key');
  
  if (!validResult) {
    throw new Error('Valid placeholder consistency marked as invalid');
  }
  
  if (invalidResult) {
    throw new Error('Invalid placeholder consistency marked as valid');
  }
});

// Configuration Tests
runner.addTest('Configuration: Environment variables loaded', () => {
  const config = require('../lib/config');
  
  // These should have default values even without .env
  const localesDir = config.get('localesDir');
  const maxRetries = config.get('maxRetries');
  
  if (!localesDir || typeof localesDir !== 'string') {
    throw new Error('Locales directory not configured');
  }
  
  if (typeof maxRetries !== 'number' || maxRetries <= 0) {
    throw new Error('Invalid maxRetries configuration');
  }
});

// Logger Tests
runner.addTest('Logger: Basic logging functionality', () => {
  // Test basic logging without throwing errors
  logger.info('Test info message');
  logger.warn('Test warning message');
  logger.debug('Test debug message');
  logger.success('Test success message');
  
  // This test passes if no exceptions are thrown
});

// Cleanup function
function cleanup() {
  try {
    const testDir = path.join(__dirname, 'data');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.log('Cleanup warning:', error.message);
  }
}

// Run tests
if (require.main === module) {
  runner.runAll()
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      cleanup();
    })
    .catch((error) => {
      console.error('\n❌ Test execution failed:', error);
      cleanup();
      process.exit(1);
    });
}

module.exports = TestRunner;
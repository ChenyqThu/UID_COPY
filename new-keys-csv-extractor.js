#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class NewKeysCSVExtractor {
  constructor() {
    this.localesDir = './locales';
    this.backupsDir = './backups';
    this.outputFile = './new-translation-keys.csv';
    this.referenceData = null;
  }

  /**
   * Load English reference file
   * @returns {Object} Reference JSON data
   */
  loadReferenceData() {
    if (!this.referenceData) {
      const referencePath = path.join(this.localesDir, 'en_US.json');
      if (fs.existsSync(referencePath)) {
        this.referenceData = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
      } else {
        this.referenceData = {};
      }
    }
    return this.referenceData;
  }

  /**
   * Get all language files in locales directory
   * @returns {Array} Array of language codes
   */
  getLanguageFiles() {
    const files = fs.readdirSync(this.localesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));

    return files;
  }

  /**
   * Get the most recent backup file for a language
   * @param {string} languageCode - Language code (e.g., 'zh_TW')
   * @returns {string|null} Path to most recent backup file
   */
  getMostRecentBackup(languageCode) {
    // First try to find timestamped backup files (format: YYYY-MM-DDTHH-MM-SS_lang.json)
    const timestampedFiles = fs.readdirSync(this.backupsDir)
      .filter(file => file.endsWith(`_${languageCode}.json`))
      .sort((a, b) => {
        // Extract timestamp from filename
        const timestampA = a.split('_')[0];
        const timestampB = b.split('_')[0];
        return timestampB.localeCompare(timestampA); // Descending order (newest first)
      });

    if (timestampedFiles.length > 0) {
      return path.join(this.backupsDir, timestampedFiles[0]);
    }

    // If no timestamped backup found, try direct filename (format: lang.json)
    const directBackupPath = path.join(this.backupsDir, `${languageCode}.json`);
    if (fs.existsSync(directBackupPath)) {
      return directBackupPath;
    }

    return null;
  }

  /**
   * Extract all keys from nested JSON object with their values
   * @param {Object} obj - JSON object
   * @param {string} prefix - Key prefix for nested objects
   * @returns {Map} Map of key paths to values
   */
  extractKeyValueMap(obj, prefix = '') {
    const keyValueMap = new Map();
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Nested object - recurse
        const nestedMap = this.extractKeyValueMap(value, fullKey);
        nestedMap.forEach((val, k) => keyValueMap.set(k, val));
      } else {
        // Leaf value
        keyValueMap.set(fullKey, value);
      }
    }
    
    return keyValueMap;
  }

  /**
   * Find new keys in current file compared to backup
   * @param {string} currentPath - Path to current file
   * @param {string} backupPath - Path to backup file
   * @returns {Set} Set of new keys
   */
  findNewKeys(currentPath, backupPath) {
    try {
      // Load both files
      const currentData = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

      // Extract key-value maps
      const currentMap = this.extractKeyValueMap(currentData);
      const backupMap = this.extractKeyValueMap(backupData);

      // Find new keys
      const newKeys = new Set();
      currentMap.forEach((currentValue, key) => {
        if (!backupMap.has(key)) {
          newKeys.add(key);
        }
      });

      return newKeys;

    } catch (error) {
      console.error(`Error comparing ${currentPath} with ${backupPath}:`, error.message);
      return new Set();
    }
  }

  /**
   * Get value for a key from a language file
   * @param {string} keyPath - Dot-notation key path
   * @param {string} languageCode - Language code
   * @returns {string|null} Value for the key
   */
  getKeyValue(keyPath, languageCode) {
    try {
      const filePath = path.join(this.localesDir, `${languageCode}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const keyMap = this.extractKeyValueMap(data);
      return keyMap.get(keyPath) || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Escape CSV value (handle commas, quotes, newlines)
   * @param {string} value - Value to escape
   * @returns {string} Escaped CSV value
   */
  escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }

  /**
   * Create proper CSV row with correct escaping
   * @param {Array} rowData - Array of values for the row
   * @returns {string} Properly formatted CSV row
   */
  createCSVRow(rowData) {
    return rowData.map(value => this.escapeCSVValue(value)).join(',');
  }

  /**
   * Extract new translation keys and generate CSV
   */
  async extractNewKeysToCSV() {
    try {
      console.log('🔍 Extracting new translation keys...');
      console.log(`📁 Comparing files in ${this.localesDir} with backups in ${this.backupsDir}`);
      
      const languages = this.getLanguageFiles();
      console.log(`📋 Found ${languages.length} language files:`, languages.join(', '));

      // Find all new keys across all languages
      const allNewKeys = new Set();
      const languageNewKeys = new Map();

      for (const langCode of languages) {
        if (langCode === 'en_US') continue; // Skip reference file
        
        const currentPath = path.join(this.localesDir, `${langCode}.json`);
        const backupPath = this.getMostRecentBackup(langCode);

        if (!fs.existsSync(currentPath)) {
          console.log(`⚠️ ${langCode}: Current file not found, skipping`);
          continue;
        }

        if (!backupPath || !fs.existsSync(backupPath)) {
          console.log(`⚠️ ${langCode}: No backup found, treating all keys as new`);
          // If no backup, all keys are "new"
          const currentData = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
          const currentKeys = this.extractKeyValueMap(currentData);
          const newKeys = new Set(currentKeys.keys());
          languageNewKeys.set(langCode, newKeys);
          newKeys.forEach(key => allNewKeys.add(key));
          continue;
        }

        console.log(`🔄 ${langCode}: Comparing with backup ${path.basename(backupPath)}`);
        const newKeys = this.findNewKeys(currentPath, backupPath);
        languageNewKeys.set(langCode, newKeys);
        
        // Add to global set
        newKeys.forEach(key => allNewKeys.add(key));
        
        console.log(`   Found ${newKeys.size} new keys`);
      }

      console.log(`\n📊 Total unique new keys found: ${allNewKeys.size}`);

      if (allNewKeys.size === 0) {
        console.log('✅ No new keys found. All translations are up to date!');
        return;
      }

      // Sort keys for consistent output
      const sortedNewKeys = Array.from(allNewKeys).sort();

      // Prepare CSV data
      const csvData = [];
      
      // Header row
      const header = ['Key', 'Reference (en_US)', ...languages.filter(lang => lang !== 'en_US')];
      csvData.push(header);

      // Data rows
      for (const keyPath of sortedNewKeys) {
        const row = [keyPath];
        
        // Add reference value (en_US)
        const refValue = this.getKeyValue(keyPath, 'en_US');
        row.push(refValue);
        
        // Add values for other languages
        for (const langCode of languages) {
          if (langCode === 'en_US') continue;
          
          const value = this.getKeyValue(keyPath, langCode);
          row.push(value);
        }
        
        csvData.push(row);
      }

      // Convert to CSV string using proper CSV formatting
      const csvContent = csvData.map(row => this.createCSVRow(row)).join('\n');

      // Write to file
      fs.writeFileSync(this.outputFile, csvContent, 'utf8');
      
      console.log(`✅ CSV export complete! Report saved to: ${this.outputFile}`);
      console.log(`📄 Contains ${sortedNewKeys.length} new translation keys across ${languages.length - 1} languages`);
      
      // Generate summary by language
      console.log('\n📋 New keys by language:');
      for (const [langCode, newKeys] of languageNewKeys) {
        console.log(`   ${langCode}: ${newKeys.size} new keys`);
      }

      // Show sample of new keys
      if (sortedNewKeys.length > 0) {
        console.log('\n🔍 Sample of new keys:');
        sortedNewKeys.slice(0, 5).forEach(key => {
          const refValue = this.getKeyValue(key, 'en_US');
          console.log(`   "${key}": "${refValue}"`);
        });
        if (sortedNewKeys.length > 5) {
          console.log(`   ... and ${sortedNewKeys.length - 5} more`);
        }
      }

    } catch (error) {
      console.error('❌ CSV extraction failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const extractor = new NewKeysCSVExtractor();
  extractor.extractNewKeysToCSV();
}

module.exports = NewKeysCSVExtractor;
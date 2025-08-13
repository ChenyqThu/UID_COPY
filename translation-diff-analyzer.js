#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class TranslationDiffAnalyzer {
  constructor() {
    this.localesDir = './locales';
    this.backupsDir = './backups';
    this.outputFile = './translation-changes-report.md';
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
   * Get reference value for a key from en_US.json
   * @param {string} keyPath - Dot-notation key path
   * @returns {string|null} Reference value
   */
  getReferenceValue(keyPath) {
    const refData = this.loadReferenceData();
    const refMap = this.extractKeyValueMap(refData);
    return refMap.get(keyPath) || null;
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
   * Compare two JSON files and find differences
   * @param {string} currentPath - Path to current file
   * @param {string} backupPath - Path to backup file
   * @returns {Object} Comparison result
   */
  compareFiles(currentPath, backupPath) {
    try {
      // Load both files
      const currentData = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

      // Extract key-value maps
      const currentMap = this.extractKeyValueMap(currentData);
      const backupMap = this.extractKeyValueMap(backupData);

      // Find differences
      const modifiedKeys = [];
      const newKeys = [];
      const removedKeys = [];

      // Check for modified and new keys
      currentMap.forEach((currentValue, key) => {
        if (backupMap.has(key)) {
          const backupValue = backupMap.get(key);
          if (currentValue !== backupValue) {
            modifiedKeys.push({
              key,
              oldValue: backupValue,
              newValue: currentValue,
              refValue: this.getReferenceValue(key)
            });
          }
        } else {
          newKeys.push({
            key,
            value: currentValue
          });
        }
      });

      // Check for removed keys
      backupMap.forEach((backupValue, key) => {
        if (!currentMap.has(key)) {
          removedKeys.push({
            key,
            value: backupValue
          });
        }
      });

      return {
        totalCurrentKeys: currentMap.size,
        totalBackupKeys: backupMap.size,
        modifiedKeys,
        newKeys,
        removedKeys,
        hasChanges: modifiedKeys.length > 0 || newKeys.length > 0 || removedKeys.length > 0
      };

    } catch (error) {
      return {
        error: `Failed to compare files: ${error.message}`,
        hasChanges: false
      };
    }
  }

  /**
   * Get all language files in locales directory
   * @returns {Array} Array of language codes
   */
  getLanguageFiles() {
    const files = fs.readdirSync(this.localesDir)
      .filter(file => file.endsWith('.json') && file !== 'en_US.json')
      .map(file => file.replace('.json', ''));

    return files;
  }

  /**
   * Generate comparison report in Markdown format for all languages
   * @returns {string} Report content in Markdown
   */
  generateReport() {
    let report = '';
    report += '# Translation Changes Analysis Report\n\n';
    report += `**Generated:** ${new Date().toISOString()}\n\n`;
    report += '---\n\n';

    const languages = this.getLanguageFiles();
    let totalLanguagesAnalyzed = 0;
    let totalLanguagesWithChanges = 0;
    let totalModifications = 0;
    let totalNewKeys = 0;
    let totalRemovedKeys = 0;
    
    // Summary data collection
    const summaryData = [];

    for (const langCode of languages) {
      const currentPath = path.join(this.localesDir, `${langCode}.json`);
      const backupPath = this.getMostRecentBackup(langCode);

      // Skip if no current file or backup
      if (!fs.existsSync(currentPath)) {
        continue;
      }

      if (!backupPath || !fs.existsSync(backupPath)) {
        report += `## ⚠️ ${langCode.toUpperCase()}\n\n`;
        report += '**Status:** No backup found, skipping comparison\n\n';
        summaryData.push({ language: langCode.toUpperCase(), modified: 'N/A', new: 'N/A' });
        continue;
      }

      totalLanguagesAnalyzed++;
      
      // Compare files
      const comparison = this.compareFiles(currentPath, backupPath);

      if (comparison.error) {
        report += `## ❌ ${langCode.toUpperCase()}\n\n`;
        report += `**Error:** ${comparison.error}\n\n`;
        summaryData.push({ language: langCode.toUpperCase(), modified: 'ERROR', new: 'ERROR' });
        continue;
      }

      // Add language section header
      report += `## 📋 ${langCode.toUpperCase()}\n\n`;
      report += `- **Current file:** \`${currentPath}\`\n`;
      report += `- **Backup file:** \`${path.basename(backupPath)}\`\n`;
      report += `- **Keys in current:** ${comparison.totalCurrentKeys}\n`;
      report += `- **Keys in backup:** ${comparison.totalBackupKeys}\n\n`;

      const modifiedCount = comparison.modifiedKeys.length;
      const newCount = comparison.newKeys.length;

      if (!comparison.hasChanges) {
        report += '✅ **No changes detected**\n\n';
        summaryData.push({ language: langCode.toUpperCase(), modified: 0, new: 0 });
        continue;
      }

      totalLanguagesWithChanges++;
      summaryData.push({ language: langCode.toUpperCase(), modified: modifiedCount, new: newCount });

      // Modified keys section with table
      if (comparison.modifiedKeys.length > 0) {
        totalModifications += comparison.modifiedKeys.length;
        report += `### 🔄 Modified Keys (${comparison.modifiedKeys.length})\n\n`;
        
        // Create table header
        report += '| Key | Reference (EN) | Old | New |\n';
        report += '|-----|----------------|-----|-----|\n';
        
        comparison.modifiedKeys.forEach(({ key, oldValue, newValue, refValue }) => {
          // Escape pipe characters and newlines for table format
          const escapeTableCell = (text) => {
            if (text === null || text === undefined) return '[NOT FOUND]';
            return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/\r/g, '');
          };
          
          report += `| \`${key}\` | ${escapeTableCell(refValue)} | ${escapeTableCell(oldValue)} | ${escapeTableCell(newValue)} |\n`;
        });
        
        report += '\n';
      }

      // New keys section (simplified count)
      if (comparison.newKeys.length > 0) {
        totalNewKeys += comparison.newKeys.length;
        report += `### ➕ New Keys\n\n`;
        report += `**${comparison.newKeys.length} keys added**\n\n`;
      }

      // Removed keys section
      if (comparison.removedKeys.length > 0) {
        totalRemovedKeys += comparison.removedKeys.length;
        report += `### ➖ Removed Keys (${comparison.removedKeys.length})\n\n`;
        
        comparison.removedKeys.forEach(({ key, value }, index) => {
          report += `${index + 1}. \`${key}\`: "${value}"\n`;
        });
        report += '\n';
      }

      report += '---\n\n';
    }

    // Summary section
    report += '# 📊 Summary\n\n';
    
    // Summary statistics
    report += '## Overall Statistics\n\n';
    report += `- **Total languages analyzed:** ${totalLanguagesAnalyzed}\n`;
    report += `- **Languages with changes:** ${totalLanguagesWithChanges}\n`;
    report += `- **Total modified keys:** ${totalModifications}\n`;
    report += `- **Total new keys:** ${totalNewKeys}\n`;
    report += `- **Total removed keys:** ${totalRemovedKeys}\n`;
    report += `- **Total changes:** ${totalModifications + totalNewKeys + totalRemovedKeys}\n\n`;

    // Summary table by language
    report += '## Changes by Language\n\n';
    report += '| Language | Modified Keys | New Keys |\n';
    report += '|----------|---------------|----------|\n';
    
    summaryData.forEach(({ language, modified, new: newKeys }) => {
      report += `| ${language} | ${modified} | ${newKeys} |\n`;
    });
    
    report += '\n';

    return report;
  }

  /**
   * Run the analysis and save report
   */
  async analyze() {
    try {
      console.log('🔍 Analyzing translation changes...');
      console.log(`📁 Comparing files in ${this.localesDir} with backups in ${this.backupsDir}`);
      
      const report = this.generateReport();
      
      // Save report to file
      fs.writeFileSync(this.outputFile, report, 'utf8');
      
      console.log(`✅ Analysis complete! Report saved to: ${this.outputFile}`);
      console.log(`📄 Report contains ${report.split('\n').length} lines`);
      
      // Also output a brief summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(line => line.includes('SUMMARY'));
      if (summaryStart >= 0) {
        console.log('\n📊 Quick Summary:');
        lines.slice(summaryStart, summaryStart + 10).forEach(line => {
          if (line.startsWith('Total')) {
            console.log(`   ${line}`);
          }
        });
      }

    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const analyzer = new TranslationDiffAnalyzer();
  analyzer.analyze();
}

module.exports = TranslationDiffAnalyzer;
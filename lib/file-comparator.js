const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class FileComparator {
  constructor() {
    this.missingKeys = new Map();
    this.extraKeys = new Map();
  }

  /**
   * Load and parse JSON file
   * @param {string} filePath - Path to JSON file
   * @returns {Object} Parsed JSON object
   */
  loadJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to load JSON file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Extract all keys from nested JSON object
   * @param {Object} obj - JSON object
   * @param {string} prefix - Key prefix for nested objects
   * @returns {Set} Set of all keys
   */
  extractKeys(obj, prefix = '') {
    const keys = new Set();
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(fullKey);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedKeys = this.extractKeys(value, fullKey);
        nestedKeys.forEach(nestedKey => keys.add(nestedKey));
      }
    }
    
    return keys;
  }

  /**
   * Get value from nested object using dot notation key
   * @param {Object} obj - JSON object
   * @param {string} key - Dot notation key
   * @returns {*} Value at key path
   */
  getValueByPath(obj, key) {
    const keys = key.split('.');
    let current = obj;
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Set value in nested object using dot notation key
   * @param {Object} obj - JSON object
   * @param {string} key - Dot notation key
   * @param {*} value - Value to set
   */
  setValueByPath(obj, key, value) {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let current = obj;
    
    for (const k of keys) {
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[lastKey] = value;
  }

  /**
   * Compare reference and target JSON files
   * @param {string} referencePath - Path to reference JSON file
   * @param {string} targetPath - Path to target JSON file
   * @returns {Object} Comparison result
   */
  compare(referencePath, targetPath) {
    logger.debug(`Comparing files: ${referencePath} vs ${targetPath}`);
    
    const reference = this.loadJsonFile(referencePath);
    const target = fs.existsSync(targetPath) ? this.loadJsonFile(targetPath) : {};
    
    const referenceKeys = this.extractKeys(reference);
    const targetKeys = this.extractKeys(target);
    
    const missingKeys = new Set([...referenceKeys].filter(key => !targetKeys.has(key)));
    const extraKeys = new Set([...targetKeys].filter(key => !referenceKeys.has(key)));
    
    // Build missing translations object
    const missingTranslations = {};
    for (const key of missingKeys) {
      const value = this.getValueByPath(reference, key);
      if (typeof value === 'string') {
        this.setValueByPath(missingTranslations, key, value);
      }
    }
    
    const result = {
      reference,
      target,
      missingKeys: Array.from(missingKeys),
      extraKeys: Array.from(extraKeys),
      missingTranslations,
      missingCount: missingKeys.size,
      extraCount: extraKeys.size,
      totalReferenceKeys: referenceKeys.size,
      totalTargetKeys: targetKeys.size,
      completionPercentage: Math.round(((referenceKeys.size - missingKeys.size) / referenceKeys.size) * 100)
    };
    
    logger.verbose(`Comparison complete`, {
      missing: result.missingCount,
      extra: result.extraCount,
      completion: `${result.completionPercentage}%`
    });
    
    return result;
  }

  /**
   * Compare multiple target files against reference
   * @param {string} referencePath - Path to reference JSON file
   * @param {Array} targetPaths - Array of target file paths
   * @returns {Map} Map of filename to comparison result
   */
  compareMultiple(referencePath, targetPaths) {
    const results = new Map();
    
    logger.info(`Comparing ${targetPaths.length} files against reference`);
    
    for (let i = 0; i < targetPaths.length; i++) {
      const targetPath = targetPaths[i];
      const filename = path.basename(targetPath);
      
      try {
        logger.progress(i + 1, targetPaths.length, `Comparing ${filename}`);
        const result = this.compare(referencePath, targetPath);
        results.set(filename, result);
      } catch (error) {
        logger.error(`Failed to compare ${filename}`, error);
        results.set(filename, { error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Generate comparison summary report
   * @param {Map} comparisonResults - Results from compareMultiple
   * @returns {Object} Summary report
   */
  generateSummaryReport(comparisonResults) {
    const summary = {
      totalFiles: comparisonResults.size,
      successfulComparisons: 0,
      failedComparisons: 0,
      totalMissingKeys: 0,
      totalExtraKeys: 0,
      fileDetails: [],
      overallCompletion: 0
    };
    
    let totalCompletion = 0;
    
    for (const [filename, result] of comparisonResults) {
      if (result.error) {
        summary.failedComparisons++;
        summary.fileDetails.push({
          filename,
          status: 'error',
          error: result.error
        });
      } else {
        summary.successfulComparisons++;
        summary.totalMissingKeys += result.missingCount;
        summary.totalExtraKeys += result.extraCount;
        totalCompletion += result.completionPercentage;
        
        summary.fileDetails.push({
          filename,
          status: 'success',
          missingKeys: result.missingCount,
          extraKeys: result.extraCount,
          completion: result.completionPercentage
        });
      }
    }
    
    if (summary.successfulComparisons > 0) {
      summary.overallCompletion = Math.round(totalCompletion / summary.successfulComparisons);
    }
    
    return summary;
  }

  /**
   * Validate JSON structure consistency
   * @param {Object} obj1 - First JSON object
   * @param {Object} obj2 - Second JSON object
   * @returns {Object} Validation result
   */
  validateStructure(obj1, obj2) {
    const keys1 = this.extractKeys(obj1);
    const keys2 = this.extractKeys(obj2);
    
    const structuralDifferences = [];
    
    // Check for type mismatches
    for (const key of keys1) {
      if (keys2.has(key)) {
        const val1 = this.getValueByPath(obj1, key);
        const val2 = this.getValueByPath(obj2, key);
        
        const type1 = typeof val1;
        const type2 = typeof val2;
        
        if (type1 !== type2) {
          structuralDifferences.push({
            key,
            type1,
            type2,
            issue: 'type_mismatch'
          });
        }
      }
    }
    
    return {
      isValid: structuralDifferences.length === 0,
      differences: structuralDifferences
    };
  }
}

module.exports = FileComparator;
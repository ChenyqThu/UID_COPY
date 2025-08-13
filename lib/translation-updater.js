const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class TranslationUpdater {
  constructor() {
    this.backupEnabled = config.get('backupEnabled');
    this.backupDir = config.get('backupDir');
    this.dryRun = config.isDryRun();
    
    // Ensure backup directory exists if needed
    if (this.backupEnabled) {
      config.ensureDirectories();
    }
  }

  /**
   * Create backup of target file
   * @param {string} filePath - Path to file to backup
   * @returns {string} Backup file path
   */
  createBackup(filePath) {
    if (!this.backupEnabled) {
      return null;
    }

    const filename = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFilename = `${timestamp}_${filename}`;
    const backupPath = path.join(this.backupDir, backupFilename);

    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(filePath, backupPath);
        logger.debug(`Backup created: ${backupPath}`);
      }
      return backupPath;
    } catch (error) {
      logger.error(`Failed to create backup for ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Restore file from backup
   * @param {string} originalPath - Original file path
   * @param {string} backupPath - Backup file path
   */
  restoreFromBackup(originalPath, backupPath) {
    if (!backupPath || !fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    try {
      fs.copyFileSync(backupPath, originalPath);
      logger.info(`File restored from backup: ${originalPath}`);
    } catch (error) {
      logger.error(`Failed to restore from backup: ${backupPath}`, error);
      throw error;
    }
  }

  /**
   * Deep merge two objects, prioritizing target values
   * @param {Object} target - Target object
   * @param {Object} source - Source object (new translations)
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // If target also has this key as an object, merge recursively
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this.deepMerge(result[key], value);
        } else {
          // Otherwise, use the source object
          result[key] = value;
        }
      } else {
        // For primitive values, only add if not already present in target
        if (!(key in result)) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Format JSON with consistent indentation
   * @param {Object} obj - Object to format
   * @param {number} spaces - Number of spaces for indentation
   * @returns {string} Formatted JSON string
   */
  formatJson(obj, spaces = 2) {
    return JSON.stringify(obj, null, spaces) + '\n';
  }

  /**
   * Update target file with new translations
   * @param {string} targetPath - Path to target file
   * @param {Object} newTranslations - New translations to add
   * @param {Object} options - Update options
   * @returns {Object} Update result
   */
  updateTranslations(targetPath, newTranslations, options = {}) {
    const {
      overwriteExisting = false,
      preserveStructure = true,
      validateResult = true
    } = options;

    logger.debug(`Updating translations for: ${targetPath}`, {
      newTranslationKeys: Object.keys(newTranslations).length,
      overwriteExisting,
      preserveStructure,
      dryRun: this.dryRun
    });

    let backupPath = null;
    let originalContent = {};
    let updatedContent = {};

    try {
      // Load existing content
      if (fs.existsSync(targetPath)) {
        const content = fs.readFileSync(targetPath, 'utf8');
        originalContent = JSON.parse(content);
      }

      // Create backup if enabled
      if (!this.dryRun) {
        backupPath = this.createBackup(targetPath);
      }

      // Merge translations
      if (overwriteExisting) {
        updatedContent = this.deepMerge(originalContent, newTranslations);
      } else {
        updatedContent = this.deepMerge(newTranslations, originalContent);
      }

      // Count changes
      const originalKeys = this.countKeys(originalContent);
      const newKeys = this.countKeys(newTranslations);
      const finalKeys = this.countKeys(updatedContent);
      const addedKeys = finalKeys - originalKeys;

      // Validate structure if requested
      if (validateResult && preserveStructure) {
        this.validateJsonStructure(updatedContent);
      }

      // Write updated content
      if (!this.dryRun) {
        const formattedContent = this.formatJson(updatedContent);
        fs.writeFileSync(targetPath, formattedContent, 'utf8');
        logger.success(`Updated translations written to: ${targetPath}`);
      } else {
        logger.info(`[DRY RUN] Would update: ${targetPath}`);
      }

      return {
        success: true,
        originalKeys,
        newKeys,
        addedKeys,
        finalKeys,
        backupPath,
        dryRun: this.dryRun
      };

    } catch (error) {
      logger.error(`Failed to update translations: ${targetPath}`, error);

      // Attempt to restore from backup if update failed
      if (backupPath && !this.dryRun) {
        try {
          this.restoreFromBackup(targetPath, backupPath);
          logger.info('Successfully restored original file from backup');
        } catch (restoreError) {
          logger.error('Failed to restore from backup', restoreError);
        }
      }

      return {
        success: false,
        error: error.message,
        backupPath,
        dryRun: this.dryRun
      };
    }
  }

  /**
   * Validate complete translations against reference structure
   * @param {Object} completeTranslations - Complete translation object
   * @param {Object} referenceJson - Reference JSON structure
   * @returns {Object} Validation result
   */
  validateTranslationStructure(completeTranslations, referenceJson) {
    // This is a simple implementation - you could make it more sophisticated
    const referencePath = path.join(require('./config').get('localesDir'), 'en_US.json');
    if (fs.existsSync(referencePath) && !referenceJson) {
      referenceJson = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
    }
    
    if (!referenceJson) {
      return { isValid: true, message: 'No reference for structure validation' };
    }

    const referenceKeys = this.extractAllKeys(referenceJson);
    const translationKeys = this.extractAllKeys(completeTranslations);
    
    const missingKeys = [];
    const extraKeys = [];
    
    referenceKeys.forEach(key => {
      if (!translationKeys.has(key)) {
        missingKeys.push(key);
      }
    });
    
    translationKeys.forEach(key => {
      if (!referenceKeys.has(key)) {
        extraKeys.push(key);
      }
    });
    
    const isValid = missingKeys.length === 0 && extraKeys.length === 0;
    
    return {
      isValid,
      missingKeys,
      extraKeys,
      referenceKeyCount: referenceKeys.size,
      translationKeyCount: translationKeys.size,
      message: isValid ? 'Structure validation passed' : 
               `Structure mismatch: ${missingKeys.length} missing, ${extraKeys.length} extra keys`
    };
  }

  /**
   * Extract all keys from nested object (helper method)
   * @param {Object} obj - Object to extract keys from
   * @param {string} prefix - Key prefix
   * @returns {Set} Set of all keys
   */
  extractAllKeys(obj, prefix = '') {
    const keys = new Set();
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(fullKey);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedKeys = this.extractAllKeys(value, fullKey);
        nestedKeys.forEach(nestedKey => keys.add(nestedKey));
      }
    }
    
    return keys;
  }

  /**
   * Update target file with complete translations
   * @param {string} targetPath - Path to target file
   * @param {Object} completeTranslations - Complete translation object
   * @param {Object} options - Update options
   * @returns {Object} Update result
   */
  updateCompleteTranslations(targetPath, completeTranslations, options = {}) {
    const {
      validateResult = true,
      referenceJson = null
    } = options;

    logger.debug(`Updating complete translations for: ${targetPath}`, {
      dryRun: this.dryRun
    });

    let backupPath = null;
    let originalContent = {};

    try {
      // Load existing content for comparison
      if (fs.existsSync(targetPath)) {
        const content = fs.readFileSync(targetPath, 'utf8');
        originalContent = JSON.parse(content);
      }

      // Create backup if enabled
      if (!this.dryRun) {
        backupPath = this.createBackup(targetPath);
      }

      // Count changes
      const originalKeys = this.countKeys(originalContent);
      const finalKeys = this.countKeys(completeTranslations);

      // Validate structure if requested
      if (validateResult) {
        this.validateJsonStructure(completeTranslations);
        
        // Additional structure validation against reference
        const structureValidation = this.validateTranslationStructure(completeTranslations, referenceJson);
        if (!structureValidation.isValid) {
          logger.error('=== FINAL STRUCTURE VALIDATION FAILED ===');
          logger.error(structureValidation.message);
          logger.error('=========================================');
          throw new Error(`Pre-write validation failed: ${structureValidation.message}`);
        } else {
          logger.info(`✅ Final structure validation passed: ${structureValidation.referenceKeyCount} keys`);
        }
      }

      // Write complete content
      if (!this.dryRun) {
        const formattedContent = this.formatJson(completeTranslations);
        fs.writeFileSync(targetPath, formattedContent, 'utf8');
        logger.success(`Updated complete translations written to: ${targetPath}`);
      } else {
        logger.info(`[DRY RUN] Would update complete file: ${targetPath}`);
      }

      return {
        success: true,
        originalKeys,
        finalKeys,
        totalKeys: finalKeys,
        backupPath,
        dryRun: this.dryRun
      };

    } catch (error) {
      logger.error(`Failed to update complete translations: ${targetPath}`, error);

      // Attempt to restore from backup if update failed
      if (backupPath && !this.dryRun) {
        try {
          this.restoreFromBackup(targetPath, backupPath);
          logger.info('Successfully restored original file from backup');
        } catch (restoreError) {
          logger.error('Failed to restore from backup', restoreError);
        }
      }

      return {
        success: false,
        error: error.message,
        backupPath,
        dryRun: this.dryRun
      };
    }
  }

  /**
   * Batch update multiple files (complete translation mode)
   * @param {Map} translationResults - Map of language code to translation result
   * @param {string} localesDir - Path to locales directory
   * @param {Object} options - Update options
   * @returns {Map} Map of language code to update result
   */
  batchUpdateComplete(translationResults, localesDir, options = {}) {
    const updateResults = new Map();

    logger.info(`Starting batch complete update for ${translationResults.size} files`);

    let processedCount = 0;
    for (const [languageCode, translationResult] of translationResults) {
      processedCount++;
      
      try {
        logger.progress(processedCount, translationResults.size, `Updating ${languageCode}`);

        if (!translationResult.success) {
          logger.warn(`Skipping update for ${languageCode}: translation failed`);
          updateResults.set(languageCode, {
            success: false,
            error: 'Translation failed',
            skipped: true
          });
          continue;
        }

        if (!translationResult.completeTranslations || Object.keys(translationResult.completeTranslations).length === 0) {
          logger.warn(`No complete translations to update for ${languageCode}`);
          updateResults.set(languageCode, {
            success: false,
            error: 'No complete translations received',
            skipped: true
          });
          continue;
        }

        const targetPath = path.join(localesDir, `${languageCode}.json`);
        const updateResult = this.updateCompleteTranslations(
          targetPath, 
          translationResult.completeTranslations, 
          options
        );

        updateResults.set(languageCode, updateResult);

      } catch (error) {
        logger.error(`Batch complete update failed for ${languageCode}`, error);
        updateResults.set(languageCode, {
          success: false,
          error: error.message
        });
      }
    }

    return updateResults;
  }

  /**
   * Batch update multiple files
   * @param {Map} translationResults - Map of language code to translation result
   * @param {string} localesDir - Path to locales directory
   * @param {Object} options - Update options
   * @returns {Map} Map of language code to update result
   */
  batchUpdate(translationResults, localesDir, options = {}) {
    const updateResults = new Map();

    logger.info(`Starting batch update for ${translationResults.size} files`);

    let processedCount = 0;
    for (const [languageCode, translationResult] of translationResults) {
      processedCount++;
      
      try {
        logger.progress(processedCount, translationResults.size, `Updating ${languageCode}`);

        if (!translationResult.success) {
          logger.warn(`Skipping update for ${languageCode}: translation failed`);
          updateResults.set(languageCode, {
            success: false,
            error: 'Translation failed',
            skipped: true
          });
          continue;
        }

        if (Object.keys(translationResult.translations).length === 0) {
          logger.info(`No translations to update for ${languageCode}`);
          updateResults.set(languageCode, {
            success: true,
            addedKeys: 0,
            skipped: true
          });
          continue;
        }

        const targetPath = path.join(localesDir, `${languageCode}.json`);
        const updateResult = this.updateTranslations(
          targetPath, 
          translationResult.translations, 
          options
        );

        updateResults.set(languageCode, updateResult);

      } catch (error) {
        logger.error(`Batch update failed for ${languageCode}`, error);
        updateResults.set(languageCode, {
          success: false,
          error: error.message
        });
      }
    }

    return updateResults;
  }

  /**
   * Count total number of keys in nested object
   * @param {Object} obj - Object to count keys in
   * @returns {number} Total key count
   */
  countKeys(obj) {
    if (!obj || typeof obj !== 'object') {
      return 0;
    }

    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      count++;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        count += this.countKeys(value);
      }
    }
    return count;
  }

  /**
   * Validate JSON structure for common issues
   * @param {Object} obj - Object to validate
   * @throws {Error} If validation fails
   */
  validateJsonStructure(obj) {
    // Check for circular references
    try {
      JSON.stringify(obj);
    } catch (error) {
      if (error.message.includes('circular')) {
        throw new Error('JSON contains circular references');
      }
      throw error;
    }

    // Check for undefined values
    this.checkForUndefinedValues(obj);
  }

  /**
   * Recursively check for undefined values
   * @param {Object} obj - Object to check
   * @param {string} path - Current path for error reporting
   */
  checkForUndefinedValues(obj, path = '') {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (value === undefined) {
        throw new Error(`Undefined value found at path: ${currentPath}`);
      }
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.checkForUndefinedValues(value, currentPath);
      }
    }
  }

  /**
   * Generate update summary report
   * @param {Map} updateResults - Results from batch update
   * @returns {Object} Summary report
   */
  generateUpdateSummary(updateResults) {
    const summary = {
      totalFiles: updateResults.size,
      successfulUpdates: 0,
      failedUpdates: 0,
      skippedUpdates: 0,
      totalKeysAdded: 0,
      fileDetails: [],
      backupFiles: []
    };

    for (const [languageCode, result] of updateResults) {
      const detail = {
        languageCode,
        status: result.success ? (result.skipped ? 'skipped' : 'success') : 'failed',
        addedKeys: result.addedKeys || 0,
        error: result.error
      };

      if (result.success) {
        if (result.skipped) {
          summary.skippedUpdates++;
        } else {
          summary.successfulUpdates++;
          summary.totalKeysAdded += result.addedKeys || 0;
        }
      } else {
        summary.failedUpdates++;
      }

      if (result.backupPath) {
        summary.backupFiles.push({
          languageCode,
          backupPath: result.backupPath
        });
      }

      summary.fileDetails.push(detail);
    }

    return summary;
  }
}

module.exports = TranslationUpdater;
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

// Import our modules
const config = require('./lib/config');
const logger = require('./lib/logger');
const FileComparator = require('./lib/file-comparator');
const TranslationService = require('./lib/translation-service');
const TranslationUpdater = require('./lib/translation-updater');
const Validator = require('./lib/validator');

class I18nAutoTranslator {
  constructor() {
    this.comparator = new FileComparator();
    this.translationService = new TranslationService();
    this.updater = new TranslationUpdater();
    this.validator = new Validator();
    
    this.setupCommander();
  }

  /**
   * Setup Commander.js CLI interface
   */
  setupCommander() {
    const program = new Command();
    
    program
      .name('i18n-auto-translator')
      .description('Automated translation system for multi-language localization')
      .version('1.0.0');

    // Main translation command
    program
      .command('translate')
      .description('Translate missing keys for target language(s)')
      .option('-t, --target <language>', 'Target language code (e.g., de_DE)')
      .option('-a, --all', 'Translate all available languages')
      .option('-r, --reference <file>', 'Reference file (default: en_US.json)', 'en_US.json')
      .option('--dry-run', 'Show what would be translated without making changes')
      .option('--overwrite', 'Overwrite existing translations')
      .option('--skip-validation', 'Skip post-translation validation')
      .option('--batch-size <size>', 'Number of keys per batch (default: 50)', '50')
      .action((options) => this.handleTranslateCommand(options));

    // Validation command
    program
      .command('validate')
      .description('Validate translation files without translating')
      .option('-t, --target <language>', 'Target language code')
      .option('-a, --all', 'Validate all language files')
      .option('-r, --reference <file>', 'Reference file (default: en_US.json)', 'en_US.json')
      .option('--structure-only', 'Only validate structure, skip content validation')
      .action((options) => this.handleValidateCommand(options));

    // Compare command
    program
      .command('compare')
      .description('Compare translation files and show differences')
      .option('-t, --target <language>', 'Target language code')
      .option('-a, --all', 'Compare all language files')
      .option('-r, --reference <file>', 'Reference file (default: en_US.json)', 'en_US.json')
      .option('--show-missing', 'Show only missing keys')
      .option('--show-extra', 'Show only extra keys')
      .option('--summary-only', 'Show only summary statistics')
      .action((options) => this.handleCompareCommand(options));

    // Status command
    program
      .command('status')
      .description('Show overall translation status and statistics')
      .option('-r, --reference <file>', 'Reference file (default: en_US.json)', 'en_US.json')
      .action((options) => this.handleStatusCommand(options));

    // Test command
    program
      .command('test')
      .description('Test API connection and configuration')
      .action(() => this.handleTestCommand());

    this.program = program;
  }

  /**
   * Parse command line arguments and execute
   * @param {Array} argv - Command line arguments
   */
  async run(argv = process.argv) {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      logger.error('Command execution failed', error);
      process.exit(1);
    }
  }

  /**
   * Handle translate command
   * @param {Object} options - Command options
   */
  async handleTranslateCommand(options) {
    logger.info('Starting translation process...');
    
    try {
      // Validate configuration
      await this.validateConfiguration();
      
      // Get target languages
      const targetLanguages = this.getTargetLanguages(options);
      
      if (targetLanguages.length === 0) {
        logger.error('No target languages specified');
        return;
      }

      // Get file paths
      const referencePath = this.getReferencePath(options.reference);
      const localesDir = config.get('localesDir');

      // Compare files to find missing translations
      logger.info('Analyzing translation gaps...');
      const comparisonResults = await this.performComparisons(referencePath, targetLanguages, localesDir);

      // Filter languages that need translation
      const languagesToTranslate = this.filterLanguagesNeedingTranslation(comparisonResults);

      if (languagesToTranslate.length === 0) {
        logger.success('All translations are up to date!');
        return;
      }

      // Perform complete translations with immediate updates
      logger.info(`Translating ${languagesToTranslate.length} language(s) with full file mode and immediate updates...`);
      const translationResults = await this.performCompleteTranslations(
        languagesToTranslate, 
        referencePath,
        localesDir,
        options
      );

      // Validate results if not skipped (only for successfully updated files)
      if (!options.skipValidation && !config.isDryRun()) {
        logger.info('Validating updated translations...');
        await this.performPostValidationImmediate(translationResults, referencePath, localesDir);
      }

      this.generateFinalReport(translationResults);
      logger.success('Translation process completed successfully!');

    } catch (error) {
      logger.error('Translation process failed', error);
      throw error;
    }
  }

  /**
   * Handle validate command
   * @param {Object} options - Command options
   */
  async handleValidateCommand(options) {
    logger.info('Starting validation process...');
    
    try {
      const targetLanguages = this.getTargetLanguages(options);
      const referencePath = this.getReferencePath(options.reference);
      const localesDir = config.get('localesDir');

      const validationResults = new Map();

      for (const language of targetLanguages) {
        const targetPath = path.join(localesDir, `${language}.json`);
        
        logger.info(`Validating ${language}...`);
        
        let result;
        if (options.structureOnly) {
          result = this.validator.validateStructuralConsistency(referencePath, targetPath);
        } else {
          result = this.validator.validateTranslationIntegrity(referencePath, targetPath);
        }
        
        validationResults.set(language, result);
        
        if (result.isValid) {
          logger.success(`${language}: Valid ${result.warningCount > 0 ? `(${result.warningCount} warnings)` : ''}`);
        } else {
          logger.error(`${language}: Invalid (${result.errorCount} errors, ${result.warningCount} warnings)`);
        }
      }

      this.generateValidationReport(validationResults);

    } catch (error) {
      logger.error('Validation process failed', error);
      throw error;
    }
  }

  /**
   * Handle compare command
   * @param {Object} options - Command options
   */
  async handleCompareCommand(options) {
    logger.info('Starting comparison process...');
    
    try {
      const targetLanguages = this.getTargetLanguages(options);
      const referencePath = this.getReferencePath(options.reference);
      const localesDir = config.get('localesDir');

      const comparisonResults = await this.performComparisons(referencePath, targetLanguages, localesDir);
      
      this.generateComparisonReport(comparisonResults, options);

    } catch (error) {
      logger.error('Comparison process failed', error);
      throw error;
    }
  }

  /**
   * Handle status command
   * @param {Object} options - Command options
   */
  async handleStatusCommand(options) {
    logger.info('Generating translation status report...');
    
    try {
      const referencePath = this.getReferencePath(options.reference);
      const localesDir = config.get('localesDir');
      
      // Get all available languages
      const allLanguages = this.getAllAvailableLanguages(localesDir);
      
      const comparisonResults = await this.performComparisons(referencePath, allLanguages, localesDir);
      const summary = this.comparator.generateSummaryReport(comparisonResults);
      
      this.generateStatusReport(summary, comparisonResults);

    } catch (error) {
      logger.error('Status report generation failed', error);
      throw error;
    }
  }

  /**
   * Handle test command
   */
  async handleTestCommand() {
    logger.info('Running system tests...');
    
    try {
      // Test configuration
      logger.info('Testing configuration...');
      config.validateConfig();
      logger.success('Configuration: OK');

      // Test file access
      logger.info('Testing file access...');
      const localesDir = config.get('localesDir');
      const referencePath = this.getReferencePath();
      
      if (!fs.existsSync(localesDir)) {
        throw new Error(`Locales directory not found: ${localesDir}`);
      }
      
      if (!fs.existsSync(referencePath)) {
        throw new Error(`Reference file not found: ${referencePath}`);
      }
      
      logger.success('File access: OK');

      // Test LLM API connection
      logger.info('Testing LLM API connection...');
      const connectionTest = await this.translationService.testConnection();
      
      if (connectionTest) {
        logger.success('LLM API connection: OK');
      } else {
        throw new Error('LLM API connection failed');
      }

      logger.success('All tests passed!');

    } catch (error) {
      logger.error('System test failed', error);
      throw error;
    }
  }

  /**
   * Validate system configuration
   */
  async validateConfiguration() {
    logger.debug('Validating system configuration...');
    
    // Test API connection
    const isConnected = await this.translationService.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to LLM API. Please check your configuration.');
    }
    
    logger.debug('Configuration validation completed');
  }

  /**
   * Get target languages from options
   * @param {Object} options - Command options
   * @returns {Array} Array of language codes
   */
  getTargetLanguages(options) {
    if (options.target) {
      return [options.target];
    }
    
    if (options.all) {
      return this.getAllAvailableLanguages(config.get('localesDir'));
    }
    
    return [];
  }

  /**
   * Get all available language codes from locales directory
   * @param {string} localesDir - Path to locales directory
   * @returns {Array} Array of language codes
   */
  getAllAvailableLanguages(localesDir) {
    const referenceFile = config.get('referenceFile');
    
    return fs.readdirSync(localesDir)
      .filter(file => file.endsWith('.json') && file !== referenceFile)
      .map(file => path.basename(file, '.json'));
  }

  /**
   * Get reference file path
   * @param {string} referenceFile - Reference filename
   * @returns {string} Full path to reference file
   */
  getReferencePath(referenceFile = null) {
    const filename = referenceFile || config.get('referenceFile');
    return path.join(config.get('localesDir'), filename);
  }

  /**
   * Perform file comparisons
   * @param {string} referencePath - Path to reference file
   * @param {Array} targetLanguages - Array of target language codes
   * @param {string} localesDir - Path to locales directory
   * @returns {Map} Comparison results
   */
  async performComparisons(referencePath, targetLanguages, localesDir) {
    const targetPaths = targetLanguages.map(lang => path.join(localesDir, `${lang}.json`));
    
    return this.comparator.compareMultiple(referencePath, targetPaths);
  }

  /**
   * Filter languages that need translation
   * @param {Map} comparisonResults - Results from file comparison
   * @returns {Array} Languages that need translation
   */
  filterLanguagesNeedingTranslation(comparisonResults) {
    const languagesToTranslate = [];
    
    for (const [filename, result] of comparisonResults) {
      if (result.error) {
        logger.warn(`Skipping ${filename}: ${result.error}`);
        continue;
      }
      
      if (result.missingCount > 0) {
        const languageCode = path.basename(filename, '.json');
        languagesToTranslate.push(languageCode);
        logger.info(`${languageCode}: ${result.missingCount} missing translation(s)`);
      }
    }
    
    return languagesToTranslate;
  }

  /**
   * Perform complete translations (full file mode) with immediate updates
   * @param {Array} languages - Languages to translate
   * @param {string} referencePath - Path to reference file
   * @param {string} localesDir - Path to locales directory
   * @param {Object} options - Command options
   * @returns {Map} Translation results
   */
  async performCompleteTranslations(languages, referencePath, localesDir, options) {
    const referenceJson = this.comparator.loadJsonFile(referencePath);
    const targetJsonMap = new Map();
    
    // Load target JSON files
    for (const language of languages) {
      const targetPath = path.join(localesDir, `${language}.json`);
      let targetJson = {};
      
      try {
        if (fs.existsSync(targetPath)) {
          targetJson = this.comparator.loadJsonFile(targetPath);
        }
      } catch (error) {
        logger.warn(`Failed to load existing file for ${language}, using empty object`);
        targetJson = {};
      }
      
      targetJsonMap.set(language, targetJson);
    }
    
    // Prepare update options
    const updateOptions = {
      completeFileMode: true,
      overwriteExisting: true,
      preserveStructure: true,
      validateResult: true
    };
    
    // Perform batch complete translation with immediate updates
    return await this.translationService.batchTranslateCompleteWithUpdates(
      languages,
      referenceJson,
      targetJsonMap,
      this.updater,
      localesDir,
      updateOptions
    );
  }

  /**
   * Perform file updates (complete translation mode)
   * @param {Map} translationResults - Translation results
   * @param {string} localesDir - Path to locales directory
   * @param {Object} options - Command options
   * @returns {Map} Update results
   */
  async performUpdates(translationResults, localesDir, options) {
    const updateOptions = {
      completeFileMode: true,
      overwriteExisting: true, // Always overwrite in complete mode
      preserveStructure: true,
      validateResult: true
    };
    
    return this.updater.batchUpdateComplete(translationResults, localesDir, updateOptions);
  }

  /**
   * Perform post-translation validation (immediate update mode)
   * @param {Map} translationResults - Translation results with immediate updates
   * @param {string} referencePath - Path to reference file
   * @param {string} localesDir - Path to locales directory
   */
  async performPostValidationImmediate(translationResults, referencePath, localesDir) {
    let validationPassed = 0;
    let validationFailed = 0;
    
    for (const [languageCode, result] of translationResults) {
      // Only validate if translation and update both succeeded
      if (!result.success || !result.immediateUpdate || !result.updateResult?.success) {
        continue;
      }
      
      const targetPath = path.join(localesDir, `${languageCode}.json`);
      const validationResult = this.validator.validateTranslationIntegrity(referencePath, targetPath);
      
      if (validationResult.isValid) {
        validationPassed++;
        logger.success(`${languageCode}: Post-validation passed`);
      } else {
        validationFailed++;
        logger.error(`${languageCode}: Post-validation failed (${validationResult.errorCount} errors)`);
      }
    }
    
    logger.info(`Post-validation summary: ${validationPassed} passed, ${validationFailed} failed`);
  }

  /**
   * Perform post-translation validation
   * @param {Map} updateResults - Update results
   * @param {string} referencePath - Path to reference file
   * @param {string} localesDir - Path to locales directory
   */
  async performPostValidation(updateResults, referencePath, localesDir) {
    let validationPassed = 0;
    let validationFailed = 0;
    
    for (const [languageCode, updateResult] of updateResults) {
      if (!updateResult.success || updateResult.skipped) {
        continue;
      }
      
      const targetPath = path.join(localesDir, `${languageCode}.json`);
      const validationResult = this.validator.validateTranslationIntegrity(referencePath, targetPath);
      
      if (validationResult.isValid) {
        validationPassed++;
        logger.success(`${languageCode}: Post-validation passed`);
      } else {
        validationFailed++;
        logger.error(`${languageCode}: Post-validation failed (${validationResult.errorCount} errors)`);
      }
    }
    
    logger.info(`Post-validation summary: ${validationPassed} passed, ${validationFailed} failed`);
  }

  /**
   * Generate final report
   * @param {Map} translationResults - Translation results
   */
  generateFinalReport(translationResults) {
    let successCount = 0;
    let failedCount = 0;
    let totalTranslated = 0;
    
    for (const [language, result] of translationResults) {
      if (result.success) {
        successCount++;
        totalTranslated += result.translatedCount;
      } else {
        failedCount++;
      }
    }
    
    logger.info('=== TRANSLATION SUMMARY ===');
    logger.info(`Languages processed: ${translationResults.size}`);
    logger.info(`Successful: ${successCount}`);
    logger.info(`Failed: ${failedCount}`);
    logger.info(`Total keys translated: ${totalTranslated}`);
    logger.info(`Dry run: ${config.isDryRun() ? 'Yes' : 'No'}`);
  }

  /**
   * Generate validation report
   * @param {Map} validationResults - Validation results
   */
  generateValidationReport(validationResults) {
    logger.info('=== VALIDATION SUMMARY ===');
    
    let validCount = 0;
    let invalidCount = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    
    for (const [language, result] of validationResults) {
      if (result.isValid) {
        validCount++;
      } else {
        invalidCount++;
      }
      totalErrors += result.errorCount;
      totalWarnings += result.warningCount;
    }
    
    logger.info(`Files validated: ${validationResults.size}`);
    logger.info(`Valid: ${validCount}`);
    logger.info(`Invalid: ${invalidCount}`);
    logger.info(`Total errors: ${totalErrors}`);
    logger.info(`Total warnings: ${totalWarnings}`);
  }

  /**
   * Generate comparison report
   * @param {Map} comparisonResults - Comparison results
   * @param {Object} options - Command options
   */
  generateComparisonReport(comparisonResults, options) {
    logger.info('=== COMPARISON REPORT ===');
    
    if (options.summaryOnly) {
      const summary = this.comparator.generateSummaryReport(comparisonResults);
      logger.info(`Total files: ${summary.totalFiles}`);
      logger.info(`Overall completion: ${summary.overallCompletion}%`);
      logger.info(`Total missing keys: ${summary.totalMissingKeys}`);
      logger.info(`Total extra keys: ${summary.totalExtraKeys}`);
    } else {
      for (const [filename, result] of comparisonResults) {
        const language = path.basename(filename, '.json');
        
        if (result.error) {
          logger.error(`${language}: Error - ${result.error}`);
          continue;
        }
        
        logger.info(`\n--- ${language} ---`);
        logger.info(`Completion: ${result.completionPercentage}%`);
        
        if (!options.showExtra && (options.showMissing || result.missingCount > 0)) {
          logger.info(`Missing keys (${result.missingCount}):`);
          result.missingKeys.slice(0, 10).forEach(key => logger.info(`  - ${key}`));
          if (result.missingKeys.length > 10) {
            logger.info(`  ... and ${result.missingKeys.length - 10} more`);
          }
        }
        
        if (!options.showMissing && (options.showExtra || result.extraCount > 0)) {
          logger.info(`Extra keys (${result.extraCount}):`);
          result.extraKeys.slice(0, 10).forEach(key => logger.info(`  + ${key}`));
          if (result.extraKeys.length > 10) {
            logger.info(`  ... and ${result.extraKeys.length - 10} more`);
          }
        }
      }
    }
  }

  /**
   * Generate status report
   * @param {Object} summary - Summary from comparison
   * @param {Map} comparisonResults - Detailed comparison results
   */
  generateStatusReport(summary, comparisonResults) {
    logger.info('=== TRANSLATION STATUS ===');
    logger.info(`Total languages: ${summary.totalFiles}`);
    logger.info(`Overall completion: ${summary.overallCompletion}%`);
    logger.info(`Total missing keys: ${summary.totalMissingKeys}`);
    logger.info(`Languages needing translation: ${summary.fileDetails.filter(f => f.missingKeys > 0).length}`);
    
    logger.info('\n--- By Language ---');
    summary.fileDetails
      .sort((a, b) => b.completion - a.completion)
      .forEach(detail => {
        const status = detail.completion === 100 ? '✅' : detail.completion >= 90 ? '🟡' : '🔴';
        logger.info(`${status} ${detail.filename}: ${detail.completion}% (${detail.missingKeys} missing)`);
      });
  }
}

// Main execution
if (require.main === module) {
  const translator = new I18nAutoTranslator();
  translator.run().catch((error) => {
    logger.error('Fatal error', error);
    process.exit(1);
  });
}

module.exports = I18nAutoTranslator;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

class TranslationService {
  constructor() {
    this.apiKey = config.get('llmApiKey');
    this.model = config.get('llmModel');
    this.temperature = config.get('llmTemperature');
    this.maxTokens = config.get('llmMaxTokens');
    this.maxRetries = config.get('maxRetries');
    this.timeout = config.get('requestTimeout');
    
    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.promptTemplate = this.loadPromptTemplate();
    this.languageConfig = this.loadLanguageConfig();
  }

  /**
   * Load prompt template from file
   * @returns {string} Prompt template
   */
  loadPromptTemplate() {
    try {
      const promptPath = path.resolve(process.cwd(), 'prompts', 'translation-prompt.txt');
      return fs.readFileSync(promptPath, 'utf8');
    } catch (error) {
      logger.error('Failed to load prompt template', error);
      throw new Error('Prompt template is required for translation service');
    }
  }

  /**
   * Load language configuration
   * @returns {Object} Language configuration
   */
  loadLanguageConfig() {
    try {
      const configPath = path.resolve(process.cwd(), 'language-config.json');
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      logger.error('Failed to load language configuration', error);
      throw new Error('Language configuration is required for translation service');
    }
  }

  /**
   * Build prompt for full translation request
   * @param {string} targetLanguage - Target language code
   * @param {Object} referenceJson - Reference JSON object
   * @param {Object} targetJson - Target JSON object
   * @returns {string} Complete prompt
   */
  buildPrompt(targetLanguage, referenceJson, targetJson) {
    const langInfo = this.languageConfig.languages[targetLanguage];
    if (!langInfo) {
      throw new Error(`Language configuration not found for: ${targetLanguage}`);
    }

    let prompt = this.promptTemplate
      .replace('{TARGET_LANGUAGE}', langInfo.name)
      .replace('{LANGUAGE_SPECIFIC_NOTES}', langInfo.notes)
      .replace('{REFERENCE_JSON}', JSON.stringify(referenceJson, null, 2))
      .replace('{TARGET_JSON}', JSON.stringify(targetJson, null, 2));

    return prompt;
  }

  /**
   * Calculate approximate token count (rough estimate)
   * @param {string} text - Text to count tokens for
   * @returns {number} Approximate token count
   */
  estimateTokenCount(text) {
    // Very rough estimation: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  /**
   * Preview prompt (first N lines)
   * @param {string} prompt - Full prompt
   * @param {number} lines - Number of lines to preview
   * @returns {string} Prompt preview
   */
  previewPrompt(prompt, lines = 5) {
    const promptLines = prompt.split('\n');
    const preview = promptLines.slice(0, lines).join('\n');
    const totalLines = promptLines.length;
    
    if (totalLines > lines) {
      return `${preview}\n... [${totalLines - lines} more lines]`;
    }
    return preview;
  }

  /**
   * Make API request to LLM service
   * @param {string} prompt - Complete prompt
   * @param {number} retryCount - Current retry count
   * @returns {Promise<string>} Translation response
   */
  async makeApiRequest(prompt, retryCount = 0) {
    const startTime = Date.now();
    
    try {
      const fullPrompt = `You are a professional translator specialized in software localization. Return only valid JSON without any explanations.\n\n${prompt}`;
      
      // Calculate token statistics
      const promptTokens = this.estimateTokenCount(fullPrompt);
      const promptPreview = this.previewPrompt(fullPrompt, 8);
      
      logger.info('=== API REQUEST DEBUG ===');
      logger.info(`Model: ${this.model}`);
      logger.info(`Temperature: ${this.temperature}`);
      logger.info(`Max Tokens: ${this.maxTokens}`);
      logger.info(`Estimated Input Tokens: ${promptTokens}`);
      logger.info(`Prompt Length: ${fullPrompt.length} characters`);
      logger.info(`Prompt Preview:\n${promptPreview}`);
      logger.info('=======================');

      logger.apiRequest('Gemini API', 'POST', {
        bodySize: fullPrompt.length,
        estimatedTokens: promptTokens
      });

      const model = this.genAI.getGenerativeModel({ 
        model: this.model,
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: this.maxTokens
        }
      });
      
      const result = await model.generateContent(fullPrompt);
      const responseTime = Date.now() - startTime;
      
      const response = await result.response;
      const text = response.text();
      
      // Response statistics
      const responseTokens = this.estimateTokenCount(text);
      
      logger.info('=== API RESPONSE DEBUG ===');
      logger.info(`Response Time: ${responseTime}ms`);
      logger.info(`Response Length: ${text.length} characters`);
      logger.info(`Estimated Response Tokens: ${responseTokens}`);
      logger.info(`Response Preview: ${text.substring(0, 200)}...`);
      logger.info('==========================');
      
      logger.apiResponse('Gemini API', 200, responseTime);

      if (text) {
        return text.trim();
      } else {
        throw new Error('Empty response from Gemini API');
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Detailed error logging
      logger.error('=== API ERROR DETAILS ===');
      logger.error(`Error Type: ${error.constructor.name}`);
      logger.error(`Error Message: ${error.message}`);
      logger.error(`Response Time: ${responseTime}ms`);
      logger.error(`Retry Count: ${retryCount}/${this.maxRetries}`);
      
      if (error.response) {
        logger.error(`HTTP Status: ${error.response.status}`);
        logger.error(`HTTP Status Text: ${error.response.statusText}`);
        if (error.response.data) {
          logger.error(`Response Data: ${JSON.stringify(error.response.data, null, 2)}`);
        }
      }
      
      if (error.code) {
        logger.error(`Error Code: ${error.code}`);
      }
      
      logger.error(`Full Error Object:`, error);
      logger.error('=========================');
      
      logger.apiError('Gemini API', error, retryCount);

      if (retryCount < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff
        logger.debug(`Retrying API request in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        await this.sleep(delay);
        return this.makeApiRequest(prompt, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Extract all keys from nested JSON object
   * @param {Object} obj - JSON object
   * @param {string} prefix - Key prefix for nested objects
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
   * Validate JSON structure against reference
   * @param {Object} referenceJson - Reference JSON structure
   * @param {Object} translatedJson - Translated JSON to validate
   * @returns {Object} Validation result
   */
  validateJsonStructure(referenceJson, translatedJson) {
    const referenceKeys = this.extractAllKeys(referenceJson);
    const translatedKeys = this.extractAllKeys(translatedJson);
    
    const missingKeys = [];
    const extraKeys = [];
    
    // Check for missing keys
    referenceKeys.forEach(key => {
      if (!translatedKeys.has(key)) {
        missingKeys.push(key);
      }
    });
    
    // Check for extra keys
    translatedKeys.forEach(key => {
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
      translatedKeyCount: translatedKeys.size
    };
  }

  /**
   * Parse and validate full translation response
   * @param {string} response - Raw response from LLM
   * @param {Object} referenceJson - Reference JSON for structure validation
   * @returns {Object} Parsed complete translation object
   */
  parseTranslationResponse(response, referenceJson = null) {
    try {
      // Clean up response (remove code blocks, extra whitespace)
      let cleanResponse = response.trim();
      
      // Remove code block markers if present
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Parse JSON
      const completeTranslations = JSON.parse(cleanResponse);
      
      // Validate that it's an object
      if (typeof completeTranslations !== 'object' || completeTranslations === null) {
        throw new Error('Translation response is not a valid object');
      }

      // Validate structure against reference if provided
      if (referenceJson) {
        const structureValidation = this.validateJsonStructure(referenceJson, completeTranslations);
        
        if (!structureValidation.isValid) {
          logger.error('=== STRUCTURE VALIDATION FAILED ===');
          logger.error(`Reference keys: ${structureValidation.referenceKeyCount}`);
          logger.error(`Translated keys: ${structureValidation.translatedKeyCount}`);
          
          if (structureValidation.missingKeys.length > 0) {
            logger.error(`Missing keys (${structureValidation.missingKeys.length}):`);
            structureValidation.missingKeys.slice(0, 10).forEach(key => {
              logger.error(`  - ${key}`);
            });
            if (structureValidation.missingKeys.length > 10) {
              logger.error(`  ... and ${structureValidation.missingKeys.length - 10} more`);
            }
          }
          
          if (structureValidation.extraKeys.length > 0) {
            logger.error(`Extra keys (${structureValidation.extraKeys.length}):`);
            structureValidation.extraKeys.slice(0, 10).forEach(key => {
              logger.error(`  + ${key}`);
            });
            if (structureValidation.extraKeys.length > 10) {
              logger.error(`  ... and ${structureValidation.extraKeys.length - 10} more`);
            }
          }
          
          logger.error('===================================');
          throw new Error(`JSON structure validation failed: ${structureValidation.missingKeys.length} missing keys, ${structureValidation.extraKeys.length} extra keys`);
        } else {
          logger.info(`✅ JSON structure validation passed: ${structureValidation.referenceKeyCount} keys matched`);
        }
      }
      
      return completeTranslations;
      
    } catch (error) {
      logger.error('Failed to parse translation response', {
        error: error.message,
        response: response.substring(0, 500) // Log first 500 chars for debugging
      });
      throw new Error(`Invalid JSON response from translation service: ${error.message}`);
    }
  }

  /**
   * Translate complete file for a target language
   * @param {string} targetLanguage - Target language code
   * @param {Object} referenceJson - Reference JSON object
   * @param {Object} targetJson - Target JSON object
   * @returns {Promise<Object>} Translation result
   */
  async translateCompleteFile(targetLanguage, referenceJson, targetJson) {
    logger.translationStart(targetLanguage, 'full file');

    try {
      // Build prompt for complete translation
      const prompt = this.buildPrompt(targetLanguage, referenceJson, targetJson);
      
      // Make API request
      const response = await this.makeApiRequest(prompt);
      
      // Parse response with structure validation against reference
      const completeTranslations = this.parseTranslationResponse(response, referenceJson);
      
      const keyCount = this.countKeys(completeTranslations);
      logger.translationComplete(targetLanguage, keyCount);
      
      return {
        success: true,
        completeTranslations,
        translatedCount: keyCount,
        skippedCount: 0,
        errors: []
      };
      
    } catch (error) {
      logger.translationError(targetLanguage, error, {
        hasReference: !!referenceJson,
        hasTarget: !!targetJson
      });
      
      return {
        success: false,
        completeTranslations: {},
        translatedCount: 0,
        skippedCount: 0,
        errors: [error.message]
      };
    }
  }

  /**
   * Count total keys in nested JSON object
   * @param {Object} obj - JSON object
   * @returns {number} Total key count
   */
  countKeys(obj) {
    let count = 0;
    
    function traverse(current) {
      for (const key in current) {
        if (current.hasOwnProperty(key)) {
          if (typeof current[key] === 'object' && current[key] !== null && !Array.isArray(current[key])) {
            traverse(current[key]);
          } else {
            count++;
          }
        }
      }
    }
    
    traverse(obj);
    return count;
  }

  /**
   * Batch translate multiple languages (full file mode) with immediate updates
   * @param {Array} languageCodes - Array of language codes
   * @param {Object} referenceJson - Reference JSON object
   * @param {Map} targetJsonMap - Map of language code to target JSON
   * @param {TranslationUpdater} updater - Translation updater instance
   * @param {string} localesDir - Path to locales directory
   * @param {Object} updateOptions - Update options
   * @returns {Promise<Map>} Map of language code to translation result
   */
  async batchTranslateCompleteWithUpdates(languageCodes, referenceJson, targetJsonMap, updater, localesDir, updateOptions = {}) {
    const results = new Map();
    
    logger.info(`Starting batch complete translation with immediate updates for ${languageCodes.length} languages`);
    
    for (let i = 0; i < languageCodes.length; i++) {
      const langCode = languageCodes[i];
      
      try {
        logger.progress(i + 1, languageCodes.length, `Translating ${langCode}`);
        
        const targetJson = targetJsonMap.get(langCode) || {};
        
        // Translate the language
        const translationResult = await this.translateCompleteFile(
          langCode, 
          referenceJson, 
          targetJson
        );
        
        // Immediately update the file if translation succeeded
        if (translationResult.success && !config.isDryRun()) {
          logger.info(`Immediately updating ${langCode} after translation...`);
          const targetPath = path.join(localesDir, `${langCode}.json`);
          
          const updateResult = updater.updateCompleteTranslations(
            targetPath,
            translationResult.completeTranslations,
            updateOptions
          );
          
          // Combine translation and update results
          results.set(langCode, {
            ...translationResult,
            updateResult,
            immediateUpdate: true
          });
          
          if (updateResult.success) {
            logger.success(`${langCode}: Translation and update completed successfully`);
          } else {
            logger.error(`${langCode}: Translation succeeded but update failed - ${updateResult.error}`);
          }
        } else {
          results.set(langCode, {
            ...translationResult,
            immediateUpdate: false
          });
          
          if (!translationResult.success) {
            logger.error(`${langCode}: Translation failed - ${translationResult.errors?.join(', ')}`);
          }
        }
        
        // Add small delay between requests to be respectful to API
        if (i < languageCodes.length - 1) {
          await this.sleep(2000); // Longer delay since full translation takes more time
        }
        
      } catch (error) {
        logger.error(`Batch translation failed for ${langCode}`, error);
        results.set(langCode, {
          success: false,
          completeTranslations: {},
          translatedCount: 0,
          skippedCount: 0,
          errors: [error.message],
          immediateUpdate: false
        });
      }
    }
    
    return results;
  }

  /**
   * Batch translate multiple languages (full file mode) - legacy method
   * @param {Array} languageCodes - Array of language codes
   * @param {Object} referenceJson - Reference JSON object
   * @param {Map} targetJsonMap - Map of language code to target JSON
   * @returns {Promise<Map>} Map of language code to translation result
   */
  async batchTranslateComplete(languageCodes, referenceJson, targetJsonMap) {
    const results = new Map();
    
    logger.info(`Starting batch complete translation for ${languageCodes.length} languages`);
    
    for (let i = 0; i < languageCodes.length; i++) {
      const langCode = languageCodes[i];
      
      try {
        logger.progress(i + 1, languageCodes.length, `Translating ${langCode}`);
        
        const targetJson = targetJsonMap.get(langCode) || {};
        
        const result = await this.translateCompleteFile(
          langCode, 
          referenceJson, 
          targetJson
        );
        
        results.set(langCode, result);
        
        // Add small delay between requests to be respectful to API
        if (i < languageCodes.length - 1) {
          await this.sleep(2000); // Longer delay since full translation takes more time
        }
        
      } catch (error) {
        logger.error(`Batch translation failed for ${langCode}`, error);
        results.set(langCode, {
          success: false,
          completeTranslations: {},
          translatedCount: 0,
          skippedCount: 0,
          errors: [error.message]
        });
      }
    }
    
    return results;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      logger.info('Testing LLM API connection...');
      
      const testPrompt = 'Translate "Hello World" to Spanish. Respond with only valid JSON: {"hello": "Hola", "world": "Mundo"}';
      const response = await this.makeApiRequest(testPrompt);
      const parsed = this.parseTranslationResponse(response);
      
      if (parsed && typeof parsed === 'object' && parsed.hello && parsed.world) {
        logger.success('LLM API connection test successful');
        return true;
      } else {
        throw new Error('Invalid response format');
      }
      
    } catch (error) {
      logger.error('LLM API connection test failed', error);
      return false;
    }
  }
}

module.exports = TranslationService;
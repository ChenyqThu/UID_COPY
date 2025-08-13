const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class Validator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Reset validation state
   */
  reset() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Add validation error
   * @param {string} message - Error message
   * @param {Object} context - Additional context
   */
  addError(message, context = {}) {
    this.errors.push({ message, context, type: 'error' });
  }

  /**
   * Add validation warning
   * @param {string} message - Warning message
   * @param {Object} context - Additional context
   */
  addWarning(message, context = {}) {
    this.warnings.push({ message, context, type: 'warning' });
  }

  /**
   * Validate JSON file format and syntax
   * @param {string} filePath - Path to JSON file
   * @returns {Object} Validation result
   */
  validateJsonFile(filePath) {
    this.reset();

    try {
      if (!fs.existsSync(filePath)) {
        this.addError(`File does not exist: ${filePath}`);
        return this.getValidationResult();
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for empty file
      if (!content.trim()) {
        this.addError(`File is empty: ${filePath}`);
        return this.getValidationResult();
      }

      // Validate JSON syntax
      let jsonData;
      try {
        jsonData = JSON.parse(content);
      } catch (parseError) {
        this.addError(`Invalid JSON syntax: ${parseError.message}`, {
          file: filePath,
          parseError: parseError.message
        });
        return this.getValidationResult();
      }

      // Validate root structure
      if (typeof jsonData !== 'object' || jsonData === null || Array.isArray(jsonData)) {
        this.addError('JSON root must be an object', { file: filePath });
        return this.getValidationResult();
      }

      // Check for required structure patterns
      this.validateLocalizationStructure(jsonData, filePath);

      return this.getValidationResult();

    } catch (error) {
      this.addError(`File validation failed: ${error.message}`, {
        file: filePath,
        error: error.message
      });
      return this.getValidationResult();
    }
  }

  /**
   * Validate localization file structure
   * @param {Object} jsonData - Parsed JSON data
   * @param {string} filePath - File path for context
   */
  validateLocalizationStructure(jsonData, filePath) {
    // Check for common localization sections
    const expectedSections = ['menu', 'common', 'operation'];
    const actualSections = Object.keys(jsonData);

    for (const section of expectedSections) {
      if (!jsonData[section]) {
        this.addWarning(`Missing expected section: ${section}`, { file: filePath });
      }
    }

    // Validate nested structure
    this.validateNestedObject(jsonData, filePath, '');
  }

  /**
   * Recursively validate nested object structure
   * @param {Object} obj - Object to validate
   * @param {string} filePath - File path for context
   * @param {string} path - Current object path
   */
  validateNestedObject(obj, filePath, path) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Validate key format
      if (!this.isValidKey(key)) {
        this.addWarning(`Invalid key format: ${key}`, {
          file: filePath,
          path: currentPath
        });
      }

      // Validate value
      if (value === null || value === undefined) {
        this.addError(`Null or undefined value at: ${currentPath}`, {
          file: filePath,
          path: currentPath
        });
      } else if (typeof value === 'string') {
        this.validateTranslationString(value, filePath, currentPath);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        this.validateNestedObject(value, filePath, currentPath);
      } else if (Array.isArray(value)) {
        this.addWarning(`Array found in localization file: ${currentPath}`, {
          file: filePath,
          path: currentPath
        });
      } else if (typeof value !== 'string') {
        this.addWarning(`Non-string value in localization: ${currentPath} (${typeof value})`, {
          file: filePath,
          path: currentPath,
          valueType: typeof value
        });
      }
    }
  }

  /**
   * Validate translation string content
   * @param {string} value - Translation string
   * @param {string} filePath - File path for context
   * @param {string} path - Key path
   */
  validateTranslationString(value, filePath, path) {
    // Check for empty strings
    if (value.trim() === '') {
      this.addWarning(`Empty translation string at: ${path}`, {
        file: filePath,
        path
      });
    }

    // Check for placeholder consistency
    const placeholders = value.match(/\{[^}]+\}/g) || [];
    for (const placeholder of placeholders) {
      if (!this.isValidPlaceholder(placeholder)) {
        this.addWarning(`Invalid placeholder format: ${placeholder} at ${path}`, {
          file: filePath,
          path,
          placeholder
        });
      }
    }

    // Check for HTML tags (might indicate formatting issues)
    if (value.includes('<') || value.includes('>')) {
      this.addWarning(`Possible HTML content in translation: ${path}`, {
        file: filePath,
        path,
        value: value.substring(0, 100)
      });
    }
  }

  /**
   * Validate key format
   * @param {string} key - Key to validate
   * @returns {boolean} True if valid
   */
  isValidKey(key) {
    // Allow alphanumeric, underscore, hyphen
    return /^[a-zA-Z0-9_-]+$/.test(key);
  }

  /**
   * Validate placeholder format
   * @param {string} placeholder - Placeholder to validate
   * @returns {boolean} True if valid
   */
  isValidPlaceholder(placeholder) {
    // Check for basic placeholder format {variableName}
    return /^\{[a-zA-Z0-9_-]+\}$/.test(placeholder);
  }

  /**
   * Compare two JSON files for structural consistency
   * @param {string} referencePath - Path to reference file
   * @param {string} targetPath - Path to target file
   * @returns {Object} Comparison validation result
   */
  validateStructuralConsistency(referencePath, targetPath) {
    this.reset();

    try {
      const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
      const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

      this.compareStructures(reference, target, '', referencePath, targetPath);

      return this.getValidationResult();

    } catch (error) {
      this.addError(`Structural comparison failed: ${error.message}`, {
        reference: referencePath,
        target: targetPath
      });
      return this.getValidationResult();
    }
  }

  /**
   * Recursively compare object structures
   * @param {Object} reference - Reference object
   * @param {Object} target - Target object
   * @param {string} path - Current path
   * @param {string} refPath - Reference file path
   * @param {string} targetPath - Target file path
   */
  compareStructures(reference, target, path, refPath, targetPath) {
    for (const [key, refValue] of Object.entries(reference)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (!(key in target)) {
        this.addWarning(`Missing key in target: ${currentPath}`, {
          reference: refPath,
          target: targetPath,
          path: currentPath
        });
        continue;
      }

      const targetValue = target[key];
      const refType = typeof refValue;
      const targetType = typeof targetValue;

      if (refType !== targetType) {
        this.addError(`Type mismatch at ${currentPath}: reference(${refType}) vs target(${targetType})`, {
          reference: refPath,
          target: targetPath,
          path: currentPath,
          referenceType: refType,
          targetType: targetType
        });
        continue;
      }

      if (refType === 'object' && refValue !== null && !Array.isArray(refValue)) {
        this.compareStructures(refValue, targetValue, currentPath, refPath, targetPath);
      }
    }

    // Check for extra keys in target
    for (const key of Object.keys(target)) {
      if (!(key in reference)) {
        const currentPath = path ? `${path}.${key}` : key;
        this.addWarning(`Extra key in target: ${currentPath}`, {
          reference: refPath,
          target: targetPath,
          path: currentPath
        });
      }
    }
  }

  /**
   * Validate placeholder consistency between reference and translation
   * @param {string} referenceText - Reference text
   * @param {string} translatedText - Translated text
   * @param {string} path - Key path for context
   * @returns {boolean} True if consistent
   */
  validatePlaceholderConsistency(referenceText, translatedText, path) {
    const refPlaceholders = new Set(referenceText.match(/\{[^}]+\}/g) || []);
    const transPlaceholders = new Set(translatedText.match(/\{[^}]+\}/g) || []);

    // Check for missing placeholders
    for (const placeholder of refPlaceholders) {
      if (!transPlaceholders.has(placeholder)) {
        this.addError(`Missing placeholder in translation: ${placeholder} at ${path}`, {
          path,
          placeholder,
          reference: referenceText,
          translation: translatedText
        });
        return false;
      }
    }

    // Check for extra placeholders
    for (const placeholder of transPlaceholders) {
      if (!refPlaceholders.has(placeholder)) {
        this.addError(`Extra placeholder in translation: ${placeholder} at ${path}`, {
          path,
          placeholder,
          reference: referenceText,
          translation: translatedText
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Validate complete translation integrity
   * @param {string} referencePath - Path to reference file
   * @param {string} targetPath - Path to target file
   * @returns {Object} Full validation result
   */
  validateTranslationIntegrity(referencePath, targetPath) {
    this.reset();

    logger.debug(`Validating translation integrity: ${targetPath} against ${referencePath}`);

    // Basic file validation
    const referenceValidation = this.validateJsonFile(referencePath);
    const targetValidation = this.validateJsonFile(targetPath);

    if (!referenceValidation.isValid || !targetValidation.isValid) {
      this.addError('Basic file validation failed');
      return this.getValidationResult();
    }

    // Structural consistency
    const structuralValidation = this.validateStructuralConsistency(referencePath, targetPath);
    
    if (!structuralValidation.isValid) {
      this.addError('Structural consistency validation failed');
    }

    // Placeholder consistency validation
    try {
      const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
      const target = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      
      this.validatePlaceholdersRecursive(reference, target, '');
      
    } catch (error) {
      this.addError(`Placeholder validation failed: ${error.message}`);
    }

    return this.getValidationResult();
  }

  /**
   * Recursively validate placeholders in nested objects
   * @param {Object} reference - Reference object
   * @param {Object} target - Target object
   * @param {string} path - Current path
   */
  validatePlaceholdersRecursive(reference, target, path) {
    for (const [key, refValue] of Object.entries(reference)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (key in target) {
        const targetValue = target[key];
        
        if (typeof refValue === 'string' && typeof targetValue === 'string') {
          this.validatePlaceholderConsistency(refValue, targetValue, currentPath);
        } else if (typeof refValue === 'object' && typeof targetValue === 'object' && 
                   refValue !== null && targetValue !== null && 
                   !Array.isArray(refValue) && !Array.isArray(targetValue)) {
          this.validatePlaceholdersRecursive(refValue, targetValue, currentPath);
        }
      }
    }
  }

  /**
   * Get validation result
   * @returns {Object} Validation result
   */
  getValidationResult() {
    return {
      isValid: this.errors.length === 0,
      hasWarnings: this.warnings.length > 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
      errorCount: this.errors.length,
      warningCount: this.warnings.length
    };
  }

  /**
   * Generate validation report
   * @param {Object} validationResult - Validation result
   * @returns {string} Formatted report
   */
  generateReport(validationResult) {
    let report = '\n=== Validation Report ===\n';
    
    report += `Status: ${validationResult.isValid ? 'VALID' : 'INVALID'}\n`;
    report += `Errors: ${validationResult.errorCount}\n`;
    report += `Warnings: ${validationResult.warningCount}\n`;

    if (validationResult.errors.length > 0) {
      report += '\n--- ERRORS ---\n';
      validationResult.errors.forEach((error, index) => {
        report += `${index + 1}. ${error.message}\n`;
        if (error.context.path) {
          report += `   Path: ${error.context.path}\n`;
        }
        if (error.context.file) {
          report += `   File: ${error.context.file}\n`;
        }
      });
    }

    if (validationResult.warnings.length > 0) {
      report += '\n--- WARNINGS ---\n';
      validationResult.warnings.forEach((warning, index) => {
        report += `${index + 1}. ${warning.message}\n`;
        if (warning.context.path) {
          report += `   Path: ${warning.context.path}\n`;
        }
        if (warning.context.file) {
          report += `   File: ${warning.context.file}\n`;
        }
      });
    }

    return report;
  }
}

module.exports = Validator;
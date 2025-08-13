const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.loadEnvFile();
    this.config = {
      // LLM API Configuration
      llmApiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
      llmApiKey: process.env.LLM_API_KEY || '',
      llmModel: process.env.LLM_MODEL || 'gpt-4',
      llmTemperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
      llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 4000,

      // Translation Validation Configuration
      validationModel: process.env.VALIDATION_MODEL || 'gemini-2.0-flash-exp',

      // Translation Configuration
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 60000,
      batchSize: parseInt(process.env.BATCH_SIZE) || 50,
      backupEnabled: process.env.BACKUP_ENABLED === 'true',

      // Paths
      localesDir: path.resolve(process.cwd(), process.env.LOCALES_DIR || './locales'),
      referenceFile: process.env.REFERENCE_FILE || 'en_US.json',
      backupDir: path.resolve(process.cwd(), process.env.BACKUP_DIR || './backups'),
      logsDir: path.resolve(process.cwd(), process.env.LOGS_DIR || './logs'),

      // Debug
      debug: process.env.DEBUG === 'true',
      verbose: process.env.VERBOSE === 'true',
      dryRun: process.env.DRY_RUN === 'true'
    };

    this.validateConfig();
  }

  loadEnvFile() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath });
    }
  }

  validateConfig() {
    const errors = [];

    if (!this.config.llmApiKey) {
      errors.push('LLM_API_KEY is required');
    }

    if (!fs.existsSync(this.config.localesDir)) {
      errors.push(`Locales directory does not exist: ${this.config.localesDir}`);
    }

    const referencePath = path.join(this.config.localesDir, this.config.referenceFile);
    if (!fs.existsSync(referencePath)) {
      errors.push(`Reference file does not exist: ${referencePath}`);
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  ensureDirectories() {
    const dirs = [this.config.backupDir, this.config.logsDir];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }

  isDryRun() {
    return this.config.dryRun;
  }

  isDebug() {
    return this.config.debug;
  }

  isVerbose() {
    return this.config.verbose;
  }
}

module.exports = new Config();
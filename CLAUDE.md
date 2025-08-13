# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Setup and Testing
```bash
# Initial setup
cp .env.example .env  # Configure LLM API credentials
npm install

# Test system connectivity
node i18n-auto-translator.js test
npm test  # Run unit tests
```

### Translation Operations
```bash
# Translate single language (with immediate file updates)
node i18n-auto-translator.js translate --target de_DE

# Translate all languages (primary use case - now with immediate updates)
node i18n-auto-translator.js translate --all

# Preview mode (no file changes)
node i18n-auto-translator.js translate --all --dry-run

# Quick validation
node i18n-auto-translator.js validate --all
```

### New Key Analysis and Validation
```bash
# Extract new translation keys to CSV for analysis
node new-keys-csv-extractor.js

# AI-powered validation of new translation keys
node translation-validator.js

# Generate translation changes report
node translation-diff-analyzer.js
```

### Analysis and Monitoring
```bash
# Check overall translation status
node i18n-auto-translator.js status

# Compare files and find gaps
node i18n-auto-translator.js compare --all --summary-only
```

## System Architecture

### High-Level Flow
The system follows a pipeline architecture: **Analysis → Translation → Validation → Update**

1. **FileComparator** (`lib/file-comparator.js`) - Compares reference JSON (en_US.json) with target language files to identify missing keys
2. **TranslationService** (`lib/translation-service.js`) - Orchestrates LLM API calls using configurable prompts 
3. **TranslationUpdater** (`lib/translation-updater.js`) - Safely merges new translations into existing files with backup system
4. **Validator** (`lib/validator.js`) - Validates JSON structure, placeholder consistency, and translation integrity

### Core Components

**Main Controller** (`i18n-auto-translator.js`)
- CLI interface using Commander.js
- Coordinates the translation pipeline 
- Handles batch processing across multiple languages

**Configuration System** (`lib/config.js`)
- Centralized environment variable management
- Runtime validation of API credentials and paths
- Supports both .env files and environment variables

**Translation Engine** (`lib/translation-service.js`)
- LLM API integration with retry logic and exponential backoff
- Prompt template system with language-specific customization
- Batch processing with rate limiting

**Validation Framework** (`lib/validator.js`)
- Multi-layer validation: JSON syntax, structure consistency, placeholder integrity
- Compares reference and target files for structural differences
- Validates translation completeness and quality

### Key Data Flow

1. **Comparison Phase**: FileComparator creates a map of `language -> missingTranslations`
2. **Translation Phase**: TranslationService processes each language's missing keys via LLM API
3. **Update Phase**: TranslationUpdater merges results into target files with atomic operations
4. **Validation Phase**: Validator ensures integrity of updated files

### Configuration Architecture

**Language Configuration** (`language-config.json`)
- Contains 20+ language definitions with native names, text direction, and translation notes
- Language-specific instructions fed into LLM prompts for better translation quality

**Prompt System** (`prompts/translation-prompt.txt`)
- Template-based prompt generation with variable substitution
- Context-aware prompts that include reference JSON structure
- Language-specific customization via configuration

**Environment Configuration** (`.env`)
- LLM API settings (URL, key, model, temperature, tokens)
- Operational parameters (retries, timeouts, batch sizes)
- Path configuration and feature toggles (backup, dry-run, debug)

### Error Handling and Reliability

- **Backup System**: Automatic timestamped backups before any file modifications
- **Atomic Updates**: Either all translations succeed or none are applied  
- **Recovery Mechanisms**: Failed operations can be rolled back from backups
- **Comprehensive Logging**: Separate general and error logs with configurable verbosity

### File Organization

- `locales/` - Source of truth for all translation files (en_US.json is reference)
- `lib/` - Core business logic modules, each handling a specific concern
- `prompts/` - LLM prompt templates, easily reviewable and adjustable
- `backups/` - Auto-generated timestamped backups
- `logs/` - Timestamped operation logs for debugging and monitoring

## Critical Implementation Details

### Translation Key Management
- Uses dot-notation paths for nested JSON structures (e.g., "menu.settings.language")
- Deep merges preserve existing translations while adding missing ones
- Placeholder variables (like `{email}`, `{technicalSupport}`) must remain unchanged across languages

### API Integration
- Built for OpenAI GPT models but configurable for other LLM providers
- Implements exponential backoff retry logic for API reliability  
- Response parsing handles various JSON formatting from LLM responses

### Quality Assurance
- Structural validation ensures JSON hierarchy consistency across languages
- Placeholder validation prevents breaking of dynamic content substitution
- Post-translation validation runs automatically unless explicitly skipped

### Development Workflow
When modifying the system, always:
1. Test with `--dry-run` first to preview changes
2. Use single language targets for testing before batch operations
3. Monitor logs in `logs/` directory for API issues or validation failures
4. Reference `language-config.json` when adding new languages or adjusting translation rules

## New Workflow: Immediate Updates & AI Validation

### Immediate Update Mode
The system now updates translation files immediately after each language completion:
- **Benefits**: Can interrupt/resume translations, better error recovery, incremental progress
- **Usage**: Default behavior for all translation commands
- **Implementation**: `batchTranslateCompleteWithUpdates()` in `translation-service.js`

### New Key Analysis Pipeline
```bash
# 1. Run translation (files updated immediately)
node i18n-auto-translator.js translate --all

# 2. Extract new keys for validation
node new-keys-csv-extractor.js

# 3. AI-powered quality validation
node translation-validator.js
```

### Configuration for Validation
```env
# Standard translation model
LLM_MODEL=gemini-2.5-pro

# Stronger model for validation (supports file upload)
VALIDATION_MODEL=gemini-2.0-flash-exp
```

### File Upload Validation
- Uses Gemini Files API for large dataset validation
- Supports CSV file upload (no prompt length limits)
- Stronger models for comprehensive quality analysis
- Generates detailed Markdown reports with issues and recommendations

### Key Files
- `new-keys-csv-extractor.js` - Extracts new translation keys to CSV
- `translation-validator.js` - AI-powered validation with file upload
- `translation-diff-analyzer.js` - Generates detailed change reports
- `prompts/translation-validation-prompt.txt` - Validation prompt template

### Generated Reports
- `new-translation-keys.csv` - New keys for validation
- `translation-validation-report.md` - AI quality validation report
- `translation-changes-report.md` - Detailed changes analysis

### Project Structure
See `PROJECT_STRUCTURE.md` for complete file organization details.
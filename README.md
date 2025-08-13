# UID Auto Translator

Automated translation system for TP-Link Unified ID multi-language localization using LLM services.

## Features

- **Automated Translation**: Uses LLM API to translate missing keys
- **Immediate Updates**: Files updated after each language completion (allows interruption/resumption)
- **Batch Processing**: Translate multiple languages simultaneously  
- **Smart Comparison**: Identifies missing and extra keys automatically
- **Quality Validation**: Validates translations for consistency and structure
- **AI-Powered Validation**: CSV extraction and AI quality analysis
- **Backup System**: Automatic file backup before updates
- **Comprehensive Logging**: Detailed logs and progress tracking
- **Dry Run Mode**: Preview changes without applying them
- **Flexible Configuration**: Easy setup via environment variables

## Quick Start

### 1. Installation

```bash
# Copy .env.example to .env and configure
cp .env.example .env

# Install dependencies
npm install
```

### 2. Configuration

Edit `.env` file with your LLM API settings:

```env
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_api_key_here
LLM_MODEL=gpt-4
```

### 3. Test Setup

```bash
# Test API connection and configuration
node i18n-auto-translator.js test
```

### 4. Basic Usage

```bash
# Translate a single language
node i18n-auto-translator.js translate --target de_DE

# Translate all languages (with immediate updates)
node i18n-auto-translator.js translate --all

# Dry run (preview only)
node i18n-auto-translator.js translate --all --dry-run
```

## Complete Workflow

### Standard Translation Pipeline

```bash
# 1. Run translation with immediate updates
node i18n-auto-translator.js translate --all

# 2. Extract new keys for validation
node new-keys-csv-extractor.js

# 3. AI-powered quality validation
node translation-validator.js

# 4. Review validation report
cat translation-validation-report.md
```

### Additional Analysis Tools

```bash
# Generate translation changes report
node translation-diff-analyzer.js

# Check overall translation status
node i18n-auto-translator.js status

# Validate all files
node i18n-auto-translator.js validate --all
```

## Commands

### `translate`

Translate missing keys for target language(s).

```bash
node i18n-auto-translator.js translate [options]

Options:
  -t, --target <language>    Target language code (e.g., de_DE)
  -a, --all                  Translate all available languages
  -r, --reference <file>     Reference file (default: en_US.json)
  --dry-run                  Show what would be translated without making changes
  --overwrite                Overwrite existing translations
  --skip-validation          Skip post-translation validation
  --batch-size <size>        Number of keys per batch (default: 50)
```

### `validate`

Validate translation files without translating.

```bash
node i18n-auto-translator.js validate [options]

Options:
  -t, --target <language>    Target language code
  -a, --all                  Validate all language files
  -r, --reference <file>     Reference file (default: en_US.json)
  --structure-only           Only validate structure, skip content validation
```

### `compare`

Compare translation files and show differences.

```bash
node i18n-auto-translator.js compare [options]

Options:
  -t, --target <language>    Target language code
  -a, --all                  Compare all language files
  -r, --reference <file>     Reference file (default: en_US.json)
  --show-missing             Show only missing keys
  --show-extra               Show only extra keys
  --summary-only             Show only summary statistics
```

### `status`

Show overall translation status and statistics.

```bash
node i18n-auto-translator.js status [options]

Options:
  -r, --reference <file>     Reference file (default: en_US.json)
```

### `test`

Test API connection and configuration.

```bash
node i18n-auto-translator.js test
```

## Configuration

### Environment Variables (.env)

```env
# LLM API Configuration
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=your_api_key_here
LLM_MODEL=gpt-4
VALIDATION_MODEL=gemini-2.0-flash-exp  # Stronger model for validation
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4000

# Translation Configuration
MAX_RETRIES=3
REQUEST_TIMEOUT=60000
BATCH_SIZE=50
BACKUP_ENABLED=true

# Paths
LOCALES_DIR=./locales
REFERENCE_FILE=en_US.json
BACKUP_DIR=./backups
LOGS_DIR=./logs

# Debug
DEBUG=false
VERBOSE=false
DRY_RUN=false
```

### Language Configuration

Language-specific translation rules are configured in `language-config.json`:

```json
{
  "languages": {
    "de_DE": {
      "name": "German",
      "nativeName": "Deutsch",
      "direction": "ltr",
      "notes": "Use standard German. Capitalize nouns appropriately. Use formal 'Sie' form for system messages."
    }
  }
}
```

### Translation Prompts

The translation prompt template is in `prompts/translation-prompt.txt` and can be customized for different translation requirements.

## File Structure

```
├── i18n-auto-translator.js      # Main CLI application
├── translation-diff-analyzer.js # Translation changes analysis
├── new-keys-csv-extractor.js    # New keys CSV extraction
├── translation-validator.js     # AI-powered validation
├── lib/                         # Core modules
│   ├── config.js               # Configuration management
│   ├── logger.js               # Logging and error handling
│   ├── file-comparator.js      # File comparison logic
│   ├── translation-service.js  # LLM API integration
│   ├── translation-updater.js  # File update logic
│   └── validator.js            # Validation logic
├── prompts/
│   ├── translation-prompt.txt         # Translation prompt template
│   └── translation-validation-prompt.txt # Validation prompt template
├── language-config.json         # Language-specific configuration
├── locales/                    # Translation files
│   ├── en_US.json             # Reference file
│   ├── de_DE.json             # German translations
│   └── ...                    # Other language files
├── backups/                    # Backup files (auto-created)
├── logs/                       # Log files (auto-created)
├── translation-changes-report.md      # Translation changes report
├── new-translation-keys.csv           # New keys for validation
├── translation-validation-report.md   # AI validation report
└── .env                        # Environment configuration
```

## Detailed Workflow

### Core Translation Process

1. **Analysis**: Compare reference file with target language files
2. **Identification**: Find missing translation keys
3. **Translation**: Send missing keys to LLM API for translation
4. **Immediate Update**: Update files after each language completion
5. **Backup**: Create backup copies before updates
6. **Verification**: Final validation of updated files

### Extended Validation Pipeline

1. **Extract New Keys**: Generate CSV comparing current vs backup files
2. **AI Validation**: Upload CSV to LLM for comprehensive quality analysis
3. **Report Generation**: Detailed markdown report with issues and recommendations
4. **Issue Resolution**: Fix critical issues and re-validate

### Key Improvements

- **Immediate Updates**: Files are saved after each language (not batch end)
- **Interruption Safe**: Can stop/resume translations without losing progress
- **AI-Powered QA**: Dedicated validation using stronger models
- **File Upload**: No prompt length limits for large datasets
- **Comprehensive Reports**: Detailed analysis with actionable recommendations

## Best Practices

### For Translation Quality

- Use specific language instructions in `language-config.json`
- Review and adjust the prompt template for your domain
- Test with small batches first using `--dry-run`
- Always run AI validation after translations
- Use stronger models for validation (e.g., `gemini-2.0-flash-exp`)

### For Maintenance

- Run `status` command regularly to monitor translation coverage
- Use `translation-diff-analyzer.js` to track changes over time
- Generate validation reports periodically
- Keep backups of working translations
- Monitor logs for API issues or validation failures

### For Development

- Use `--dry-run` for testing changes
- Extract new keys to CSV for team review
- Test API connection before batch operations
- Review validation reports for quality improvements
- Use immediate updates for better progress tracking

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Check API key and URL in `.env`
   - Test with `node i18n-auto-translator.js test`
   - Verify network connectivity

2. **Translation Quality Issues**
   - Review language-specific notes in `language-config.json`
   - Adjust prompt template in `prompts/translation-prompt.txt`
   - Use smaller batch sizes for better context

3. **File Update Failures**
   - Check file permissions
   - Ensure backup directory is writable
   - Validate JSON structure of source files

4. **Validation Errors**
   - Run validation separately: `validate --all`
   - Use AI validation: `node translation-validator.js`
   - Check for missing placeholders in translations
   - Verify structural consistency

5. **AI Validation Issues**
   - Ensure API key has file upload permissions
   - Verify validation model supports file upload
   - Check CSV file format and content

### Log Files

- **General logs**: `logs/translation-YYYY-MM-DDTHH-mm-ss.log`
- **Error logs**: `logs/errors-YYYY-MM-DDTHH-mm-ss.log`

### Debug Mode

Enable debug logging:

```env
DEBUG=true
VERBOSE=true
```

## License

MIT License - See LICENSE file for details.

## Support

For issues and feature requests, please check the logs first and provide relevant error messages when reporting problems.
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const FormData = require('form-data');
const fetch = require('node-fetch');
const config = require('./lib/config');
const logger = require('./lib/logger');

class TranslationValidator {
  constructor() {
    this.apiKey = config.get('llmApiKey');
    // Use a stronger model for validation if specified, default to gemini-2.0-flash-exp
    this.validationModel = process.env.VALIDATION_MODEL || config.get('validationModel') || 'gemini-2.0-flash-exp';
    this.csvPath = './new-translation-keys.csv';
    this.outputPath = './translation-validation-report.md';
    this.promptTemplate = this.loadPromptTemplate();
    
    // Use GoogleGenerativeAI for file upload functionality
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  /**
   * Load validation prompt template
   * @returns {string} Prompt template
   */
  loadPromptTemplate() {
    try {
      const promptPath = path.resolve(process.cwd(), 'prompts', 'translation-validation-prompt.txt');
      return fs.readFileSync(promptPath, 'utf8');
    } catch (error) {
      logger.error('Failed to load validation prompt template', error);
      throw new Error('Validation prompt template is required');
    }
  }

  /**
   * Check if CSV file exists and has content
   * @returns {boolean} True if CSV is ready for validation
   */
  checkCSVFile() {
    if (!fs.existsSync(this.csvPath)) {
      console.error(`❌ CSV file not found: ${this.csvPath}`);
      console.log('💡 Please run the CSV extractor first: node new-keys-csv-extractor.js');
      return false;
    }

    const csvContent = fs.readFileSync(this.csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    
    if (lines.length <= 1) {
      console.log('✅ No new translation keys found in CSV. All translations appear to be up to date!');
      return false;
    }

    console.log(`📋 Found CSV with ${lines.length - 1} translation keys ready for validation`);
    return true;
  }

  /**
   * Parse CSV content and prepare for analysis
   * @returns {Object} Parsed CSV data
   */
  parseCSV() {
    const csvContent = fs.readFileSync(this.csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    
    if (lines.length <= 1) {
      return { headers: [], rows: [] };
    }

    // Parse CSV (basic parsing - assumes proper CSV formatting)
    const headers = this.parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => this.parseCSVLine(line));

    return { headers, rows };
  }

  /**
   * Simple CSV line parser (handles quoted values)
   * @param {string} line - CSV line
   * @returns {Array} Parsed values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last value
    values.push(current);
    
    return values;
  }

  /**
   * Build validation prompt (for file upload mode)
   * @returns {string} Complete validation prompt
   */
  buildValidationPrompt() {
    return this.promptTemplate;
  }

  /**
   * Upload CSV file to Gemini using Files API
   * @param {string} csvPath - Path to CSV file
   * @returns {Promise<Object>} Uploaded file info
   */
  async uploadCSVFile(csvPath) {
    try {
      console.log(`📤 Uploading CSV file: ${csvPath}`);
      
      // Create multipart form with metadata and file
      const form = new FormData();
      
      // Add metadata part
      form.append('metadata', JSON.stringify({
        file: {
          displayName: path.basename(csvPath)
        }
      }), {
        contentType: 'application/json'
      });
      
      // Add file part
      form.append('file', fs.createReadStream(csvPath), {
        contentType: 'text/csv'
      });
      
      const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'multipart',
        },
        body: form
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errorText}`);
      }
      
      const uploadResult = await uploadResponse.json();
      console.log(`✅ File uploaded successfully. Name: ${uploadResult.file.name}`);
      
      return uploadResult.file;
      
    } catch (error) {
      console.error('❌ File upload failed:', error.message);
      throw error;
    }
  }

  /**
   * Make API request for validation using file upload
   * @param {string} csvPath - Path to CSV file
   * @returns {Promise<string>} Validation response
   */
  async makeValidationRequest(csvPath) {
    try {
      console.log('🤖 Starting validation with file upload...');
      console.log(`🔧 Using model: ${this.validationModel}`);
      
      // Upload CSV file
      const uploadedFile = await this.uploadCSVFile(csvPath);
      
      // Build prompt
      const prompt = this.buildValidationPrompt();
      
      console.log('🔄 Generating validation analysis...');
      
      // Create request body for generate content with file
      const requestBody = {
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType: uploadedFile.mimeType,
                  fileUri: uploadedFile.uri
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      };
      
      // Make API call using fetch
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.validationModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      
      if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
        throw new Error('Invalid response format from API');
      }
      
      const text = result.candidates[0].content.parts[0].text;
      
      if (!text) {
        throw new Error('Empty response from LLM API');
      }
      
      console.log('✅ Validation analysis completed');
      console.log(`📄 Response length: ${text.length} characters`);
      
      // Clean up uploaded file
      try {
        const deleteResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${uploadedFile.name}?key=${this.apiKey}`, {
          method: 'DELETE'
        });
        if (deleteResponse.ok) {
          console.log('🗑️ Temporary file cleaned up');
        }
      } catch (cleanupError) {
        console.log('⚠️ Could not clean up temporary file (will auto-delete after 48 hours)');
      }
      
      return text.trim();
      
    } catch (error) {
      console.error('❌ LLM API request failed:', error.message);
      throw error;
    }
  }

  /**
   * Split large CSV into smaller chunks for validation
   * @param {Object} csvData - Parsed CSV data
   * @param {number} chunkSize - Number of rows per chunk
   * @returns {Array} Array of CSV chunks
   */
  splitCSVIntoChunks(csvData, chunkSize = 50) {
    const chunks = [];
    const { headers, rows } = csvData;
    
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunkRows = rows.slice(i, i + chunkSize);
      const chunkCSV = [headers, ...chunkRows]
        .map(row => row.join(','))
        .join('\n');
      
      chunks.push({
        csv: chunkCSV,
        startIndex: i,
        endIndex: Math.min(i + chunkSize - 1, rows.length - 1),
        rowCount: chunkRows.length
      });
    }
    
    return chunks;
  }

  /**
   * Run translation validation using file upload
   */
  async validateTranslations() {
    try {
      console.log('🔍 Starting translation validation process with file upload...');
      
      // Check if CSV file exists and has content
      if (!this.checkCSVFile()) {
        return;
      }

      // Parse CSV to get basic info
      const csvData = this.parseCSV();
      
      console.log(`📋 Analyzing ${csvData.rows.length} translation keys across ${csvData.headers.length - 2} languages`);
      console.log(`🌐 Languages: ${csvData.headers.slice(2).join(', ')}`);
      console.log(`🔧 Using validation model: ${this.validationModel}`);

      // Validate entire file at once using file upload
      const validationReport = await this.makeValidationRequest(this.csvPath);
      
      // Prepare final report content
      const reportContent = this.buildFinalReport(validationReport, csvData);
      
      // Save validation report
      fs.writeFileSync(this.outputPath, reportContent, 'utf8');
      
      console.log(`✅ Validation complete! Report saved to: ${this.outputPath}`);
      console.log(`📊 Report contains detailed analysis of translation quality and recommendations`);
      
      // Display quick summary if available
      this.displayQuickSummary(validationReport);

    } catch (error) {
      console.error('❌ Translation validation failed:', error.message);
      if (error.message.includes('API')) {
        console.log('💡 Please check your LLM API configuration in .env file');
      }
      if (error.message.includes('upload') || error.message.includes('file')) {
        console.log('💡 Please ensure your API key has file upload permissions');
      }
      process.exit(1);
    }
  }

  /**
   * Build final validation report from chunks
   * @param {Array} validationReports - Array of chunk validation reports
   * @param {Object} csvData - Original CSV data
   * @returns {string} Final report content
   */
  buildFinalReportFromChunks(validationReports, csvData) {
    const timestamp = new Date().toISOString();
    
    let report = '';
    report += '# Translation Quality Validation Report\n\n';
    report += `**Generated:** ${timestamp}\n`;
    report += `**Source CSV:** ${this.csvPath}\n`;
    report += `**Translation Keys Analyzed:** ${csvData.rows.length}\n`;
    report += `**Languages Validated:** ${csvData.headers.slice(2).join(', ')}\n`;
    report += `**Validation Chunks:** ${validationReports.length}\n\n`;
    report += '---\n\n';
    
    // Add each chunk's validation analysis
    for (const chunkReport of validationReports) {
      if (chunkReport.error) {
        report += `## Chunk ${chunkReport.chunkIndex} (Keys ${chunkReport.startKey}-${chunkReport.endKey}) - ERROR\n\n`;
        report += `❌ **Validation Failed:** ${chunkReport.error}\n\n`;
        report += '---\n\n';
      } else {
        report += `## Chunk ${chunkReport.chunkIndex} (Keys ${chunkReport.startKey}-${chunkReport.endKey})\n\n`;
        report += chunkReport.report;
        report += '\n\n---\n\n';
      }
    }
    
    report += '## Data Source\n\n';
    report += `This validation report was generated by analyzing new translation keys extracted from the localization system. `;
    report += `The analysis was performed using an AI language model to identify potential translation issues, `;
    report += `inconsistencies, and improvement opportunities.\n\n`;
    report += `**Validation Date:** ${timestamp}\n`;
    report += `**Validation Method:** AI-powered analysis using ${this.model}\n`;
    report += `**Source Data:** New translation keys from recent localization updates\n`;
    report += `**Processing Method:** Chunked analysis (${validationReports.length} chunks)\n`;

    return report;
  }

  /**
   * Build final validation report
   * @param {string} validationReport - LLM validation analysis
   * @param {Object} csvData - Original CSV data
   * @returns {string} Final report content
   */
  buildFinalReport(validationReport, csvData) {
    const timestamp = new Date().toISOString();
    
    let report = '';
    report += '# Translation Quality Validation Report\n\n';
    report += `**Generated:** ${timestamp}\n`;
    report += `**Source CSV:** ${this.csvPath}\n`;
    report += `**Translation Keys Analyzed:** ${csvData.rows.length}\n`;
    report += `**Languages Validated:** ${csvData.headers.slice(2).join(', ')}\n\n`;
    report += '---\n\n';
    
    // Add the LLM validation analysis
    report += validationReport;
    
    report += '\n\n---\n\n';
    report += '## Data Source\n\n';
    report += `This validation report was generated by analyzing new translation keys extracted from the localization system. `;
    report += `The analysis was performed using an AI language model to identify potential translation issues, `;
    report += `inconsistencies, and improvement opportunities.\n\n`;
    report += `**Validation Date:** ${timestamp}\n`;
    report += `**Validation Method:** AI-powered analysis using ${this.model}\n`;
    report += `**Source Data:** New translation keys from recent localization updates\n`;

    return report;
  }

  /**
   * Display quick summary from chunked validation reports
   * @param {Array} validationReports - Array of chunk validation reports
   */
  displayQuickSummaryFromChunks(validationReports) {
    try {
      console.log('\n📊 Quick Summary:');
      console.log(`   Total chunks processed: ${validationReports.length}`);
      
      let successfulChunks = 0;
      let failedChunks = 0;
      let totalIssues = 0;
      let totalCritical = 0;
      
      for (const chunk of validationReports) {
        if (chunk.error) {
          failedChunks++;
        } else {
          successfulChunks++;
          
          // Try to extract statistics from each chunk
          const issuesMatch = chunk.report.match(/Issues found:\s*(\d+)/i);
          const criticalMatch = chunk.report.match(/Critical issues:\s*(\d+)/i);
          
          if (issuesMatch) totalIssues += parseInt(issuesMatch[1]);
          if (criticalMatch) totalCritical += parseInt(criticalMatch[1]);
        }
      }
      
      console.log(`   Successful chunks: ${successfulChunks}`);
      console.log(`   Failed chunks: ${failedChunks}`);
      if (totalIssues > 0) console.log(`   Total issues found: ${totalIssues}`);
      if (totalCritical > 0) console.log(`   Total critical issues: ${totalCritical}`);
      
    } catch (error) {
      // If parsing fails, just skip the summary
      console.log(`   Validation completed with ${validationReports.length} chunks`);
    }
  }

  /**
   * Display quick summary from validation report
   * @param {string} validationReport - LLM validation analysis
   */
  displayQuickSummary(validationReport) {
    try {
      // Try to extract summary statistics from the report
      const summaryMatch = validationReport.match(/Total keys reviewed:\s*(\d+)/i);
      const issuesMatch = validationReport.match(/Issues found:\s*(\d+)/i);
      const criticalMatch = validationReport.match(/Critical issues:\s*(\d+)/i);
      
      if (summaryMatch || issuesMatch || criticalMatch) {
        console.log('\n📊 Quick Summary:');
        if (summaryMatch) console.log(`   Keys reviewed: ${summaryMatch[1]}`);
        if (issuesMatch) console.log(`   Issues found: ${issuesMatch[1]}`);
        if (criticalMatch) console.log(`   Critical issues: ${criticalMatch[1]}`);
      }
    } catch (error) {
      // If parsing fails, just skip the summary
    }
  }
}

// Run if called directly
if (require.main === module) {
  const validator = new TranslationValidator();
  validator.validateTranslations();
}

module.exports = TranslationValidator;
# UID 自动翻译系统

基于 LLM 的多语言本地化自动翻译系统，支持 20+ 种语言的智能翻译和质量验证。

## 🌟 特性

- 🤖 **智能翻译**: 基于 Google Gemini 的高质量翻译
- 🔄 **增量更新**: 只翻译缺失的键位，避免重复工作
- 📊 **即时更新**: 每完成一个语言立即保存，支持中断恢复
- 🛡️ **质量保证**: AI 驱动的翻译质量验证和问题检测
- 📋 **CSV 导出**: 新增翻译键位导出，便于人工审核
- 🔒 **安全备份**: 自动备份机制，支持回滚操作
- 📝 **详细日志**: 完整的操作日志和错误追踪

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，配置 API 密钥
```

必需配置：
```env
LLM_API_KEY=your_gemini_api_key_here
LLM_MODEL=gemini-2.5-pro
VALIDATION_MODEL=gemini-2.0-flash-exp
```

### 3. 测试连接

```bash
node i18n-auto-translator.js test
```

### 4. 开始翻译

```bash
# 翻译所有语言
node i18n-auto-translator.js translate --all

# 翻译特定语言
node i18n-auto-translator.js translate --target de_DE

# 预览模式（不实际修改文件）
node i18n-auto-translator.js translate --all --dry-run
```

## 📋 支持的语言

系统支持以下 20 种语言：

| 语言代码 | 语言名称 | 语言代码 | 语言名称 |
|---------|---------|---------|---------|
| ar_SA | العربية (阿拉伯语) | ko_KR | 한국어 (韩语) |
| bg_BG | Български (保加利亚语) | nl_NL | Nederlands (荷兰语) |
| cs_CZ | Čeština (捷克语) | pl_PL | Polski (波兰语) |
| de_DE | Deutsch (德语) | pt_PT | Português (葡萄牙语) |
| en_US | English (英语) - 参考语言 | ro_RO | Română (罗马尼亚语) |
| fr_FR | Français (法语) | ru_RU | Русский (俄语) |
| hu_HU | Magyar (匈牙利语) | sk_SK | Slovenčina (斯洛伐克语) |
| it_IT | Italiano (意大利语) | sr_SR | Српски (塞尔维亚语) |
| ja_JP | 日本語 (日语) | tr_TR | Türkçe (土耳其语) |
| | | uk_UA | Українська (乌克兰语) |
| | | zh_TW | 繁體中文 (繁体中文) |

## 🔧 完整工作流程

### 标准翻译流程

```bash
# 1. 运行翻译（文件立即更新）
node i18n-auto-translator.js translate --all

# 2. 提取新增键位进行分析
node new-keys-csv-extractor.js

# 3. AI 质量验证
node translation-validator.js
```

### 高级选项

```bash
# 验证翻译文件
node i18n-auto-translator.js validate --all

# 比较翻译文件差异
node i18n-auto-translator.js compare --all --summary-only

# 查看翻译状态
node i18n-auto-translator.js status
```

## 📊 质量验证系统

### 新增键位分析

`new-keys-csv-extractor.js` 工具会：
- 对比当前翻译文件与备份文件
- 识别所有新增的翻译键位
- 导出为 CSV 格式，便于审核
- 提供统计信息和示例

**输出文件**: `new-translation-keys.csv`

### AI 驱动的质量验证

`translation-validator.js` 工具提供：
- 🤖 使用强化模型进行深度分析
- 📤 文件上传方式，支持大型数据集
- 🔍 检测关键问题和潜在改进点
- 📝 生成详细的 Markdown 报告

**输出文件**: `translation-validation-report.md`

### 验证内容

- ✅ **完整性检查**: 识别缺失的翻译
- 🔧 **占位符保护**: 确保变量如 `{email}` 被正确保留
- 🎯 **翻译准确性**: 检查翻译是否传达正确含义
- 🌍 **文化适应性**: 标记可能不合适的翻译
- 📏 **长度合理性**: 检查异常长短的翻译
- 🔗 **术语一致性**: 确保术语在语言内一致

## 🛠️ 系统架构

```
项目结构/
├── locales/                    # 翻译文件目录
│   ├── en_US.json             # 英语参考文件
│   ├── de_DE.json             # 德语翻译
│   └── ...                    # 其他语言文件
├── backups/                   # 自动备份目录
├── lib/                       # 核心业务逻辑
│   ├── translation-service.js # 翻译服务
│   ├── translation-updater.js # 文件更新器
│   ├── file-comparator.js    # 文件比较器
│   └── validator.js          # 验证器
├── prompts/                   # LLM 提示词模板
├── logs/                      # 操作日志
├── new-keys-csv-extractor.js  # CSV 提取工具
├── translation-validator.js   # AI 验证工具
└── i18n-auto-translator.js   # 主程序
```

## ⚙️ 配置选项

### 环境变量

```env
# LLM API 配置
LLM_API_KEY=your_api_key_here
LLM_MODEL=gemini-2.5-pro
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=4000

# 验证配置
VALIDATION_MODEL=gemini-2.0-flash-exp

# 翻译配置
MAX_RETRIES=3
REQUEST_TIMEOUT=60000
BATCH_SIZE=50
BACKUP_ENABLED=true

# 路径配置
LOCALES_DIR=./locales
REFERENCE_FILE=en_US.json
BACKUP_DIR=./backups
LOGS_DIR=./logs

# 调试选项
DEBUG=false
VERBOSE=false
DRY_RUN=false
```

### 语言配置

`language-config.json` 包含：
- 语言名称和本地化名称
- 文本方向（LTR/RTL）
- 特定语言的翻译说明
- 文化和语言学指导

## 🔄 新功能：即时更新模式

### 优势
- ✅ **可中断恢复**: 翻译过程中可以安全中断和恢复
- ✅ **增量进度**: 每个语言完成后立即保存
- ✅ **错误隔离**: 单个语言失败不影响其他语言
- ✅ **更好的监控**: 实时查看翻译进度

### 实现原理
- 使用 `batchTranslateCompleteWithUpdates()` 方法
- 每个语言翻译完成后立即备份和更新
- 失败时自动回滚到备份版本

## 📈 使用统计

### 翻译状态报告

```bash
node i18n-auto-translator.js status
```

显示：
- 每种语言的完成百分比
- 缺失翻译键位数量
- 总体翻译进度
- 需要关注的语言

### 比较报告

```bash
node i18n-auto-translator.js compare --all --summary-only
```

提供：
- 文件间差异统计
- 缺失和多余的键位
- 完成度排名

## 🚨 故障排除

### 常见问题

1. **"API 连接失败"**
   - 检查 API 密钥是否正确
   - 验证网络连接
   - 确认 API 配额

2. **"没有找到备份文件"**
   - 正常情况，首次运行或新语言
   - 系统会将所有键位视为新增

3. **"文件上传失败"**
   - 确认 API 密钥有文件上传权限
   - 检查文件大小是否超限

4. **"验证模型不可用"**
   - 更新到支持的模型版本
   - 检查模型名称拼写

### 调试步骤

1. 运行系统测试：
   ```bash
   node i18n-auto-translator.js test
   ```

2. 检查日志文件：
   ```bash
   ls -la logs/
   ```

3. 使用预览模式：
   ```bash
   node i18n-auto-translator.js translate --all --dry-run
   ```

## 🤝 贡献指南

### 开发环境设置

```bash
# 克隆项目
git clone <repository-url>
cd uid-auto-translator

# 安装依赖
npm install

# 配置环境
cp .env.example .env
# 编辑 .env 文件

# 运行测试
npm test
```

### 代码规范

- 使用 ESLint 进行代码检查
- 遵循现有的代码风格
- 添加适当的注释和文档
- 编写单元测试覆盖新功能

### 提交流程

1. 创建功能分支
2. 实现功能并测试
3. 提交 Pull Request
4. 代码审查和合并

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📁 项目文件说明

### 主要脚本
- `i18n-auto-translator.js` - 主翻译程序
- `translation-diff-analyzer.js` - 翻译变更分析器
- `new-keys-csv-extractor.js` - 新键值CSV提取器  
- `translation-validator.js` - AI翻译验证器

### 生成的报告
- `translation-changes-report.md` - 翻译变更详细报告
- `new-translation-keys.csv` - 新增翻译键值表格
- `translation-validation-report.md` - AI质量验证报告

### 配置文件
- `language-config.json` - 语言特定配置
- `prompts/translation-prompt.txt` - 翻译提示词模板
- `prompts/translation-validation-prompt.txt` - 验证提示词模板

## 🔗 相关链接

- [English README](README.md)
- [系统架构文档](CLAUDE.md)
- [项目结构说明](PROJECT_STRUCTURE.md)
- [API 文档](https://ai.google.dev/gemini-api/docs)

## 📞 支持

如遇问题请：
1. 查看故障排除部分
2. 检查现有 Issues
3. 创建新的 Issue 描述问题
4. 提供详细的错误日志和环境信息

---

**🎯 UID 自动翻译系统 - 让多语言本地化变得简单高效！**
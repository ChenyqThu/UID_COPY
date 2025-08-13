# Project Structure

```
UID_COPY/
├── CLAUDE.md                           # Claude Code 指导文档
├── README.md                           # 英文项目说明
├── README_zh.md                        # 中文项目说明
├── WORKFLOW_GUIDE.md                   # 工作流程指南
├── PROJECT_STRUCTURE.md                # 项目结构说明
├── package.json                        # Node.js 依赖配置
├── package-lock.json                   # 锁定依赖版本
│
├── lib/                                # 核心业务逻辑模块
│   ├── config.js                       # 配置管理
│   ├── file-comparator.js              # 文件对比器
│   ├── logger.js                       # 日志系统
│   ├── translation-service.js          # 翻译服务
│   ├── translation-updater.js          # 翻译更新器
│   └── validator.js                    # 验证器
│
├── prompts/                            # LLM 提示词模板
│   ├── translation-prompt.txt          # 翻译提示词
│   └── translation-validation-prompt.txt # 验证提示词
│
├── locales/                            # 翻译文件目录
│   ├── en_US.json                      # 英文（参考）
│   ├── ar_SA.json                      # 阿拉伯语
│   ├── bg_BG.json                      # 保加利亚语
│   ├── cs_CZ.json                      # 捷克语
│   ├── de_DE.json                      # 德语
│   ├── fr_FR.json                      # 法语
│   ├── hu_HU.json                      # 匈牙利语
│   ├── it_IT.json                      # 意大利语
│   ├── ja_JP.json                      # 日语
│   ├── ko_KR.json                      # 韩语
│   ├── nl_NL.json                      # 荷兰语
│   ├── pl_PL.json                      # 波兰语
│   ├── pt_PT.json                      # 葡萄牙语
│   ├── ro_RO.json                      # 罗马尼亚语
│   ├── ru_RU.json                      # 俄语
│   ├── sk_SK.json                      # 斯洛伐克语
│   ├── sr_SR.json                      # 塞尔维亚语
│   ├── tr_TR.json                      # 土耳其语
│   ├── uk_UA.json                      # 乌克兰语
│   └── zh_TW.json                      # 繁体中文
│
├── backups/                            # 自动备份目录
│   ├── 时间戳_语言.json                   # 带时间戳的备份文件
│   └── 语言.json                        # 直接备份文件
│
├── logs/                               # 日志文件目录
│   ├── translation-时间戳.log            # 翻译操作日志
│   └── errors-时间戳.log                 # 错误日志
│
├── test/                               # 测试目录
│   └── test-runner.js                  # 测试运行器
│
├── i18n-auto-translator.js             # 主程序入口
├── translation-diff-analyzer.js        # 翻译差异分析器
├── new-keys-csv-extractor.js           # 新键值CSV提取器
├── translation-validator.js            # AI翻译验证器
├── language-config.json                # 语言配置文件
│
├── translation-changes-report.md       # 翻译变更报告
├── new-translation-keys.csv            # 新增翻译键值表
└── translation-validation-report.md    # AI验证报告
```

## 核心文件说明

### 主要执行文件
- `i18n-auto-translator.js` - 主程序，提供完整的翻译流水线
- `translation-diff-analyzer.js` - 分析翻译变更，生成差异报告
- `new-keys-csv-extractor.js` - 提取新增键值到CSV表格
- `translation-validator.js` - 使用AI进行翻译质量验证

### 核心业务模块 (lib/)
- `config.js` - 统一的配置管理系统
- `file-comparator.js` - 文件对比和缺失键值检测
- `translation-service.js` - LLM API集成和翻译服务
- `translation-updater.js` - 安全的文件更新机制
- `validator.js` - JSON结构和占位符验证
- `logger.js` - 分级日志记录系统

### 配置和模板
- `language-config.json` - 20+语言的详细配置
- `prompts/` - LLM提示词模板，支持变量替换

### 数据目录
- `locales/` - 所有翻译文件的存储位置
- `backups/` - 自动生成的时间戳备份
- `logs/` - 操作日志和错误记录

## 文件命名规范

### 翻译文件
- 格式：`{language_code}.json`
- 参考：en_US.json（英文作为翻译基准）

### 备份文件
- 时间戳格式：`YYYY-MM-DDTHH-mm-ss_{language_code}.json`
- 直接备份：`{language_code}.json`

### 日志文件
- 翻译日志：`translation-{timestamp}.log`
- 错误日志：`errors-{timestamp}.log`

### 报告文件
- 变更报告：`translation-changes-report.md`
- CSV导出：`new-translation-keys.csv`
- AI验证：`translation-validation-report.md`
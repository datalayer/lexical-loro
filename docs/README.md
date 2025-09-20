# Documentation Overview

This document provides an overview of all available documentation for the Lexical Loro project.

## Quick Navigation

### 📚 For Users
- **[README.md](../README.md)** - Main project overview and quick start guide
- **[API Documentation](API.md)** - Complete API reference for all components
- **[LexicalModel Guide](LEXICAL_MODEL_GUIDE.md)** - Comprehensive standalone library documentation

### 🚀 For Developers
- **[Development Guide](DEVELOPMENT.md)** - Contributing, testing, and development setup
- **[Initialization Guide](INITIALIZATION_GUIDE.md)** - Best practices for plugin setup
- **[Architecture](ARCHITECTURE.md)** - System design and technical details

### 📋 For Examples
- **[Examples README](../examples/README.md)** - Standalone library examples
- **[Source Examples README](../src/examples/README.md)** - React application examples

## Documentation Structure

```
docs/
├── README.md                    # This overview document
├── API.md                       # Complete API reference
├── INITIALIZATION_GUIDE.md      # Plugin setup best practices
├── ARCHITECTURE.md              # System design and data flow
├── DEVELOPMENT.md               # Contributing and development
└── LEXICAL_MODEL_GUIDE.md       # Standalone library guide
```

## Quick Start Paths

### 🎯 I want to add collaboration to my Lexical editor
1. Start with [README.md](../README.md#quick-start) for basic setup
2. Follow [INITIALIZATION_GUIDE.md](INITIALIZATION_GUIDE.md) for best practices
3. Reference [API.md](API.md) for configuration options

### 🛠️ I want to use the standalone LexicalModel library
1. See [LEXICAL_MODEL_GUIDE.md](LEXICAL_MODEL_GUIDE.md) for comprehensive guide
2. Check [examples/](../examples/) for practical usage examples
3. Reference [API.md](API.md#lexicalmodel-api) for API details

### 🔧 I want to contribute to the project
1. Read [DEVELOPMENT.md](DEVELOPMENT.md) for setup and guidelines
2. Understand the system with [ARCHITECTURE.md](ARCHITECTURE.md)
3. Follow [API.md](API.md) for implementation details

### 🏗️ I want to understand how it works
1. Start with [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
2. See [README.md](../README.md#architecture) for quick summary
3. Check [API.md](API.md) for detailed specifications

## Feature Matrix

| Feature | README | API | Init Guide | Architecture | Development | Model Guide |
|---------|--------|-----|------------|--------------|-------------|-------------|
| Quick Start | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Installation | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Basic Usage | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Plugin API | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Server API | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Model API | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Best Practices | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Architecture | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Development | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Examples | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Troubleshooting | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |

## Document Sizes

| Document | Lines | Purpose |
|----------|-------|---------|
| README.md | ~455 | Main overview and quick start |
| API.md | ~100 | Complete API reference |
| INITIALIZATION_GUIDE.md | ~150 | Plugin setup best practices |
| ARCHITECTURE.md | ~200 | System design and data flow |
| DEVELOPMENT.md | ~250 | Contributing and development |
| LEXICAL_MODEL_GUIDE.md | ~450 | Standalone library guide |

## Maintenance Notes

### When to Update Documentation

- **README.md**: Update for major feature additions, installation changes, or quick start modifications
- **API.md**: Update when APIs change, new methods are added, or signatures change
- **INITIALIZATION_GUIDE.md**: Update when plugin behavior changes or new best practices emerge
- **ARCHITECTURE.md**: Update for significant architectural changes or new components
- **DEVELOPMENT.md**: Update for new development processes, testing changes, or contribution guidelines
- **LEXICAL_MODEL_GUIDE.md**: Update when the standalone library changes or new examples are added

### Documentation Standards

- Use clear headings and consistent formatting
- Include practical code examples
- Keep examples up-to-date with current API
- Cross-reference related documentation
- Use appropriate emoji for visual clarity
- Maintain consistent tone and style

### Cross-References

Documents should reference each other appropriately:
- README links to detailed docs for specific topics
- API docs reference guides for usage examples
- Guides reference API docs for technical specifications
- Development docs reference architecture for understanding
- All docs can reference examples for practical usage

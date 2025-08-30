# Development Guide

## Core Components Development

### Plugin Development

```bash
# The plugin is a single TypeScript file
src/LoroCollaborativePlugin.tsx

# Dependencies for plugin development
npm install lexical @lexical/react @lexical/selection loro-crdt
```

**Key Development Areas:**
- WebSocket connection management
- Lexical editor integration
- CRDT synchronization
- Error handling and recovery
- User awareness features

### Server Development  

```bash
# Install Python package in development mode
pip install -e ".[dev]"

# Run tests
pytest lexical_loro/tests/ -v

# Start server in development mode  
python3 -m lexical_loro.cli --port 8081 --log-level DEBUG
```

**Key Development Areas:**
- WebSocket message handling
- Loro CRDT integration
- Client connection management
- Document state persistence
- Performance optimization

### LexicalModel Development

```bash
# Work on the standalone library
cd lexical_loro/model/

# Test specific functionality
python -m pytest ../tests/test_lexical_loro.py -v
```

**Key Development Areas:**
- Document serialization
- CRDT operations
- File I/O operations
- Error handling
- API design

## Testing

### Plugin Testing

```bash
npm run test              # Run Vitest tests
npm run test:js          # Run tests once
npm run test:watch       # Watch mode
```

**Test Coverage:**
- WebSocket connection handling
- CRDT synchronization
- Lexical integration
- Error scenarios
- User interactions

### Server Testing

```bash
npm run test:py          # Run Python tests
npm run test:py:watch    # Run in watch mode
npm run test:py:coverage # Run with coverage
```

**Test Coverage:**
- WebSocket server functionality
- Message routing
- Document state management
- Client connection handling
- Error conditions

### Integration Testing

```bash
# Start both servers and run full integration tests
npm run test:integration

# Test specific scenarios
python examples/collaboration_example.py
```

### Example Development

To work on the examples:

```bash
npm install                    # Install all dependencies
npm run example               # Start example app with both servers  
npm run example:py            # Start with Python server only
npm run example:js            # Start with Node.js server only
npm run example:vite          # Start example app only (no servers)
```

## Contributing

We welcome contributions to both the Lexical plugin and Python server:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`  
3. **Focus changes on core components:**
   - `src/LoroCollaborativePlugin.tsx` for plugin improvements
   - `lexical_loro/` for server enhancements
   - `lexical_loro/model/` for standalone library features
4. **Add tests for new functionality**
5. **Update documentation as needed**
6. **Submit a pull request**

### Development Guidelines

- **Plugin**: Keep the plugin self-contained and dependency-light
- **Server**: Maintain compatibility with loro-py and WebSocket standards  
- **Library**: Ensure standalone functionality works independently
- **Examples**: Use examples to demonstrate new features
- **Tests**: Ensure both JavaScript and Python tests pass

### Code Style

**TypeScript/JavaScript:**
- Use ESLint configuration
- Follow React best practices
- Add TypeScript types for all APIs
- Include JSDoc comments for public methods

**Python:**
- Follow PEP 8 style guidelines
- Use type hints for all functions
- Add docstrings for all public methods
- Maintain compatibility with Python 3.8+

### Pull Request Process

1. **Ensure all tests pass**
2. **Update documentation** if adding new features
3. **Add examples** for new functionality
4. **Write clear commit messages**
5. **Reference any related issues**

### Development Environment Setup

**Prerequisites:**
- Node.js 18+ for frontend development
- Python 3.8+ for backend development
- Git for version control

**Initial Setup:**
```bash
# Clone the repository
git clone https://github.com/datalayer/lexical-loro.git
cd lexical-loro

# Install Node.js dependencies
npm install

# Install Python package in development mode
pip install -e ".[dev]"

# Run all tests to verify setup
npm test
npm run test:py
```

### Debugging

**Client-Side Debugging:**
```tsx
// Enable debug mode in the plugin
<LoroCollaborativePlugin debug={true} />

// Check browser console for debug messages
// Use browser network tab to inspect WebSocket traffic
```

**Server-Side Debugging:**
```bash
# Enable debug logging
export LEXICAL_LORO_LOG_LEVEL=DEBUG
lexical-loro-server

# Use Python debugger
import pdb; pdb.set_trace()
```

### Performance Profiling

**JavaScript Profiling:**
```bash
# Use browser dev tools Performance tab
# Profile WebSocket message handling
# Monitor memory usage for large documents
```

**Python Profiling:**
```bash
# Use cProfile for server performance
python -m cProfile -o profile.stats server.py

# Analyze with snakeviz
pip install snakeviz
snakeviz profile.stats
```

### Release Process

1. **Update version numbers** in `package.json` and `pyproject.toml`
2. **Update CHANGELOG.md** with new features and fixes
3. **Run full test suite** on multiple platforms
4. **Create release branch** and tag
5. **Publish to npm** (for TypeScript plugin)
6. **Publish to PyPI** (for Python package)

### Common Development Tasks

**Adding a New Feature:**
1. Write tests first (TDD approach)
2. Implement the feature
3. Update documentation
4. Add examples if needed

**Fixing a Bug:**
1. Create a test that reproduces the bug
2. Fix the bug
3. Verify the test passes
4. Add regression tests if needed

**Improving Performance:**
1. Profile the current implementation
2. Identify bottlenecks
3. Implement optimizations
4. Measure performance improvement
5. Add performance tests

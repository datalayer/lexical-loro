[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# ✍️ 🦜 Lexical Loro - Tests Directory

This directory contains Python tests for the LORO collaborative editor.

## Test Files

### Core Tests (pytest)
- `test_cursors.py` - Cursor position and tracking tests
- `test_detailed.py` - Detailed functionality tests  
- `test_explore.py` - Exploration and discovery tests
- `test_export_mode.py` - Export mode functionality tests
- `test_lexical_loro.py` - Main lexical-loro integration tests
- `test_snapshot.py` - Snapshot functionality tests

### LoroModel Tests and Demos
- `test_loro_model.py` - Comprehensive LoroModel pytest suite and usage examples
- `showcase_loro_model.py` - Interactive showcase of LoroModel features (standalone)
- `demo_loro_model.py` - Real-world usage demos and examples (with DocumentBuilder)

## Running Tests

### Basic test run
```bash
npm run test:py
```

### Run specific LoroModel tests
```bash
# Run formal pytest tests
python -m pytest lexical_loro/tests/test_loro_model.py -v

# Run interactive showcase
python lexical_loro/tests/showcase_loro_model.py

# Run demo with real-world examples
python lexical_loro/tests/demo_loro_model.py

# Run comprehensive usage examples
python lexical_loro/tests/test_loro_model.py
```

### Run all tests

### Run tests with coverage
```bash
npm run test:py:coverage
```

### Run tests in watch mode (continuous testing)
```bash
npm run test:py:watch
```

## Test Files

- `test_cursors.py` - Tests for collaborative cursor functionality
- `test_detailed.py` - Detailed LORO document tests
- `test_explore.py` - Exploratory tests for LORO features
- `test_export_mode.py` - Tests for export functionality
- `test_snapshot.py` - Tests for document snapshots

## Requirements

The tests require the following Python packages (automatically installed via `requirements.txt`):
- pytest>=7.0.0
- pytest-cov>=4.0.0
- websockets>=12.0
- loro>=1.5.0

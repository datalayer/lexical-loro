# Tests Directory

This directory contains Python tests for the LORO collaborative editor.

## Running Tests

### Basic test run
```bash
npm run test:py
```

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

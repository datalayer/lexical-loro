# Document Isolation and Container Logic Tests

This directory contains comprehensive tests for verifying that the simplified container logic works correctly while maintaining proper document isolation based on `doc_id`.

## Test Files Overview

### 1. `test_document_isolation.py`
Tests that multiple documents with different `doc_id` values are completely isolated from each other.

**Key Test Scenarios:**
- ✅ **Basic document isolation** - Different doc_ids create separate documents
- ✅ **Content length isolation** - Documents with different content have different serialized lengths  
- ✅ **Modification isolation** - Changes to one document don't affect another
- ✅ **Same doc_id returns same instance** - Requesting same doc_id multiple times returns same instance
- ✅ **Many documents isolation** - Test with 10 documents to ensure no cross-contamination
- ✅ **Content container consistency** - All documents use "content" internally but remain isolated

### 2. `test_server_document_management.py`
Tests server-like document management scenarios with multiple clients and collaborative access patterns.

**Key Test Scenarios:**
- ✅ **Basic document manager** - Server-like document creation and retrieval
- ✅ **Multiple clients same document** - Multiple clients working on the same document
- ✅ **Clients on different documents** - Clients working on different documents simultaneously
- ✅ **Client disconnect and reconnect** - Document persistence across client sessions
- ✅ **High load scenario** - Managing 50 documents with 2-5 clients each
- ✅ **Concurrent modifications** - Multiple clients modifying the same document
- ✅ **Memory efficiency** - Document instances are properly shared, not duplicated

### 3. `test_container_logic_consistency.py`
Tests that the simplified container logic (always using "content") works consistently across all operations.

**Key Test Scenarios:**
- ✅ **All documents use content container** - Every document consistently uses "content" internally
- ✅ **Sync operations consistency** - All sync operations use "content" container
- ✅ **No special case container names** - No legacy special cases for container names
- ✅ **Container ID vs internal separation** - doc_id is separate from internal container name
- ✅ **Broadcast data uses correct doc_id** - WebSocket messages use proper doc_id
- ✅ **Serialization consistency** - JSON serialization works with simplified logic
- ✅ **Loro snapshot operations** - Snapshot/import works with simplified containers
- ✅ **Update operations consistency** - Document updates work correctly
- ✅ **Edge cases** - Unusual doc_ids (Unicode, spaces, symbols, etc.) work correctly

## Architecture Validation

These tests confirm the key architectural principles:

### ✅ **Document Isolation**
```
Server Level:
├── Document Store: {"doc-1": ModelA, "doc-2": ModelB}
│
├── ModelA (doc_id="doc-1")
│   ├── LoroDoc A
│   │   └── Container "content" (Doc-1's data)
│   └── LexicalModel A
│
└── ModelB (doc_id="doc-2") 
    ├── LoroDoc B
    │   └── Container "content" (Doc-2's data)  
    └── LexicalModel B
```

### ✅ **Container Logic Simplification**
- **Before**: Complex special case handling for `["content", "lexical-shared-doc", "shared-text"]`
- **After**: Always use `"content"` as internal container name
- **Result**: Simpler, more maintainable code with guaranteed consistency

### ✅ **Isolation Mechanism**
- **Document-level isolation** happens via separate `LoroDoc` instances per `doc_id`
- **Container-level consistency** via uniform `"content"` naming within each `LoroDoc`
- **Client-server communication** uses `doc_id` for routing and identification

## Running the Tests

```bash
# Run all document isolation tests
python -m pytest lexical_loro/tests/test_document_isolation.py -v

# Run server management tests  
python -m pytest lexical_loro/tests/test_server_document_management.py -v

# Run container logic tests
python -m pytest lexical_loro/tests/test_container_logic_consistency.py -v

# Run all together
python -m pytest lexical_loro/tests/test_document_isolation.py lexical_loro/tests/test_server_document_management.py lexical_loro/tests/test_container_logic_consistency.py -v
```

## Test Coverage

- **22 total tests** covering all aspects of document management
- **Document isolation verification** with various scenarios
- **Server-like management patterns** simulation
- **Container logic consistency** validation
- **Edge cases and high load** scenarios
- **Memory efficiency and performance** checks

These tests provide comprehensive validation that the simplified container logic maintains all required functionality while improving code maintainability and consistency.

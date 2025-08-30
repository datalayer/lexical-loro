[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# ✍️ 🦜 Lexical Loro Examples

This directory contains practical examples demonstrating how to use LexicalModel as a standalone library for various use cases.

## Available Examples

### 1. Memory-only Usage (`memory_only_example.py`)

Demonstrates basic LexicalModel usage without file persistence:

- Creating documents in memory
- Adding different types of blocks (headings, paragraphs)
- Getting document statistics and information
- JSON export capabilities

**Run:**
```bash
python examples/memory_only_example.py
```

### 2. File-based Sync (`file_sync_example.py`)

Shows how to persist and load documents from files:

- Saving documents to JSON files
- Loading documents from JSON files
- Updating and re-saving documents
- Batch file operations
- Comparing document versions

**Run:**
```bash
python examples/file_sync_example.py
```

### 3. Real-time Collaboration (`collaboration_example.py`)

Simulates real-time collaboration between multiple users:

- Creating and sharing document snapshots
- Importing changes from other users
- Concurrent editing scenarios
- Conflict-free merging with Loro CRDTs
- Verification of synchronized state

**Run:**
```bash
python examples/collaboration_example.py
```

## Requirements

All examples require:
- Python 3.11+
- `lexical-loro` package installed
- `loro-crdt` Python package

## Installation

```bash
# Install from the project root
pip install -e .

# Or install dependencies directly
pip install loro-crdt
```

## Running Examples

From the project root directory:

```bash
# Run individual examples
python examples/memory_only_example.py
python examples/file_sync_example.py
python examples/collaboration_example.py

# Or run all examples
python -m examples.memory_only_example
python -m examples.file_sync_example
python -m examples.collaboration_example
```

## Example Output

### Memory-only Example
```
🚀 LexicalModel Memory-only Example
==================================================
1. Creating a new document...
   ✅ Created document: LoroModel(blocks=0, source='Lexical Loro', version='0.34.0', mode=subscribed)

2. Adding content...
   ✅ Added title
   ✅ Added first paragraph
   ✅ Added second paragraph
   ✅ Added subheading
   ✅ Added feature 1
   ✅ Added feature 2
   ✅ Added feature 3
   ✅ Added feature 4

3. Document Statistics:
   📊 Total blocks: 8
   📊 Block types: {'heading': 2, 'paragraph': 6}
   📊 Total text length: 187

✅ Memory-only example completed successfully!
```

### File-based Sync Example
```
💾 LexicalModel File-based Sync Example
==================================================
📁 Working in temporary directory: /tmp/tmp123abc

1. Creating and saving a document...
   ✅ Document saved to /tmp/tmp123abc/my_document.json
   📏 File size: 982 bytes

2. Loading the document...
   ✅ Document loaded successfully
   📊 Loaded 4 blocks

✅ File-based sync example completed successfully!
```

### Collaboration Example
```
🤝 LexicalModel Real-time Collaboration Simulation
============================================================
Scenario: Two users collaborating on a project document

👤 User A: Creating initial document...
   ✅ User A created document with 5 blocks

📤 User A: Creating snapshot to share...
   📦 Snapshot size: 1234 bytes

👤 User B: Joining collaboration...
   ✅ User B imported snapshot successfully
   📊 User B has 5 blocks

✅ Real-time collaboration simulation completed successfully!
```

## Key Features Demonstrated

1. **Document Creation**: Creating new LexicalModel instances
2. **Content Management**: Adding, updating, and removing blocks
3. **Serialization**: Converting to/from JSON format
4. **File Persistence**: Saving and loading from files
5. **Collaboration**: Sharing changes between multiple users
6. **CRDT Synchronization**: Conflict-free merging of concurrent edits
7. **Error Handling**: Robust error handling patterns
8. **Document Analysis**: Getting statistics and information

## Advanced Usage

For more advanced usage patterns, see the comprehensive guide in `docs/LEXICAL_MODEL_GUIDE.md`.

## Integration with Web Applications

These examples can be adapted for web applications:

```python
# Flask integration example
from flask import Flask, request, jsonify
from lexical_loro.model.lexical_model import LexicalModel

app = Flask(__name__)
documents = {}

@app.route('/api/documents/<doc_id>')
def get_document(doc_id):
    if doc_id not in documents:
        documents[doc_id] = LexicalModel.create_document(doc_id)
    return jsonify(json.loads(documents[doc_id].to_json()))

@app.route('/api/documents/<doc_id>/save')
def save_document(doc_id):
    if doc_id in documents:
        success = documents[doc_id].save_to_file(f'docs/{doc_id}.json')
        return jsonify({'success': success})
    return jsonify({'error': 'Document not found'}), 404
```

## Testing

You can also use these examples as a basis for testing your own integrations:

```python
# Test your integration
from examples.memory_only_example import extract_text_from_block
from lexical_loro.model.lexical_model import LexicalModel

def test_my_integration():
    model = LexicalModel.create_document("test-doc")
    model.add_block({"text": "Test content"}, "paragraph")
    
    blocks = model.get_blocks()
    assert len(blocks) == 1
    assert extract_text_from_block(blocks[0]) == "Test content"
    
    print("✅ Integration test passed!")

if __name__ == "__main__":
    test_my_integration()
```

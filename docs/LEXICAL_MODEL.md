# LexicalModel Standalone Library Guide

The LexicalModel library provides a powerful, standalone way to work with Lexical editor data using Loro CRDTs for real-time collaboration and conflict-free data synchronization.

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Core Concepts](#core-concepts)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Advanced Features](#advanced-features)

## Installation

```bash
pip install lexical-loro
```

Or install from source:

```bash
git clone https://github.com/datalayer/lexical-loro.git
cd lexical-loro
pip install -e .
```

## Quick Start

### Basic Usage

```python
from lexical_loro.model.lexical_model import LexicalModel

# Create a new document
model = LexicalModel.create_document("my-doc")

# Add some content
model.add_block({"text": "Hello, World!"}, "paragraph")
model.add_block({"text": "Welcome to Lexical with Loro"}, "heading1")

# Get the content
blocks = model.get_blocks()
print(f"Document has {len(blocks)} blocks")

# Export as JSON
json_data = model.to_json()
print(json_data)
```

### File-based Persistence

```python
from lexical_loro.model.lexical_model import LexicalModel

# Create and populate a document
model = LexicalModel.create_document("my-doc")
model.add_block({"text": "Persistent content"}, "paragraph")

# Save to file
model.save_to_file("my_document.json")

# Load from file later
loaded_model = LexicalModel.load_from_file("my_document.json")
print(f"Loaded document with {len(loaded_model.get_blocks())} blocks")
```

## Core Concepts

### LexicalModel

The `LexicalModel` class is the main interface for working with Lexical models. It manages:

- **Lexical Data Structure**: The hierarchical document structure with blocks and text nodes
- **Loro Integration**: CRDT-based synchronization for conflict-free collaboration
- **Ephemeral Data**: Cursor positions, selections, and awareness information
- **Event System**: Structured callbacks for document changes and ephemeral updates

### Document Structure

LexicalModel works with Lexical's JSON format:

```json
{
  "root": {
    "children": [
      {
        "type": "heading",
        "tag": "h1",
        "children": [
          {
            "type": "text",
            "text": "Document Title"
          }
        ]
      },
      {
        "type": "paragraph",
        "children": [
          {
            "type": "text",
            "text": "Paragraph content"
          }
        ]
      }
    ]
  },
  "lastSaved": 1693123456789,
  "source": "Lexical Loro",
  "version": "0.34.0"
}
```

### CRDT Synchronization

LexicalModel uses Loro CRDTs to enable:

- **Conflict-free merging** of concurrent edits
- **Snapshot export/import** for full document state
- **Incremental updates** for efficient synchronization
- **Real-time collaboration** without central coordination

## API Reference

### Class Methods

#### `LexicalModel.create_document(doc_id, initial_content=None, event_callback=None, ephemeral_timeout=300000)`

Creates a new LexicalModel instance.

**Parameters:**
- `doc_id` (str): Unique identifier for the document
- `initial_content` (str, optional): Initial JSON content to seed the document
- `event_callback` (function, optional): Callback for structured events
- `ephemeral_timeout` (int): Timeout for ephemeral data in milliseconds

**Returns:** `LexicalModel` instance

#### `LexicalModel.from_json(json_data, container_id=None, event_callback=None, ephemeral_timeout=300000)`

Creates a LexicalModel from JSON data.

**Parameters:**
- `json_data` (str): JSON string containing lexical data
- `container_id` (str, optional): Container ID for the model
- `event_callback` (function, optional): Event callback
- `ephemeral_timeout` (int): Ephemeral data timeout

**Returns:** `LexicalModel` instance

#### `LexicalModel.load_from_file(file_path, container_id=None, event_callback=None, ephemeral_timeout=300000)`

Loads a LexicalModel from a JSON file.

**Parameters:**
- `file_path` (str): Path to the JSON file
- `container_id` (str, optional): Container ID for the model
- `event_callback` (function, optional): Event callback
- `ephemeral_timeout` (int): Ephemeral data timeout

**Returns:** `LexicalModel` instance or `None` if failed

### Instance Methods

#### Content Management

- `add_block(block_detail, block_type)`: Add a new block to the document
- `get_blocks()`: Get all blocks from the document
- `get_lexical_data()`: Get the complete lexical data structure
- `update_block(index, block_detail, block_type=None)`: Update an existing block
- `remove_block(index)`: Remove a block by index

#### Serialization

- `to_json(include_metadata=True)`: Export as JSON string
- `save_to_file(file_path, include_metadata=True)`: Save to JSON file

#### Synchronization

- `get_snapshot()`: Export current state as bytes for synchronization
- `import_snapshot(snapshot_bytes)`: Import a snapshot from bytes
- `apply_update(update_bytes)`: Apply an incremental update
- `export_update()`: Export pending changes (if any)

#### Information

- `get_document_info()`: Get document metadata and statistics
- `get_block_summary()`: Get summary of block structure

## Usage Examples

### Example 1: Memory-only Document Creation

```python
from lexical_loro.model.lexical_model import LexicalModel

def create_sample_document():
    # Create a new document
    model = LexicalModel.create_document("sample-doc")
    
    # Add a title
    model.add_block({
        "text": "My Sample Document",
        "format": 0,
        "style": ""
    }, "heading1")
    
    # Add some paragraphs
    model.add_block({
        "text": "This is the first paragraph of my document.",
        "format": 0
    }, "paragraph")
    
    model.add_block({
        "text": "This is the second paragraph with some content.",
        "format": 0
    }, "paragraph")
    
    # Add a subheading
    model.add_block({
        "text": "Section 1",
        "format": 0
    }, "heading2")
    
    model.add_block({
        "text": "Content under section 1.",
        "format": 0
    }, "paragraph")
    
    return model

# Create and use the document
doc = create_sample_document()
print(f"Created document with {len(doc.get_blocks())} blocks")

# Get summary
summary = doc.get_block_summary()
print(f"Block types: {summary['block_types']}")
print(f"Total text length: {summary['total_text_length']}")
```

### Example 2: File-based Document Workflow

```python
from lexical_loro.model.lexical_model import LexicalModel
import os

def document_workflow():
    # Step 1: Create a new document
    model = LexicalModel.create_document("workflow-doc")
    
    # Step 2: Add initial content
    model.add_block({"text": "Project Notes"}, "heading1")
    model.add_block({"text": "Initial thoughts and ideas."}, "paragraph")
    
    # Step 3: Save to file
    file_path = "project_notes.json"
    if model.save_to_file(file_path):
        print(f"Document saved to {file_path}")
    
    # Step 4: Later, load the document
    loaded_model = LexicalModel.load_from_file(file_path)
    if loaded_model:
        print("Document loaded successfully")
        
        # Step 5: Add more content
        loaded_model.add_block({"text": "Additional notes"}, "paragraph")
        loaded_model.add_block({"text": "Action Items"}, "heading2")
        loaded_model.add_block({"text": "1. Review the proposal"}, "paragraph")
        loaded_model.add_block({"text": "2. Schedule team meeting"}, "paragraph")
        
        # Step 6: Save updated version
        loaded_model.save_to_file("project_notes_updated.json")
        
        # Step 7: Show final content
        final_blocks = loaded_model.get_blocks()
        print(f"Final document has {len(final_blocks)} blocks")
        
        for i, block in enumerate(final_blocks):
            block_type = block.get('type', 'unknown')
            text_content = extract_text_from_block(block)
            print(f"  {i+1}. {block_type}: {text_content}")
    
    # Cleanup
    for file in ["project_notes.json", "project_notes_updated.json"]:
        if os.path.exists(file):
            os.remove(file)

def extract_text_from_block(block):
    """Helper function to extract text from a block"""
    text_parts = []
    for child in block.get('children', []):
        if child.get('type') == 'text':
            text_parts.append(child.get('text', ''))
    return ''.join(text_parts)

# Run the workflow
document_workflow()
```

### Example 3: Real-time Collaboration Simulation

```python
from lexical_loro.model.lexical_model import LexicalModel
import json

def collaboration_simulation():
    # Simulate two users working on the same document
    
    # User A creates a document
    doc_a = LexicalModel.create_document("collab-doc")
    doc_a.add_block({"text": "Collaborative Document"}, "heading1")
    doc_a.add_block({"text": "User A's contribution"}, "paragraph")
    
    # Get snapshot from User A
    snapshot_a = doc_a.get_snapshot()
    print(f"User A created snapshot: {len(snapshot_a)} bytes")
    
    # User B starts with the same document
    doc_b = LexicalModel.create_document("collab-doc")
    doc_b.import_snapshot(snapshot_a)
    
    # User B adds content
    doc_b.add_block({"text": "User B's contribution"}, "paragraph")
    doc_b.add_block({"text": "Collaboration Section"}, "heading2")
    
    # Get User B's changes
    snapshot_b = doc_b.get_snapshot()
    
    # User A applies User B's changes
    doc_a.import_snapshot(snapshot_b)
    
    # User A adds more content
    doc_a.add_block({"text": "Final thoughts from User A"}, "paragraph")
    
    # Final state
    final_blocks = doc_a.get_blocks()
    print(f"\\nFinal collaborative document has {len(final_blocks)} blocks:")
    
    for i, block in enumerate(final_blocks):
        block_type = block.get('type', 'unknown')
        text_content = extract_text_from_block(block)
        print(f"  {i+1}. {block_type}: {text_content}")

# Run the simulation
collaboration_simulation()
```

### Example 4: Document Templates and Batch Operations

```python
from lexical_loro.model.lexical_model import LexicalModel

def create_meeting_notes_template():
    """Create a meeting notes template"""
    model = LexicalModel.create_document("meeting-template")
    
    # Template structure
    template_structure = [
        ("Meeting Notes", "heading1"),
        ("Date: [Insert Date]", "paragraph"),
        ("Attendees: [Insert Attendees]", "paragraph"),
        ("Agenda", "heading2"),
        ("1. [Agenda Item 1]", "paragraph"),
        ("2. [Agenda Item 2]", "paragraph"),
        ("3. [Agenda Item 3]", "paragraph"),
        ("Discussion", "heading2"),
        ("[Notes from discussion]", "paragraph"),
        ("Action Items", "heading2"),
        ("[ ] [Action item 1]", "paragraph"),
        ("[ ] [Action item 2]", "paragraph"),
        ("Next Meeting", "heading2"),
        ("Date: [Next meeting date]", "paragraph")
    ]
    
    # Add all template blocks
    for text, block_type in template_structure:
        model.add_block({"text": text}, block_type)
    
    return model

def batch_document_creation():
    """Create multiple models from template"""
    template = create_meeting_notes_template()
    
    # Save template
    template.save_to_file("meeting_template.json")
    
    # Create multiple meeting models
    meetings = [
        "weekly_standup_2024_08_29",
        "project_review_2024_08_29", 
        "planning_session_2024_08_29"
    ]
    
    for meeting_name in meetings:
        # Load template
        meeting_doc = LexicalModel.load_from_file("meeting_template.json", 
                                                  container_id=meeting_name)
        
        # Customize the first block (title)
        blocks = meeting_doc.get_blocks()
        if blocks:
            # Update the title
            meeting_doc.update_block(0, {
                "text": f"Meeting Notes - {meeting_name.replace('_', ' ').title()}"
            })
        
        # Save customized meeting document
        filename = f"{meeting_name}.json"
        meeting_doc.save_to_file(filename)
        print(f"Created {filename}")
    
    # Cleanup
    import os
    for file in ["meeting_template.json"] + [f"{m}.json" for m in meetings]:
        if os.path.exists(file):
            os.remove(file)

# Create templates and models
batch_document_creation()
```

## Advanced Features

### Event Callbacks

You can register callbacks to be notified of document changes:

```python
def on_document_change(event_type, event_data):
    print(f"Event: {event_type}")
    if event_type == "document_changed":
        model = event_data.get("model")
        print(f"Document now has {len(model.get_blocks())} blocks")
    elif event_type == "ephemeral_changed":
        print("Ephemeral data (cursors, selections) changed")

model = LexicalModel.create_document("callback-doc", event_callback=on_document_change)
model.add_block({"text": "This will trigger an event"}, "paragraph")
```

### Ephemeral Data Management

Handle cursor positions and selections:

```python
# Create model with ephemeral support
model = LexicalModel.create_document("ephemeral-doc", ephemeral_timeout=60000)

# Ephemeral data is automatically managed for real-time features
# like cursor positions, text selections, and user awareness
```

### Document Information and Statistics

```python
# Get detailed document information
info = model.get_document_info()
print(f"Container ID: {info['container_id']}")
print(f"Content length: {info['content_length']}")
print(f"Number of blocks: {info['lexical_blocks']}")

# Get block summary
summary = model.get_block_summary()
print(f"Block types: {summary['block_types']}")
print(f"Total text length: {summary['total_text_length']}")
```

### Error Handling

The library includes comprehensive error handling:

```python
try:
    model = LexicalModel.load_from_file("nonexistent.json")
    if model is None:
        print("Failed to load document")
except Exception as e:
    print(f"Error: {e}")

# Serialization with error handling
try:
    json_data = model.to_json()
    success = model.save_to_file("backup.json")
    if not success:
        print("Save operation failed")
except Exception as e:
    print(f"Serialization error: {e}")
```

## Integration Examples

### With Web Frameworks

The LexicalModel can be easily integrated with web frameworks:

```python
# Flask example
from flask import Flask, request, jsonify
from lexical_loro.model.lexical_model import LexicalModel

app = Flask(__name__)
models = {}

@app.route('/api/models/<doc_id>', methods=['GET'])
def get_document(doc_id):
    if doc_id not in models:
        models[doc_id] = LexicalModel.create_document(doc_id)
    
    return jsonify({
        "document": json.loads(models[doc_id].to_json()),
        "info": models[doc_id].get_document_info()
    })

@app.route('/api/models/<doc_id>/blocks', methods=['POST'])
def add_block(doc_id):
    if doc_id not in models:
        return jsonify({"error": "Document not found"}), 404
    
    data = request.json
    models[doc_id].add_block(data.get("content", {}), data.get("type", "paragraph"))
    
    return jsonify({"success": True})
```

This comprehensive guide should help users understand how to use LexicalModel as a standalone library for various use cases, from simple document creation to complex collaborative workflows.

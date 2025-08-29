# LoroModel Usage Examples

This document provides comprehensive examples of how to use the `LoroModel` class for creating and managing collaborative documents with Lexical and Loro integration.

## Overview

The `LoroModel` class implements two-way binding between Lexical data structures and Loro documents, enabling real-time collaborative editing with conflict-free synchronization.

## Basic Setup

```python
from lexical_loro.model.lexical_model import LoroModel

# Create a new model instance
model = LoroModel()
```

## 1. Adding Blocks

### Basic Block Creation

```python
# Add a heading
model.add_block({
    "text": "Document Title",
    "detail": 0,
    "format": 0,
    "mode": "normal",
    "style": ""
}, "heading1")

# Add a paragraph
model.add_block({
    "text": "This is a paragraph with some content.",
    "detail": 0,
    "format": 0,
    "mode": "normal",
    "style": ""
}, "paragraph")
```

### Heading Levels

```python
# Different heading levels
model.add_block({"text": "Main Title"}, "heading1")     # H1
model.add_block({"text": "Section"}, "heading2")        # H2
model.add_block({"text": "Subsection"}, "heading3")     # H3
model.add_block({"text": "Sub-subsection"}, "heading6") # H6
```

### Rich Text Formatting

```python
# Bold text
model.add_block({
    "text": "This text is bold",
    "format": 1,
    "style": "font-weight: bold;"
}, "paragraph")

# Italic text
model.add_block({
    "text": "This text is italic",
    "format": 2,
    "style": "font-style: italic;"
}, "paragraph")

# Bold and italic
model.add_block({
    "text": "This text is bold and italic",
    "format": 3,
    "style": "font-weight: bold; font-style: italic;"
}, "paragraph")

# Custom styling
model.add_block({
    "text": "Custom styled text",
    "format": 0,
    "style": "color: #ff6600; font-size: 18px;",
    "customProperty": "custom_value"
}, "paragraph")
```

## 2. Reading and Accessing Content

```python
# Get all blocks
blocks = model.get_blocks()
print(f"Document has {len(blocks)} blocks")

# Get complete lexical data
lexical_data = model.get_lexical_data()

# Access individual blocks
for i, block in enumerate(blocks):
    block_type = block['type']
    tag = block.get('tag', '')
    
    # Get text content from children
    if block.get('children'):
        for child in block['children']:
            if child.get('type') == 'text':
                text = child['text']
                print(f"Block {i}: [{block_type}] {text}")
```

## 3. Updating Blocks

### Update Text Content

```python
# Update text content only
model.update_block(0, {"text": "Updated title text"})

# Update with formatting
model.update_block(1, {
    "text": "Updated paragraph with bold formatting",
    "format": 1,
    "style": "font-weight: bold;"
})
```

### Change Block Type

```python
# Change a paragraph to a heading
model.update_block(2, {"text": "Now it's a heading"}, "heading2")
```

## 4. Removing Blocks

```python
# Remove block by index
model.remove_block(1)  # Removes the second block (0-indexed)
```

## 5. Document Serialization

### Export to JSON

```python
# Export the entire document as JSON
json_data = model.export_as_json()
print(json_data)

# Save to file
with open('document.json', 'w') as f:
    f.write(json_data)
```

### Import from JSON

```python
# Import from JSON string
new_model = LoroModel()
new_model.import_from_json(json_data)

# Load from file
with open('document.json', 'r') as f:
    json_content = f.read()
    new_model.import_from_json(json_content)
```

## 6. Loro Document Integration

```python
# Access underlying Loro documents
text_doc = model.get_text_document()        # Text-based Loro document
structured_doc = model.get_structured_document()  # Structured Loro document

# These documents are automatically synchronized when the model changes
```

## 7. Real-World Usage Patterns

### Building a Blog Post

```python
def create_blog_post():
    model = LoroModel()
    
    # Blog structure
    model.add_block({"text": "Getting Started with Lexical-Loro"}, "heading1")
    model.add_block({"text": "Introduction to collaborative editing..."}, "paragraph")
    
    model.add_block({"text": "Key Features"}, "heading2")
    model.add_block({"text": "• Real-time collaboration"}, "paragraph")
    model.add_block({"text": "• Rich text support"}, "paragraph")
    
    model.add_block({"text": "Conclusion"}, "heading2")
    model.add_block({"text": "Lexical-Loro provides..."}, "paragraph")
    
    return model
```

### Document Operations

```python
def document_operations_example():
    model = LoroModel()
    
    # Create initial structure
    model.add_block({"text": "API Documentation"}, "heading1")
    model.add_block({"text": "This document describes..."}, "paragraph")
    
    # Add sections
    model.add_block({"text": "Authentication"}, "heading2")
    model.add_block({"text": "API keys are required..."}, "paragraph")
    
    # Update content
    model.update_block(1, {
        "text": "This document provides comprehensive API information.",
        "format": 1
    })
    
    # Add more content
    model.add_block({"text": "Endpoints"}, "heading2")
    model.add_block({"text": "The following endpoints are available:"}, "paragraph")
    
    return model
```

### Collaborative Editing Simulation

```python
def simulate_collaboration():
    model = LoroModel()
    
    # Simulate multiple users editing
    # User A adds title
    model.add_block({"text": "Team Meeting Notes"}, "heading1")
    
    # User B adds date
    model.add_block({"text": "Date: August 25, 2025"}, "paragraph")
    
    # User C adds attendees section
    model.add_block({"text": "Attendees"}, "heading2")
    model.add_block({"text": "Alice, Bob, Charlie"}, "paragraph")
    
    # User A adds agenda
    model.add_block({"text": "Agenda"}, "heading2")
    model.add_block({"text": "1. Project status"}, "paragraph")
    model.add_block({"text": "2. Budget review"}, "paragraph")
    
    # User B updates attendees
    model.update_block(3, {"text": "Alice, Bob, Charlie, Diana"})
    
    return model
```

## 8. Advanced Features

### Custom Block Properties

```python
# Add blocks with custom properties
model.add_block({
    "text": "Special content",
    "format": 0,
    "style": "background-color: #f0f0f0;",
    "customId": "special-block-1",
    "metadata": {"author": "Alice", "created": "2025-08-25"}
}, "paragraph")
```

### Batch Operations

```python
def create_document_structure():
    model = LoroModel()
    
    # Define document structure
    structure = [
        ("heading1", "Complete Guide"),
        ("paragraph", "This guide covers everything you need to know."),
        ("heading2", "Getting Started"),
        ("paragraph", "Follow these steps to begin..."),
        ("heading2", "Advanced Topics"),
        ("paragraph", "For experienced users..."),
        ("heading2", "Troubleshooting"),
        ("paragraph", "Common issues and solutions...")
    ]
    
    # Create all blocks
    for block_type, text in structure:
        model.add_block({"text": text}, block_type)
    
    return model
```

## 9. Error Handling

```python
def safe_operations():
    model = LoroModel()
    
    # Add some content
    model.add_block({"text": "Test content"}, "paragraph")
    
    # Safe update (check index bounds)
    if 0 <= index < len(model.get_blocks()):
        model.update_block(index, {"text": "Updated"})
    
    # Safe removal
    if 0 <= index < len(model.get_blocks()):
        model.remove_block(index)
    
    # Safe JSON operations
    try:
        json_data = model.export_as_json()
        new_model = LoroModel()
        new_model.import_from_json(json_data)
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
```

## 10. Testing and Validation

```python
def validate_document():
    model = LoroModel()
    
    # Add test content
    model.add_block({"text": "Test Title"}, "heading1")
    model.add_block({"text": "Test content"}, "paragraph")
    
    # Validate structure
    blocks = model.get_blocks()
    assert len(blocks) == 2
    assert blocks[0]['type'] == 'heading'
    assert blocks[0]['tag'] == 'h1'
    assert blocks[1]['type'] == 'paragraph'
    
    # Validate text content
    assert blocks[0]['children'][0]['text'] == "Test Title"
    assert blocks[1]['children'][0]['text'] == "Test content"
    
    # Test serialization
    json_data = model.export_as_json()
    assert len(json_data) > 0
    
    # Test import
    new_model = LoroModel()
    new_model.import_from_json(json_data)
    new_blocks = new_model.get_blocks()
    assert len(new_blocks) == len(blocks)
    
    print("✓ All validations passed!")
```

## Key Features Summary

1. **Two-way binding**: Automatic synchronization between Lexical data and Loro documents
2. **Rich text support**: Bold, italic, custom styling, and formatting
3. **Hierarchical structure**: Support for headings (H1-H6) and paragraphs
4. **CRUD operations**: Create, read, update, and delete blocks
5. **Serialization**: JSON export/import for data persistence and exchange
6. **Collaborative ready**: Built-in support for real-time collaboration via Loro
7. **Flexible API**: Simple and intuitive methods for document manipulation
8. **Type safety**: Consistent data structures and validation

## Usage Best Practices

1. **Initialize once**: Create a single `LoroModel` instance per document
2. **Batch operations**: When adding multiple blocks, add them sequentially for better performance
3. **Validate indices**: Always check array bounds before updating or removing blocks
4. **Use meaningful text**: Provide descriptive text content for better user experience
5. **Handle errors**: Wrap JSON operations in try-catch blocks
6. **Keep references**: Store references to Loro documents if you need direct access

This comprehensive guide demonstrates all the key features and usage patterns of the `LoroModel` class for collaborative document editing with Lexical and Loro integration.

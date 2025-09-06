#!/usr/bin/env python3
"""
Simple LexicalModel Example: Memory-only Usage

This example demonstrates how to use LexicalModel for in-memory document creation
and manipulation without any file persistence.
"""

from lexical_loro.model.lexical_model import LexicalModel

def main():
    print("🚀 LexicalModel Memory-only Example")
    print("=" * 50)
    
    # Create a new document
    print("1. Creating a new document...")
    model = LexicalModel.create_document("memory-doc")
    print(f"   ✅ Created document: {model}")
    
    # Add a title
    print("\n2. Adding content...")
    model.add_block({
        "text": "My In-Memory Document",
        "format": 0,
        "style": ""
    }, "heading1")
    print("   ✅ Added title")
    
    # Add some paragraphs
    model.add_block({
        "text": "This document exists only in memory and demonstrates the basic functionality of LexicalModel.",
        "format": 0
    }, "paragraph")
    print("   ✅ Added first paragraph")
    
    model.add_block({
        "text": "You can add multiple blocks, each with different types and content.",
        "format": 0
    }, "paragraph")
    print("   ✅ Added second paragraph")
    
    # Add a subheading
    model.add_block({
        "text": "Features",
        "format": 0
    }, "heading2")
    print("   ✅ Added subheading")
    
    # Add feature list
    features = [
        "Real-time collaboration with Loro CRDTs",
        "Conflict-free merging of concurrent edits",
        "Lexical editor compatibility",
        "Memory-efficient document management"
    ]
    
    for i, feature in enumerate(features, 1):
        model.add_block({
            "text": f"{i}. {feature}",
            "format": 0
        }, "paragraph")
        print(f"   ✅ Added feature {i}")
    
    # Display document statistics
    print("\n3. Document Statistics:")
    blocks = model.get_blocks()
    print(f"   📊 Total blocks: {len(blocks)}")
    
    summary = model.get_block_summary()
    print(f"   📊 Block types: {summary['block_types']}")
    print(f"   📊 Total text length: {summary['total_text_length']}")
    
    # Show document structure
    print("\n4. Document Structure:")
    for i, block in enumerate(blocks, 1):
        block_type = block.get('type', 'unknown')
        text_content = extract_text_from_block(block)
        print(f"   {i}. [{block_type.upper()}] {text_content}")
    
    # Demonstrate JSON export
    print("\n5. JSON Export (first 200 characters):")
    json_data = model.to_json()
    print(f"   {json_data[:200]}...")
    
    # Document info
    print("\n6. Document Information:")
    info = model.get_document_info()
    for key, value in info.items():
        print(f"   {key}: {value}")
    
    print(f"\n✅ Memory-only example completed successfully!")
    print(f"   The document will be discarded when this script ends.")

def extract_text_from_block(block):
    """Helper function to extract text from a block"""
    text_parts = []
    for child in block.get('children', []):
        if child.get('type') == 'text':
            text_parts.append(child.get('text', ''))
    return ''.join(text_parts)

if __name__ == "__main__":
    main()

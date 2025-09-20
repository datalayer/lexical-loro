#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Simple LexicalModel Example: File-based Sync

This example demonstrates how to use LexicalModel with file persistence,
including saving, loading, and updating models on disk.
"""

import os
import tempfile
from lexical_loro.model.lexical_model import LexicalModel

def main():
    print("💾 LexicalModel File-based Sync Example")
    print("=" * 50)
    
    # Create a temporary directory for our examples
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"📁 Working in temporary directory: {temp_dir}")
        
        # Example 1: Create and save a document
        print("\n1. Creating and saving a document...")
        file_path = os.path.join(temp_dir, "my_document.json")
        
        model = LexicalModel.create_document("file-sync-doc")
        model.add_block({"text": "File-based Document"}, "heading1")
        model.add_block({"text": "This document will be saved to and loaded from a file."}, "paragraph")
        model.add_block({"text": "Section 1"}, "heading2")
        model.add_block({"text": "Content of the first section."}, "paragraph")
        
        # Save to file
        success = model.save_to_file(file_path)
        if success:
            print(f"   ✅ Document saved to {file_path}")
            print(f"   📏 File size: {os.path.getsize(file_path)} bytes")
        else:
            print("   ❌ Failed to save document")
            return
        
        # Example 2: Load the document
        print("\n2. Loading the document...")
        loaded_model = LexicalModel.load_from_file(file_path, container_id="loaded-doc")
        
        if loaded_model:
            print("   ✅ Document loaded successfully")
            blocks = loaded_model.get_blocks()
            print(f"   📊 Loaded {len(blocks)} blocks")
            
            # Show loaded content
            print("   📄 Loaded content:")
            for i, block in enumerate(blocks, 1):
                block_type = block.get('type', 'unknown')
                text_content = extract_text_from_block(block)
                print(f"      {i}. [{block_type.upper()}] {text_content}")
        else:
            print("   ❌ Failed to load document")
            return
        
        # Example 3: Modify and update the document
        print("\n3. Modifying the loaded document...")
        loaded_model.add_block({"text": "Section 2"}, "heading2")
        loaded_model.add_block({"text": "This section was added after loading the document."}, "paragraph")
        loaded_model.add_block({"text": "Key Points"}, "heading3")
        loaded_model.add_block({"text": "• File persistence works seamlessly"}, "paragraph")
        loaded_model.add_block({"text": "• Documents maintain their structure"}, "paragraph")
        loaded_model.add_block({"text": "• You can load, modify, and save again"}, "paragraph")
        
        print("   ✅ Added new content to the document")
        
        # Save updated version
        updated_file_path = os.path.join(temp_dir, "updated_document.json")
        success = loaded_model.save_to_file(updated_file_path)
        if success:
            print(f"   ✅ Updated document saved to {updated_file_path}")
            print(f"   📏 Updated file size: {os.path.getsize(updated_file_path)} bytes")
        
        # Example 4: Compare original and updated
        print("\n4. Comparing original and updated models...")
        original_model = LexicalModel.load_from_file(file_path)
        updated_model = LexicalModel.load_from_file(updated_file_path)
        
        if original_model and updated_model:
            original_blocks = len(original_model.get_blocks())
            updated_blocks = len(updated_model.get_blocks())
            
            print(f"   📊 Original document: {original_blocks} blocks")
            print(f"   📊 Updated document: {updated_blocks} blocks")
            print(f"   📈 Added: {updated_blocks - original_blocks} blocks")
        
        # Example 5: JSON export comparison
        print("\n5. JSON format examples...")
        
        # Export with metadata
        json_with_metadata = loaded_model.to_json(include_metadata=True)
        metadata_file = os.path.join(temp_dir, "with_metadata.json")
        with open(metadata_file, 'w') as f:
            f.write(json_with_metadata)
        
        # Export without metadata
        json_without_metadata = loaded_model.to_json(include_metadata=False)
        core_file = os.path.join(temp_dir, "core_only.json")
        with open(core_file, 'w') as f:
            f.write(json_without_metadata)
        
        print(f"   💾 Full JSON (with metadata): {os.path.getsize(metadata_file)} bytes")
        print(f"   💾 Core JSON (structure only): {os.path.getsize(core_file)} bytes")
        
        # Example 6: Batch operations
        print("\n6. Batch file operations...")
        
        # Create multiple models
        document_names = ["notes", "todo", "ideas", "draft"]
        created_files = []
        
        for doc_name in document_names:
            doc_model = LexicalModel.create_document(f"{doc_name}-doc")
            doc_model.add_block({"text": f"{doc_name.title()} Document"}, "heading1")
            doc_model.add_block({"text": f"This is a {doc_name} document created in batch."}, "paragraph")
            
            doc_file = os.path.join(temp_dir, f"{doc_name}.json")
            if doc_model.save_to_file(doc_file):
                created_files.append(doc_file)
                print(f"   ✅ Created {doc_name}.json")
        
        print(f"   📁 Created {len(created_files)} models in batch")
        
        # Load and display all models
        print("\n7. Loading all created models...")
        for file_path in created_files:
            filename = os.path.basename(file_path)
            doc = LexicalModel.load_from_file(file_path)
            if doc:
                blocks = doc.get_blocks()
                summary = doc.get_block_summary()
                print(f"   📄 {filename}: {len(blocks)} blocks, {summary['total_text_length']} characters")
        
        print(f"\n✅ File-based sync example completed successfully!")
        print(f"   📁 All files created in temporary directory will be cleaned up automatically.")

def extract_text_from_block(block):
    """Helper function to extract text from a block"""
    text_parts = []
    for child in block.get('children', []):
        if child.get('type') == 'text':
            text_parts.append(child.get('text', ''))
    return ''.join(text_parts)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Test Step 1: Document Management Methods for LexicalModel

Tests the new class method and document management methods:
- LexicalModel.create_document()
- get_snapshot()
- import_snapshot()
- apply_update()
- export_update()
- get_document_info()
"""

import json
import sys
import os

# Add the module path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from lexical_loro.model.lexical_model import LexicalModel

# Test data
INITIAL_LEXICAL_JSON = {
    "root": {
        "children": [
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Test Document",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "heading",
                "version": 1,
                "tag": "h1"
            },
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "This is a test paragraph.",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1
            }
        ],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    },
    "lastSaved": 1725000000000,
    "source": "Test",
    "version": "0.34.0"
}

def test_create_document():
    """Test LexicalModel.create_document() class method"""
    print("🧪 Testing LexicalModel.create_document()")
    
    # Test 1: Create document with no initial content
    model1 = LexicalModel.create_document("test-doc-1")
    print(f"✅ Created model1 with doc_id: test-doc-1")
    print(f"   Container ID: {model1.container_id}")
    print(f"   Blocks: {len(model1.lexical_data['root']['children'])}")
    
    # Test 2: Create document with initial JSON content
    initial_json = json.dumps(INITIAL_LEXICAL_JSON)
    model2 = LexicalModel.create_document("test-doc-2", initial_content=initial_json)
    print(f"✅ Created model2 with initial content")
    print(f"   Container ID: {model2.container_id}")
    print(f"   Blocks: {len(model2.lexical_data['root']['children'])}")
    
    # Test 3: Create document with initial dict content
    model3 = LexicalModel.create_document("test-doc-3", initial_content=INITIAL_LEXICAL_JSON)
    print(f"✅ Created model3 with dict content")
    print(f"   Container ID: {model3.container_id}")
    print(f"   Blocks: {len(model3.lexical_data['root']['children'])}")
    
    return model1, model2, model3

def test_get_snapshot(model):
    """Test get_snapshot() method"""
    print("\n🧪 Testing get_snapshot()")
    
    snapshot = model.get_snapshot()
    print(f"✅ Got snapshot: {len(snapshot) if snapshot else 0} bytes")
    
    return snapshot

def test_import_snapshot(model, snapshot):
    """Test import_snapshot() method"""
    print("\n🧪 Testing import_snapshot()")
    
    # Create a new model to import into
    new_model = LexicalModel.create_document("test-import")
    original_blocks = len(new_model.lexical_data['root']['children'])
    
    # Show document info before import
    print(f"   Before import: {new_model.get_document_info()}")
    
    # Import the snapshot
    success = new_model.import_snapshot(snapshot)
    new_blocks = len(new_model.lexical_data['root']['children'])
    
    # Show document info after import
    print(f"   After import: {new_model.get_document_info()}")
    
    print(f"✅ Import result: {success}")
    print(f"   Blocks before: {original_blocks}")
    print(f"   Blocks after: {new_blocks}")
    
    return new_model

def test_apply_update():
    """Test apply_update() method"""
    print("\n🧪 Testing apply_update()")
    
    # Create two models
    model_a = LexicalModel.create_document("update-test-a")
    model_b = LexicalModel.create_document("update-test-b")
    
    # Add content to model A
    model_a.add_block({"text": "Hello from Model A"}, "paragraph")
    
    # Get snapshot from A and import to B
    snapshot_a = model_a.get_snapshot()
    success = model_b.apply_update(snapshot_a)
    
    print(f"✅ Apply update result: {success}")
    print(f"   Model A blocks: {len(model_a.lexical_data['root']['children'])}")
    print(f"   Model B blocks: {len(model_b.lexical_data['root']['children'])}")
    
    return model_a, model_b

def test_get_document_info(model):
    """Test get_document_info() method"""
    print("\n🧪 Testing get_document_info()")
    
    info = model.get_document_info()
    print(f"✅ Document info:")
    for key, value in info.items():
        print(f"   {key}: {value}")
    
    return info

def test_export_update(model):
    """Test export_update() method"""
    print("\n🧪 Testing export_update()")
    
    update = model.export_update()
    print(f"✅ Export update result: {update}")
    print(f"   Type: {type(update)}")
    
    return update

def main():
    """Main test function"""
    print("🚀 Testing Step 1: Document Management Methods")
    print("=" * 50)
    
    try:
        # Test create_document
        model1, model2, model3 = test_create_document()
        
        # Test get_snapshot with model2 (has initial content)
        snapshot = test_get_snapshot(model2)
        
        # Test import_snapshot
        if snapshot:
            imported_model = test_import_snapshot(model1, snapshot)
        
        # Test apply_update
        model_a, model_b = test_apply_update()
        
        # Test get_document_info
        test_get_document_info(model2)
        
        # Test export_update
        test_export_update(model2)
        
        print("\n" + "=" * 50)
        print("🎉 All Step 1 tests completed successfully!")
        
        # Show final state
        print(f"\n📋 Final state summary:")
        print(f"   Model1 blocks: {len(model1.lexical_data['root']['children'])}")
        print(f"   Model2 blocks: {len(model2.lexical_data['root']['children'])}")
        print(f"   Model3 blocks: {len(model3.lexical_data['root']['children'])}")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

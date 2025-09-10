#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


"""
Test script to verify auto-save optimization in the server.
"""

import asyncio
import sys
import tempfile
import shutil
from pathlib import Path

# Add the lexical_loro module to the path
sys.path.insert(0, str(Path(__file__).parent))

from lexical_loro.server import LoroWebSocketServer
from lexical_loro.model.lexical_model import LexicalModel

async def test_server_auto_save():
    """Test the server's auto-save optimization"""
    print("🧪 Testing server auto-save optimization...")
    
    # Create a temporary directory for test models
    temp_dir = Path(tempfile.mkdtemp())
    print(f"📁 Using temporary directory: {temp_dir}")
    
    try:
        # Custom save function that saves to temp directory
        def test_save_model(doc_id: str, model: LexicalModel) -> bool:
            try:
                model_file = temp_dir / f"{doc_id}.json"
                model_data = model.to_json()
                
                with open(model_file, 'w', encoding='utf-8') as f:
                    f.write(model_data)
                
                print(f"💾 Saved model {doc_id} to {model_file}")
                return True
                
            except Exception as e:
                print(f"❌ Failed to save model {doc_id}: {e}")
                return False
        
        # Custom load function that loads from temp directory
        def test_load_model(doc_id: str) -> str:
            model_file = temp_dir / f"{doc_id}.json"
            if model_file.exists():
                with open(model_file, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        print(f"📂 Loaded existing model {doc_id}")
                        return content
            
            # Return initial content for new documents
            print(f"✨ Creating new model {doc_id}")
            return """{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1},"lastSaved":0,"source":"Test","version":"1.0.0"}"""
        
        # Create server with test functions
        server = LoroWebSocketServer(
            port=8082,  # Different port to avoid conflicts
            load_model=test_load_model,
            save_model=test_save_model,
            autosave_interval_sec=1  # Fast interval for testing
        )
        
        print("\n1. Testing document creation and initial save...")
        # Create a document
        doc1 = server.get_document("test-doc-1")
        print(f"   Document created: has_changed_since_last_save() = {doc1.has_changed_since_last_save()}")
        
        # Should be marked as saved after creation (loaded from initial content)
        assert not doc1.has_changed_since_last_save(), "Document should be marked as saved after creation"
        
        print("\n2. Testing change detection...")
        # Make a change
        doc1.add_block({"text": "Hello, world!"}, "paragraph")
        print(f"   After adding block: has_changed_since_last_save() = {doc1.has_changed_since_last_save()}")
        assert doc1.has_changed_since_last_save(), "Document should be changed after adding block"
        
        print("\n3. Testing manual save operation...")
        # Test save_all_models
        results = server.save_all_models()
        print(f"   Save results: {results}")
        assert results["test-doc-1"] == True, "Save should be successful"
        assert not doc1.has_changed_since_last_save(), "Document should not be changed after save"
        
        print("\n4. Testing save optimization (unchanged document)...")
        # Call save again without changes - should be optimized
        results2 = server.save_all_models()
        print(f"   Save results (unchanged): {results2}")
        assert results2["test-doc-1"] == True, "Save should still return True (but skip actual save)"
        
        print("\n5. Testing multiple documents...")
        # Create another document
        doc2 = server.get_document("test-doc-2")
        doc2.add_block({"text": "Second document"}, "paragraph")
        
        # Now save all - should save only the changed one
        results3 = server.save_all_models()
        print(f"   Save results (mixed): {results3}")
        assert results3["test-doc-1"] == True, "First doc should return True (unchanged)"
        assert results3["test-doc-2"] == True, "Second doc should return True (changed and saved)"
        
        print("\n✅ All server auto-save tests passed!")
        
    finally:
        # Clean up temporary directory
        shutil.rmtree(temp_dir)
        print(f"🧹 Cleaned up temporary directory: {temp_dir}")

async def main():
    """Main test function"""
    await test_server_auto_save()
    print("\n🎉 All tests completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())

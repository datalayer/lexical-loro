#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


"""
Test script to verify that change tracking for auto-save optimization works correctly.
"""

import sys
import time
from pathlib import Path

# Add the lexical_loro module to the path
sys.path.insert(0, str(Path(__file__).parent))

from lexical_loro.model.lexical_model import LexicalModel

def test_change_tracking():
    """Test the change tracking functionality"""
    print("🧪 Testing change tracking functionality...")
    
    # Create a new model
    print("\n1. Creating new model...")
    model = LexicalModel(doc_id="test-doc")
    
    # Initially, should be considered changed (no hash set)
    print(f"   Initial state - has_changed_since_last_save(): {model.has_changed_since_last_save()}")
    assert model.has_changed_since_last_save() == True, "New model should be considered changed"
    
    # Mark as saved
    print("\n2. Marking as saved...")
    model.mark_as_saved()
    print(f"   After mark_as_saved() - has_changed_since_last_save(): {model.has_changed_since_last_save()}")
    assert model.has_changed_since_last_save() == False, "Model should not be changed after marking as saved"
    
    # Make a change by adding a block
    print("\n3. Adding a block...")
    model.add_block({"text": "Hello, world!"}, "paragraph")
    print(f"   After add_block() - has_changed_since_last_save(): {model.has_changed_since_last_save()}")
    assert model.has_changed_since_last_save() == True, "Model should be changed after adding block"
    
    # Mark as saved again
    print("\n4. Marking as saved again...")
    model.mark_as_saved()
    print(f"   After mark_as_saved() - has_changed_since_last_save(): {model.has_changed_since_last_save()}")
    assert model.has_changed_since_last_save() == False, "Model should not be changed after marking as saved again"
    
    # Make another change
    print("\n5. Adding another block...")
    model.add_block({"text": "Second paragraph"}, "paragraph")
    print(f"   After add_block() - has_changed_since_last_save(): {model.has_changed_since_last_save()}")
    assert model.has_changed_since_last_save() == True, "Model should be changed after adding second block"
    
    print("\n✅ All change tracking tests passed!")
    
    # Test hash computation
    print("\n6. Testing hash computation...")
    hash1 = model._compute_content_hash()
    print(f"   Hash 1: {hash1[:16]}...")
    
    # Same content should produce same hash
    hash2 = model._compute_content_hash()
    print(f"   Hash 2: {hash2[:16]}...")
    assert hash1 == hash2, "Same content should produce same hash"
    
    # Change content and verify hash changes
    model.add_block({"text": "Third paragraph"}, "paragraph")
    hash3 = model._compute_content_hash()
    print(f"   Hash 3: {hash3[:16]}...")
    assert hash1 != hash3, "Different content should produce different hash"
    
    print("\n✅ Hash computation tests passed!")
    
    print("\n🎉 All tests completed successfully!")

if __name__ == "__main__":
    test_change_tracking()

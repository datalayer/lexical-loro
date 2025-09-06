#!/usr/bin/env python3
"""
Test EphemeralStoreEvent integration with simpler data
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from lexical_loro.model.lexical_model import LexicalModel

def test_ephemeral_subscription():
    """Test that EphemeralStoreEvent subscription is working"""
    print("🧪 Testing EphemeralStoreEvent subscription setup...")
    
    events_received = []
    
    def event_handler(event_type, event_data):
        events_received.append((event_type, event_data))
        print(f"📡 Event: {event_type}")
        
        if event_type == "ephemeral_changed":
            changes = event_data.get("changes", {})
            print(f"  - Added: {changes.get('has_added', False)}")
            print(f"  - Updated: {changes.get('has_updated', False)}")  
            print(f"  - Removed: {changes.get('has_removed', False)}")
            print(f"  - Broadcast needed: {event_data.get('broadcast_needed', False)}")
    
    # Create model with event callback
    model = LexicalModel.create_document(
        doc_id="test-ephemeral",
        event_callback=event_handler,
        ephemeral_timeout=60000
    )
    
    print(f"✅ Model created")
    print(f"✅ Has ephemeral store: {model.ephemeral_store is not None}")
    print(f"✅ Has ephemeral subscription: {model._ephemeral_subscription is not None}")
    
    # Test basic ephemeral store operations directly
    if model.ephemeral_store:
        try:
            print("\n🔄 Testing direct ephemeral store operations...")
            
            # Test setting simple string data
            model.ephemeral_store.set("test-key-1", "test-value-1")
            print("✅ Set simple string value")
            
            # Test setting bytes data  
            model.ephemeral_store.set("test-key-2", b"test-bytes")
            print("✅ Set bytes value")
            
            # Get all data
            all_data = model.ephemeral_store.encode_all()
            print(f"✅ Encoded all data: {len(all_data)} bytes")
            
        except Exception as e:
            print(f"❌ Error in direct operations: {e}")
    
    print(f"\n📊 Events received: {len(events_received)}")
    for i, (event_type, event_data) in enumerate(events_received):
        print(f"  {i+1}. {event_type}")
    
    # Test cleanup
    model.cleanup()
    print("\n✅ Model cleanup completed")
    
    return len(events_received) > 0

if __name__ == "__main__":
    success = test_ephemeral_subscription()
    if success:
        print("\n🎉 EphemeralStoreEvent subscription working!")
    else:
        print("\n⚠️ No ephemeral events received")

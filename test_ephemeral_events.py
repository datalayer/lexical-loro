#!/usr/bin/env python3
"""
Test EphemeralStoreEvent integration
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from lexical_loro.model.lexical_model import LexicalModel

def test_ephemeral_store_event():
    """Test EphemeralStoreEvent integration"""
    print("🧪 Testing EphemeralStoreEvent integration...")
    
    events_received = []
    
    def event_handler(event_type, event_data):
        events_received.append((event_type, event_data))
        print(f"📡 Event: {event_type}")
        if event_type == "ephemeral_changed":
            changes = event_data.get("changes", {})
            print(f"  - Added: {changes.get('has_added', False)}")
            print(f"  - Updated: {changes.get('has_updated', False)}")  
            print(f"  - Removed: {changes.get('has_removed', False)}")
    
    # Create model with event callback
    model = LexicalModel.create_document(
        doc_id="test-ephemeral",
        event_callback=event_handler,
        ephemeral_timeout=60000
    )
    
    print(f"✅ Created model with ephemeral subscription: {model._ephemeral_subscription is not None}")
    
    # Test ephemeral operations that should trigger events
    print("\n🔄 Testing ephemeral operations...")
    
    # Test awareness update
    response1 = model.handle_ephemeral_message("awareness-update", {
        "awarenessState": {"name": "TestUser", "color": "#FF0000", "cursor": {"x": 10, "y": 20}},
        "peerId": "test-peer-1"
    }, "test-client-1")
    print(f"✅ Awareness update: {response1.get('success', False)}")
    
    # Test cursor position
    response2 = model.handle_ephemeral_message("cursor-position", {
        "x": 15, "y": 25, "node": "text-node-1"
    }, "test-client-2")
    print(f"✅ Cursor position: {response2.get('success', False)}")
    
    # Test text selection
    response3 = model.handle_ephemeral_message("text-selection", {
        "start": {"x": 0, "y": 0}, "end": {"x": 10, "y": 5}
    }, "test-client-3")
    print(f"✅ Text selection: {response3.get('success', False)}")
    
    print(f"\n📊 Events received: {len(events_received)}")
    for i, (event_type, event_data) in enumerate(events_received):
        print(f"  {i+1}. {event_type} - broadcast_needed: {event_data.get('broadcast_needed', False)}")
    
    # Test cleanup
    model.cleanup()
    print("✅ Model cleanup completed")
    
    return len(events_received) > 0

if __name__ == "__main__":
    success = test_ephemeral_store_event()
    if success:
        print("\n🎉 EphemeralStoreEvent integration working!")
    else:
        print("\n⚠️ No ephemeral events received")

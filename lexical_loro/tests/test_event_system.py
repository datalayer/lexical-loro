"""
Test Step 4: Event System for Server Communication

This test verifies that the LexicalModel correctly emits structured events
instead of using simple callbacks, and that the server can handle these events.
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock
from lexical_loro.model.lexical_model import LexicalModel, LexicalEventType

class TestStep4EventSystem:
    def setup_method(self):
        """Set up test fixtures"""
        self.event_callback = Mock()
        self.captured_events = []
        
        def capture_event(event_type: str, event_data: dict):
            self.captured_events.append((event_type, event_data))
        
        self.event_callback.side_effect = capture_event
    
    def test_event_callback_parameter(self):
        """Test that LexicalModel accepts event_callback parameter"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback
        )
        
        assert model._event_callback is self.event_callback
        assert model.container_id == "test-doc"
    
    def test_document_changed_event(self):
        """Test that document changes emit document_changed events"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback
        )
        
        # Clear initialization events
        self.captured_events.clear()
        
        # Trigger a document change by calling the auto-sync method directly
        # This simulates what happens when the Loro document changes externally
        model._auto_sync_on_change()
        
        # Should have emitted document_changed event
        assert len(self.captured_events) > 0
        event_type, event_data = self.captured_events[0]
        assert event_type == LexicalEventType.DOCUMENT_CHANGED.value
        assert event_data["container_id"] == "test-doc"
        assert "model" in event_data
        assert "snapshot" in event_data
    
    def test_ephemeral_changed_event(self):
        """Test that ephemeral updates emit ephemeral_changed events"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback,
            ephemeral_timeout=300000
        )
        
        # Clear any initialization events
        self.captured_events.clear()
        
        # Trigger ephemeral update
        response = model.handle_ephemeral_message(
            message_type="cursor-position",
            data={"position": {"line": 1, "character": 5}},
            client_id="client1"
        )
        
        # Verify response is simplified (no broadcast_needed flag)
        assert response["success"] is True
        assert response["message_type"] == "cursor-position"
        assert "broadcast_needed" not in response
        
        # Should have emitted ephemeral_changed event
        ephemeral_events = [e for e in self.captured_events if e[0] == LexicalEventType.EPHEMERAL_CHANGED.value]
        assert len(ephemeral_events) >= 1
        
        event_type, event_data = ephemeral_events[0]
        assert event_data["message_type"] == "cursor-position"
        assert event_data["client_id"] == "client1"
        assert "broadcast_data" in event_data
    
    def test_broadcast_needed_event(self):
        """Test that operations requiring broadcast emit broadcast_needed events"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback
        )
        
        # Clear initialization events
        self.captured_events.clear()
        
        # Use append-paragraph instead of loro-update since it generates its own valid updates
        response = model.handle_message(
            message_type="append-paragraph",
            data={"message": "Test paragraph"},
            client_id="client1"
        )
        
        # Verify response is simplified
        assert response["success"] is True
        assert response["message_type"] == "append-paragraph"
        assert "broadcast_needed" not in response
        
        # Should have emitted broadcast_needed event if there's content to broadcast
        if response.get("response_needed"):
            broadcast_events = [e for e in self.captured_events if e[0] == LexicalEventType.BROADCAST_NEEDED.value]
            assert len(broadcast_events) >= 1
            
            event_type, event_data = broadcast_events[0]
            assert event_data["message_type"] == "append-paragraph"
            assert event_data["client_id"] == "client1"
            assert "broadcast_data" in event_data
    
    def test_append_paragraph_events(self):
        """Test that append-paragraph emits proper events"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback
        )
        
        # Clear initialization events
        self.captured_events.clear()
        
        # Trigger append paragraph
        response = model.handle_message(
            message_type="append-paragraph",
            data={"message": "New paragraph"},
            client_id="client1"
        )
        
        # Verify response structure
        assert response["success"] is True
        assert response["message_type"] == "append-paragraph"
        assert "broadcast_needed" not in response
        assert "response_needed" in response  # Still needed for sender
        
        # Should emit broadcast_needed event if there's content to broadcast
        if response.get("response_needed"):
            broadcast_events = [e for e in self.captured_events if e[0] == LexicalEventType.BROADCAST_NEEDED.value]
            assert len(broadcast_events) >= 1
    
    def test_event_emission_error_handling(self):
        """Test that event emission errors don't break model operations"""
        def failing_callback(event_type: str, event_data: dict):
            raise Exception("Callback error")
        
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=failing_callback
        )
        
        # Model should still work despite callback errors
        response = model.handle_ephemeral_message(
            message_type="cursor-position",
            data={"position": {"line": 1, "character": 5}},
            client_id="client1"
        )
        
        assert response["success"] is True
    
    def test_no_event_callback(self):
        """Test that model works without event callback"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=None
        )
        
        # Should work normally without errors
        response = model.handle_ephemeral_message(
            message_type="cursor-position",
            data={"position": {"line": 1, "character": 5}},
            client_id="client1"
        )
        
        assert response["success"] is True
    
    def test_event_data_structure(self):
        """Test that events contain expected data structure"""
        model = LexicalModel.create_document(
            doc_id="test-doc",
            event_callback=self.event_callback
        )
        
        # Clear initialization events
        self.captured_events.clear()
        
        # Trigger ephemeral update
        model.handle_ephemeral_message(
            message_type="text-selection",
            data={
                "selection": {"anchor": 0, "focus": 5},
                "color": "#ff0000"
            },
            client_id="client1"
        )
        
        # Check event structure
        ephemeral_events = [e for e in self.captured_events if e[0] == LexicalEventType.EPHEMERAL_CHANGED.value]
        assert len(ephemeral_events) >= 1
        
        event_type, event_data = ephemeral_events[0]
        
        # Verify required fields
        assert "model" in event_data
        assert "container_id" in event_data
        assert event_data["container_id"] == "test-doc"
        assert event_data["message_type"] == "text-selection"
        assert event_data["client_id"] == "client1"
        assert "broadcast_data" in event_data
        
        # Verify broadcast data structure
        broadcast_data = event_data["broadcast_data"]
        assert broadcast_data["type"] == "ephemeral-update"
        assert broadcast_data["docId"] == "test-doc"
        assert "data" in broadcast_data

if __name__ == "__main__":
    pytest.main([__file__, "-v"])

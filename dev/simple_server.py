#!/usr/bin/env python3
"""
Step 2 Demo: Simplified Server Using LexicalModel Message Handling

This demonstrates how a server can now delegate Loro message handling 
to LexicalModel instead of implementing it directly.

Before Step 2: Server handled all Loro logic directly
After Step 2: Server delegates to LexicalModel.handle_message()
"""

import json
import asyncio
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from lexical_loro.model.lexical_model import LexicalModel

# Simulate the simplified server structure after Step 2
class SimplifiedServer:
    """
    Demonstration of how server code is simplified with LexicalModel message handling
    """
    
    def __init__(self):
        self.clients = {}
        # Instead of managing loro_docs, loro_models, ephemeral_stores separately,
        # we now just have a simple mapping of doc_id to LexicalModel
        self.lexical_models: Dict[str, 'LexicalModel'] = {}
    
    def get_or_create_model(self, doc_id: str) -> 'LexicalModel':
        """Get or create a LexicalModel for the given doc_id"""
        if doc_id not in self.lexical_models:
            # Import here to avoid circular dependencies in demo
            from lexical_loro.model.lexical_model import LexicalModel
            
            # Create with some initial content for demo
            initial_content = {
                "root": {
                    "children": [
                        {
                            "children": [
                                {
                                    "detail": 0,
                                    "format": 0,
                                    "mode": "normal",
                                    "style": "",
                                    "text": f"Document {doc_id}",
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
                        }
                    ],
                    "direction": None,
                    "format": "",
                    "indent": 0,
                    "type": "root",
                    "version": 1
                },
                "lastSaved": 1725000000000,
                "source": "Simplified Server",
                "version": "0.34.0"
            }
            
            self.lexical_models[doc_id] = LexicalModel.create_document(
                doc_id, 
                initial_content=initial_content,
                change_callback=self._on_model_change
            )
            print(f"📄 Created LexicalModel for {doc_id}")
        
        return self.lexical_models[doc_id]
    
    def _on_model_change(self, model):
        """Callback when a model changes"""
        print(f"📄 Model changed: {model.container_id} has {len(model.lexical_data.get('root', {}).get('children', []))} blocks")
    
    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> bool:
        """
        Simplified message handling - delegates Loro operations to LexicalModel
        
        BEFORE Step 2: This method would be 100+ lines of Loro-specific logic
        AFTER Step 2: This method is ~20 lines of delegation
        """
        try:
            message_type = message_data.get("type")
            doc_id = message_data.get("docId", "default-doc")
            
            print(f"📨 Handling {message_type} for {doc_id} from {client_id}")
            
            # Check if this is a Loro-related message
            loro_message_types = ["loro-update", "snapshot", "request-snapshot", "append-paragraph"]
            
            if message_type in loro_message_types:
                # Delegate to LexicalModel - this is the key simplification!
                model = self.get_or_create_model(doc_id)
                response = model.handle_message(message_type, message_data, client_id)
                
                # Handle the response from LexicalModel
                if response["success"]:
                    await self._handle_successful_response(response, client_id, doc_id)
                else:
                    await self._handle_error_response(response, client_id)
                
                return True
            
            # Handle non-Loro messages (ephemeral, client management, etc.)
            elif message_type in ["ephemeral-update", "cursor-position", "text-selection"]:
                print(f"📡 Handling ephemeral message {message_type} (not implemented in this demo)")
                return True
            
            else:
                print(f"❓ Unknown message type: {message_type}")
                return False
                
        except Exception as e:
            print(f"❌ Error handling message: {e}")
            return False
    
    async def _handle_successful_response(self, response: Dict[str, Any], client_id: str, doc_id: str):
        """Handle successful LexicalModel response"""
        message_type = response["message_type"]
        
        # Handle broadcast needs
        if response.get("broadcast_needed"):
            broadcast_data = response.get("broadcast_data", {})
            print(f"📡 Broadcasting {message_type} to other clients: {broadcast_data.get('type', 'unknown')}")
            # In real server: await self.broadcast_to_others(client_id, broadcast_data)
        
        # Handle direct response needs
        if response.get("response_needed"):
            response_data = response.get("response_data", {})
            print(f"📤 Sending response to {client_id}: {response_data.get('type', 'unknown')}")
            # In real server: await self.send_to_client(client_id, response_data)
        
        # Log success info
        if response.get("document_info"):
            doc_info = response["document_info"]
            print(f"📋 Document {doc_id} now has {doc_info.get('lexical_blocks', 0)} blocks, {doc_info.get('content_length', 0)} chars")
    
    async def _handle_error_response(self, response: Dict[str, Any], client_id: str):
        """Handle error response from LexicalModel"""
        error_msg = response.get("error", "Unknown error")
        message_type = response.get("message_type", "unknown")
        
        print(f"❌ {message_type} failed for {client_id}: {error_msg}")
        
        # In real server: send error response to client
        error_response = {
            "type": "error",
            "message": f"{message_type} failed: {error_msg}"
        }
        print(f"📤 Would send error to {client_id}: {error_response}")

def demo_step2_simplification():
    """Demonstrate the server simplification achieved in Step 2"""
    print("🚀 Step 2 Demo: Simplified Server with LexicalModel Message Handling")
    print("=" * 70)
    
    # Create simplified server
    server = SimplifiedServer()
    
    # Simulate various message types that would come from WebSocket clients
    test_messages = [
        {
            "scenario": "Client requests snapshot",
            "client_id": "client-1", 
            "message": {
                "type": "request-snapshot",
                "docId": "shared-doc"
            }
        },
        {
            "scenario": "Client sends Loro update",
            "client_id": "client-2",
            "message": {
                "type": "loro-update", 
                "docId": "shared-doc",
                "update": []  # Empty for demo
            }
        },
        {
            "scenario": "Client appends paragraph",
            "client_id": "client-3",
            "message": {
                "type": "append-paragraph",
                "docId": "shared-doc", 
                "message": "Hello from simplified server!"
            }
        },
        {
            "scenario": "Client sends snapshot",
            "client_id": "client-4",
            "message": {
                "type": "snapshot",
                "docId": "shared-doc",
                "snapshot": []  # Empty for demo
            }
        }
    ]
    
    async def run_demo():
        print("📨 Processing various client messages...")
        print()
        
        for i, test in enumerate(test_messages, 1):
            print(f"🔄 Scenario {i}: {test['scenario']}")
            success = await server.handle_message(test["client_id"], test["message"])
            print(f"   Result: {'✅ Success' if success else '❌ Failed'}")
            print()
        
        # Show final state
        print("📊 Final Server State:")
        for doc_id, model in server.lexical_models.items():
            doc_info = model.get_document_info()
            print(f"   📄 {doc_id}: {doc_info['lexical_blocks']} blocks, {doc_info['content_length']} chars")
        
        print("\n" + "=" * 70)
        print("🎉 Step 2 Demo Complete!")
        print("\n💡 Key Benefits Achieved:")
        print("   ✅ Server code simplified from 100+ lines to ~20 lines for Loro handling")
        print("   ✅ All Loro logic encapsulated in LexicalModel")
        print("   ✅ Consistent response format from LexicalModel")
        print("   ✅ Easy to test LexicalModel independently")
        print("   ✅ Server only handles WebSocket communication and broadcasting")
    
    # Run the async demo
    asyncio.run(run_demo())

if __name__ == "__main__":
    demo_step2_simplification()

#!/usr/bin/env python3
"""
Quick fix for the corrupted broadcast_change method in lexical_model.py
"""

# Read the file
with open('/home/echarles/Content/datalayer-osp/src/tech/lexical/lexical-loro/lexical_loro/model/lexical_model.py', 'r') as f:
    content = f.read()

# Find the start and end of the corrupted method
start_marker = "    async def broadcast_change(self, doc_id: str, message_type: str = \"document-update\"):"
end_marker = "\n    async def broadcast_change_with_data(self, doc_id: str, broadcast_data: dict):"

start_pos = content.find(start_marker)
end_pos = content.find(end_marker)

if start_pos == -1 or end_pos == -1:
    print("Could not find method boundaries")
    exit(1)

# Extract before and after the method
before = content[:start_pos]
after = content[end_pos:]

# Clean replacement method
new_method = '''    async def broadcast_change(self, doc_id: str, message_type: str = "snapshot"):
        """Broadcast a change to other clients when in client mode"""
        logger.debug(f"📤 broadcast_change called: doc_id={doc_id}, message_type={message_type}, client_mode={self.client_mode}")
        
        if not self.client_mode:
            logger.debug(f"⚠️ Not in client mode, skipping broadcast")
            return
            
        # Ensure connection is established for this document
        logger.debug(f"🔄 Ensuring connection is established for doc '{doc_id}'...")
        await self._ensure_connected(doc_id)
        
        client_info = self.websocket_clients.get(doc_id, {})
        if not client_info.get("connected", False):
            logger.debug(f"⚠️ Cannot broadcast for {doc_id} - not connected to collaborative server")
            return
            
        try:
            if doc_id in self.models:
                model = self.models[doc_id]
                logger.debug(f"📄 Found model for {doc_id}, creating broadcast message...")
                
                # Get the latest snapshot from the model
                snapshot_data = model.get_snapshot()
                logger.debug(f"📄 Got snapshot of {len(snapshot_data) if snapshot_data else 0} bytes")
                
                # Convert bytes to list for JSON serialization
                snapshot_list = list(snapshot_data) if snapshot_data else []
                
                message = {
                    "type": "snapshot",  # Use supported message type
                    "docId": doc_id,
                    "senderId": client_info.get("client_id"),
                    "snapshot": snapshot_list
                }
                
                logger.debug(f"📤 Sending broadcast message: type=snapshot, docId={doc_id}")
                await self._send_message(doc_id, message)
                logger.debug(f"✅ DocumentManager broadcasted snapshot for {doc_id}")
            else:
                logger.debug(f"❌ No model found for doc_id: {doc_id}")
                
        except Exception as e:
            logger.debug(f"❌ Error broadcasting change for {doc_id}: {e}")
            import traceback
            logger.debug(f"❌ Full traceback: {traceback.format_exc()}")
'''

# Reconstruct the file
new_content = before + new_method + after

# Write back
with open('/home/echarles/Content/datalayer-osp/src/tech/lexical/lexical-loro/lexical_loro/model/lexical_model.py', 'w') as f:
    f.write(new_content)

print("✅ Fixed broadcast_change method corruption")

#!/usr/bin/env python3

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Loro WebSocket Server V2 for incremental collaboration

This server is designed for the V2 plugin that follows the YJS pattern:
- Incremental updates instead of full state replacement
- Better handling of Loro CRDT operations
- Optimized for preventing decorator node reloading
"""

import asyncio
import json
import logging
import time
import string
import random
import traceback
import sys
import base64
from pathlib import Path
from typing import Dict, Any, Set, Optional
import websockets
from websockets.legacy.server import WebSocketServerProtocol

# Try to import loro-py, fall back to mock if not available
try:
    from loro import LoroDoc, LoroText
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("⚠️ loro-py not found, using mock implementation")
    
    class MockLoroDoc:
        def __init__(self):
            self.data = ""
        
        def get_text(self, key: str):
            return MockLoroText(self)
        
        def export_snapshot(self) -> bytes:
            return self.data.encode('utf-8')
        
        def import_batch(self, updates):
            for update in updates:
                if isinstance(update, bytes):
                    self.data += update.decode('utf-8', errors='ignore')
    
    class MockLoroText:
        def __init__(self, doc):
            self.doc = doc
        
        def insert(self, pos: int, text: str):
            current = self.doc.data
            self.doc.data = current[:pos] + text + current[pos:]
    
    LoroDoc = MockLoroDoc
    LoroText = MockLoroText

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

INITIAL_CONTENT = """
{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro V2","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something to test incremental updates...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}
"""

class LoroDocumentV2:
    """
    Document wrapper for V2 collaboration
    Focuses on incremental Loro operations
    """
    
    def __init__(self, doc_id: str, initial_content: str = None):
        self.doc_id = doc_id
        self.loro_doc = LoroDoc()
        self.loro_text = self.loro_doc.get_text("root")
        self.clients: Set[str] = set()
        self.created_at = time.time()
        self.last_modified = time.time()
        
        # Initialize with content if provided
        if initial_content:
            try:
                # Parse the JSON content and extract text for Loro
                content_data = json.loads(initial_content)
                text_content = self._extract_text_from_lexical(content_data)
                if text_content:
                    self.loro_text.insert(0, text_content)
                    logger.info(f"📝 Initialized document {doc_id} with {len(text_content)} characters")
            except Exception as e:
                logger.warning(f"⚠️ Failed to parse initial content for {doc_id}: {e}")
    
    def _extract_text_from_lexical(self, lexical_data: dict) -> str:
        """Extract plain text from Lexical JSON structure"""
        def extract_text_recursive(node):
            if isinstance(node, dict):
                if node.get("type") == "text":
                    return node.get("text", "")
                elif "children" in node:
                    texts = []
                    for child in node["children"]:
                        child_text = extract_text_recursive(child)
                        if child_text:
                            texts.append(child_text)
                    return " ".join(texts) if texts else ""
            return ""
        
        return extract_text_recursive(lexical_data)
    
    def add_client(self, client_id: str):
        """Add a client to this document"""
        self.clients.add(client_id)
        logger.info(f"👤 Client {client_id} joined document {self.doc_id} ({len(self.clients)} total)")
    
    def remove_client(self, client_id: str):
        """Remove a client from this document"""
        self.clients.discard(client_id)
        logger.info(f"👤 Client {client_id} left document {self.doc_id} ({len(self.clients)} remaining)")
        return len(self.clients) == 0  # Return True if document is now empty
    
    def get_snapshot(self) -> bytes:
        """Get the current snapshot of the document"""
        try:
            # Try export_snapshot first (newer API)
            if hasattr(self.loro_doc, 'export_snapshot'):
                return self.loro_doc.export_snapshot()
            # Fall back to export_bytes or export (older API)
            elif hasattr(self.loro_doc, 'export_bytes'):
                return self.loro_doc.export_bytes()
            elif hasattr(self.loro_doc, 'export'):
                # Try different export modes
                try:
                    result = self.loro_doc.export('snapshot')
                    if isinstance(result, bytes):
                        return result
                    return str(result).encode('utf-8')
                except Exception:
                    try:
                        result = self.loro_doc.export()
                        if isinstance(result, bytes):
                            return result
                        return str(result).encode('utf-8')
                    except Exception:
                        logger.warning("⚠️ Export failed, using mock data")
                        return b'mock_snapshot_data'
            else:
                logger.warning("⚠️ No suitable export method found, using mock data")
                return b'mock_snapshot_data'
        except Exception as e:
            logger.error(f"❌ Failed to get snapshot: {e}")
            return b'error_snapshot'
    
    def apply_update(self, update_bytes: bytes) -> bool:
        """Apply a Loro update and return success status"""
        try:
            self.loro_doc.import_batch([update_bytes])
            self.last_modified = time.time()
            return True
        except Exception as e:
            logger.error(f"❌ Failed to apply update to document {self.doc_id}: {e}")
            return False


class LoroWebSocketServerV2:
    """
    WebSocket Server V2 for incremental Loro collaboration
    
    Key differences from V1:
    - Works directly with Loro CRDT operations
    - Sends incremental updates instead of full snapshots
    - Optimized for the V2 plugin that follows YJS patterns
    """
    
    def __init__(self, port: int = 8082, host: str = "localhost"):
        self.port = port
        self.host = host
        self.clients: Dict[str, WebSocketServerProtocol] = {}
        self.documents: Dict[str, LoroDocumentV2] = {}
        self.client_to_doc: Dict[str, str] = {}  # Map client ID to document ID
        self.running = False
    
    def _extract_doc_id_from_path(self, path: str) -> str:
        """
        Extract document ID from WebSocket path
        Supports: /docId, /ws/docId, /documents/docId
        """
        if not path or path == "/":
            return "default"
        
        # Remove leading slash and split
        segments = [s for s in path.strip("/").split("/") if s]
        
        if not segments:
            return "default"
        
        # If path is just the doc ID
        if len(segments) == 1:
            return segments[0]
        
        # If path is /ws/docId or /documents/docId
        if len(segments) == 2 and segments[0] in ["ws", "documents", "docs"]:
            return segments[1]
        
        # Default to the last segment
        return segments[-1]
    
    def _load_initial_content(self, doc_id: str) -> str:
        """Load initial content for a document"""
        try:
            # Try to load from saved file
            models_dir = Path(".models")
            model_file = models_dir / f"{doc_id}.json"
            
            if model_file.exists():
                with open(model_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    logger.info(f"📁 Loaded saved content for document {doc_id}")
                    return content
        except Exception as e:
            logger.warning(f"⚠️ Failed to load saved content for {doc_id}: {e}")
        
        # Return default initial content
        logger.info(f"✨ Using default initial content for document {doc_id}")
        return INITIAL_CONTENT
    
    def _save_document(self, doc_id: str, document: LoroDocumentV2):
        """Save document to disk"""
        try:
            models_dir = Path(".models")
            models_dir.mkdir(exist_ok=True)
            
            # Save the Loro snapshot as bytes
            snapshot_file = models_dir / f"{doc_id}.loro"
            snapshot = document.get_snapshot()
            
            with open(snapshot_file, 'wb') as f:
                f.write(snapshot)
            
            logger.info(f"💾 Saved document {doc_id} ({len(snapshot)} bytes)")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to save document {doc_id}: {e}")
            return False
    
    def get_or_create_document(self, doc_id: str) -> LoroDocumentV2:
        """Get existing document or create new one"""
        if doc_id not in self.documents:
            initial_content = self._load_initial_content(doc_id)
            self.documents[doc_id] = LoroDocumentV2(doc_id, initial_content)
            logger.info(f"📄 Created new document: {doc_id}")
        
        return self.documents[doc_id]
    
    async def handle_client(self, websocket):
        """Handle a new client connection"""
        # Extract path from websocket object
        path = websocket.path if hasattr(websocket, 'path') else '/default'
        
        client_id = self.generate_client_id()
        doc_id = self._extract_doc_id_from_path(path)
        
        logger.info(f"🔌 New connection: client {client_id} -> document {doc_id} (path: {path})")
        
        # Store client info
        self.clients[client_id] = websocket
        self.client_to_doc[client_id] = doc_id
        
        # Get or create document
        document = self.get_or_create_document(doc_id)
        document.add_client(client_id)
        
        try:
            # Send welcome message
            # Create peer list for initial messages
            peer_list = []
            for peer_id in document.clients:
                peer_list.append({
                    "id": peer_id,
                    "displayId": peer_id.split('_')[-1] if '_' in peer_id else peer_id[:8],
                    "isCurrentUser": peer_id == client_id
                })
            
            await websocket.send(json.dumps({
                "type": "welcome",
                "clientId": client_id,
                "docId": doc_id,
                "message": "Connected to Loro V2 server",
                "peerCount": len(document.clients),
                "peers": peer_list
            }))
            
            # Send initial snapshot
            snapshot = document.get_snapshot()
            if snapshot:
                snapshot_b64 = base64.b64encode(snapshot).decode('utf-8')
                await websocket.send(json.dumps({
                    "type": "snapshot",
                    "docId": doc_id,
                    "snapshot": snapshot_b64,
                    "peerCount": len(document.clients),
                    "peers": peer_list
                }))
                logger.info(f"📸 Sent snapshot to client {client_id} ({len(snapshot)} bytes)")
            
            # Notify other clients about the new peer
            await self.broadcast_peer_update(doc_id, exclude_client=client_id)
            
            # Listen for messages
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📴 Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_id}: {e}")
        finally:
            # Clean up
            await self.cleanup_client(client_id)
    
    async def handle_message(self, client_id: str, message: str):
        """Handle a message from a client"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            doc_id = data.get("docId")
            
            logger.debug(f"📨 Message from {client_id}: {msg_type} for document {doc_id}")
            
            if msg_type == "update" and "update" in data:
                await self.handle_loro_update(client_id, doc_id, data["update"])
            elif msg_type == "cursor" and "cursor" in data:
                await self.handle_cursor_update(client_id, doc_id, data["cursor"])
            else:
                logger.warning(f"⚠️ Unknown message type: {msg_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON from client {client_id}: {e}")
        except Exception as e:
            logger.error(f"❌ Error handling message from {client_id}: {e}")
    
    async def handle_loro_update(self, sender_id: str, doc_id: str, update_b64: str):
        """Handle a Loro update from a client"""
        try:
            # Decode the update
            update_bytes = base64.b64decode(update_b64)
            
            # Get the document
            if doc_id not in self.documents:
                logger.error(f"❌ Document {doc_id} not found for update")
                return
            
            document = self.documents[doc_id]
            
            # Apply the update to the document
            if document.apply_update(update_bytes):
                logger.debug(f"✅ Applied update to document {doc_id} from client {sender_id}")
                
                # Broadcast the update to other clients
                await self.broadcast_update(sender_id, doc_id, update_b64)
                
                # Save document periodically (every 10 updates for example)
                # In production, you might want a more sophisticated saving strategy
                if int(time.time()) % 10 == 0:  # Save every ~10 seconds
                    self._save_document(doc_id, document)
            else:
                logger.error(f"❌ Failed to apply update to document {doc_id}")
                
        except Exception as e:
            logger.error(f"❌ Error handling Loro update: {e}")
    
    async def handle_cursor_update(self, sender_id: str, doc_id: str, cursor_data: dict):
        """Handle a cursor update from a client"""
        try:
            # Broadcast cursor position to other clients
            await self.broadcast_message(sender_id, {
                "type": "cursor",
                "docId": doc_id,
                "clientId": sender_id,
                "cursor": cursor_data
            })
            
        except Exception as e:
            logger.error(f"❌ Error handling cursor update: {e}")
    
    async def broadcast_update(self, sender_id: str, doc_id: str, update_b64: str):
        """Broadcast a Loro update to all clients except the sender"""
        message = {
            "type": "update",
            "docId": doc_id,
            "clientId": sender_id,
            "update": update_b64
        }
        
        await self.broadcast_message(sender_id, message)
    
    async def broadcast_message(self, sender_id: str, message: dict):
        """Broadcast a message to all clients except the sender"""
        doc_id = message.get("docId")
        
        if doc_id not in self.documents:
            return
        
        document = self.documents[doc_id]
        target_clients = [cid for cid in document.clients if cid != sender_id]
        
        if not target_clients:
            return
        
        message_str = json.dumps(message)
        successful_sends = 0
        failed_clients = []
        
        for client_id in target_clients:
            if client_id in self.clients:
                try:
                    await self.clients[client_id].send(message_str)
                    successful_sends += 1
                except Exception as e:
                    logger.warning(f"⚠️ Failed to send to client {client_id}: {e}")
                    failed_clients.append(client_id)
        
        # Clean up failed clients
        for client_id in failed_clients:
            await self.cleanup_client(client_id)
        
        logger.debug(f"📡 Broadcast: {successful_sends} successful, {len(failed_clients)} failed")
    
    async def broadcast_peer_update(self, doc_id: str, exclude_client: str = None):
        """Broadcast peer list update to all clients in a document"""
        if doc_id not in self.documents:
            return
        
        document = self.documents[doc_id]
        peer_count = len(document.clients)
        
        # Create peer list with truncated IDs for display
        peer_list = []
        for client_id in document.clients:
            peer_list.append({
                "id": client_id,
                "displayId": client_id.split('_')[-1] if '_' in client_id else client_id[:8],
                "isCurrentUser": False  # Will be set by client
            })
        
        # Create peer update message
        message = json.dumps({
            "type": "peerUpdate",
            "docId": doc_id,
            "peerCount": peer_count,
            "peers": peer_list
        })
        
        # Send to all clients in this document
        for client_id in document.clients:
            if client_id != exclude_client and client_id in self.clients:
                try:
                    await self.clients[client_id].send(message)
                except Exception as e:
                    logger.warning(f"⚠️ Failed to send peer update to {client_id}: {e}")
    
    async def cleanup_client(self, client_id: str):
        """Clean up a disconnected client"""
        doc_id = self.client_to_doc.get(client_id)
        
        # Remove from document
        if doc_id and doc_id in self.documents:
            document = self.documents[doc_id]
            is_empty = document.remove_client(client_id)
            
            # Notify remaining clients about peer count change
            if not is_empty:
                await self.broadcast_peer_update(doc_id)
            
            # If document has no more clients, save and optionally remove it
            if is_empty:
                self._save_document(doc_id, document)
                # Optionally remove empty documents after some time
                # For now, keep them in memory
        
        # Remove client references
        self.clients.pop(client_id, None)
        self.client_to_doc.pop(client_id, None)
        
        logger.info(f"🧹 Cleaned up client {client_id}")
    
    def generate_client_id(self) -> str:
        """Generate a unique client ID"""
        timestamp = int(time.time() * 1000)
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"v2_client_{timestamp}_{suffix}"
    
    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Starting Loro WebSocket Server V2")
        logger.info(f"   Host: {self.host}")
        logger.info(f"   Port: {self.port}")
        logger.info(f"   Features: Incremental updates, YJS-style collaboration")
        
        self.running = True
        
        # Start the WebSocket server
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info(f"✅ Server V2 Ready!")
            logger.info(f"   URL: ws://{self.host}:{self.port}")
            logger.info(f"   Ready for incremental collaboration...")
            
            try:
                # Keep the server running
                await asyncio.Future()  # Run forever
            except (KeyboardInterrupt, asyncio.CancelledError):
                logger.info("🛑 Server V2 shutdown requested")
    
    async def shutdown(self):
        """Gracefully shutdown the server"""
        logger.info("🛑 Shutting down Loro WebSocket Server V2...")
        self.running = False
        
        # Save all documents
        for doc_id, document in self.documents.items():
            self._save_document(doc_id, document)
        
        # Close all client connections
        for client_id, websocket in self.clients.items():
            try:
                await websocket.close()
            except Exception as e:
                logger.warning(f"⚠️ Error closing client {client_id}: {e}")
        
        self.clients.clear()
        self.documents.clear()
        self.client_to_doc.clear()
        
        logger.info("✅ Server V2 shutdown complete")


async def main():
    """Main entry point for Server V2"""
    server = LoroWebSocketServerV2(
        port=8082,  # Different port from V1 server
        host="localhost"
    )
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("🛑 Received KeyboardInterrupt, shutting down V2 server...")
        await server.shutdown()
    except Exception as e:
        logger.error(f"❌ Server V2 error: {e}")
        await server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Server V2 stopped by user")
    except Exception as e:
        logger.error(f"❌ Failed to start Server V2: {e}")
        sys.exit(1)
    
    logger.info("🛑 Server V2 stopped")
    sys.exit(0)

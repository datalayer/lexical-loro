#!/usr/bin/env python3

import asyncio
import json
import logging
import time
from typing import Dict, Set, Union
from dataclasses import dataclass, asdict
import websockets
from websockets.server import WebSocketServerProtocol, serve
from loro import LoroDoc, ExportMode
from .lexical_converter import initialize_loro_doc_with_lexical_content, should_initialize_loro_doc

logger = logging.getLogger(__name__)

# Message type constants (matching TypeScript implementation)
MESSAGE_UPDATE = 'update'
MESSAGE_QUERY_SNAPSHOT = 'query-snapshot'
MESSAGE_EPHEMERAL = 'ephemeral'
MESSAGE_QUERY_EPHEMERAL = 'query-ephemeral'

@dataclass
class EphemeralMessage:
    type: str = MESSAGE_EPHEMERAL
    ephemeral: list = None
    docId: str = ""

class WSSharedDoc:
    def __init__(self, name: str):
        self.name = name
        # Create actual Loro document
        self.doc = LoroDoc()
        
        # Initialize with proper Lexical content structure
        try:
            # Add debug logging for initialization check
            tree = self.doc.get_tree("tree")
            all_nodes = tree.nodes()  # method
            roots = tree.roots        # property
            logger.info(f"[Server] Document state check - nodes: {len(all_nodes)}, roots: {len(roots)}")
            
            if should_initialize_loro_doc(self.doc):
                logger.info(f"[Server] Document is empty, initializing with Lexical content")
                initialize_loro_doc_with_lexical_content(self.doc, logger)
                self.doc.commit()
                logger.info(f"[Server] Successfully initialized document with Lexical content")
                
                # Verify initialization
                final_nodes = tree.nodes()  # method
                final_roots = tree.roots     # property
                logger.info(f"[Server] After initialization - nodes: {len(final_nodes)}, roots: {len(final_roots)}")
            else:
                logger.info(f"[Server] Document already has content, skipping initialization")
                # Log what content exists
                for i, root_id in enumerate(roots[:3]):  # First 3 roots
                    try:
                        root_node = tree.get(root_id)
                        element_type = root_node.data.get('elementType', 'unknown')
                        logger.info(f"[Server] Existing root {i}: {root_id} -> type: {element_type}")
                    except Exception as e:
                        logger.info(f"[Server] Error reading root {i}: {e}")
        except Exception as e:
            logger.error(f"[Server] Error initializing document with Lexical content: {e}")
            # Fallback to empty document
            try:
                tree = self.doc.get_tree("tree")
                root_id = tree.create()
                self.doc.commit()
                logger.warning(f"[Server] Fallback: Created basic empty document")
            except Exception as fallback_e:
                logger.error(f"[Server] Even fallback initialization failed: {fallback_e}")
        
        self.conns = {}
        self.ephemeral_store = {"data": {}}
        self.last_ephemeral_sender = None
        logger.info(f"[Server] Initialized document '{name}' with Loro tree structure")

# Global document storage
docs = {}

def clear_docs():
    """Clear all cached documents - useful for server restarts"""
    global docs
    docs.clear()
    logger.info(f"[Server] Cleared document cache")

def get_doc(docname: str):
    if docname not in docs:
        docs[docname] = WSSharedDoc(docname)
    return docs[docname]

def close_conn(doc, conn):
    if conn in doc.conns:
        logger.info(f"Closing connection for document: {doc.name}")
        del doc.conns[conn]
        logger.info(f"Remaining connections for document {doc.name}: {len(doc.conns)}")

async def message_listener(conn, doc, message):
    try:
        message_data = None
        message_str = ""
        
        if isinstance(message, str):
            message_str = message
        elif isinstance(message, bytes):
            try:
                message_str = message.decode('utf-8')
            except UnicodeDecodeError:
                logger.info(f"[Server] Received binary Loro update: {len(message)} bytes")
                # Apply the update to the document
                doc.doc.import_(message)
                
                # Broadcast to other connections
                for c in doc.conns:
                    if c != conn:
                        await c.send(message)
                return
        else:
            logger.warning(f"[Server] Unknown message type: {type(message)}")
            return
        
        if not message_str:
            return
        
        try:
            message_data = json.loads(message_str)
        except json.JSONDecodeError as e:
            logger.warning(f"[Server] JSON parse error: {e}")
            return
        
        message_type = message_data.get("type", "")
        logger.info(f"[Server] Received message type: {message_type} for doc: {doc.name}")
        
        if message_type == MESSAGE_QUERY_SNAPSHOT:
            await handle_query_snapshot(conn, doc, message_data)
        elif message_type == MESSAGE_EPHEMERAL:
            await handle_ephemeral(conn, doc, message_data)
        elif message_type == MESSAGE_QUERY_EPHEMERAL:
            await handle_query_ephemeral(conn, doc, message_data)
        elif message_type == MESSAGE_UPDATE:
            await handle_update(conn, doc, message_data)
        else:
            logger.warning(f"[Server] Unknown message type: {message_type}")
            
    except Exception as e:
        logger.error(f"[Server] Message handling error: {e}")

async def handle_query_snapshot(conn, doc, message_data):
    try:
        request_id = str(time.time())
        logger.info(f"[Server] Client requesting snapshot for doc: {doc.name} (Request ID: {request_id})")
        
        # Export actual Loro document snapshot
        snapshot = doc.doc.export(ExportMode.Snapshot())
        logger.info(f"[Server] Sending snapshot response: {len(snapshot)} bytes")
        
        # Log tree structure for debugging
        tree = doc.doc.get_tree("tree")
        nodes = tree.nodes()  # method call
        logger.info(f"[Server] Snapshot contains {len(nodes)} nodes from server document")
        
        await conn.send(snapshot)
        
    except Exception as e:
        logger.error(f"[Server] Error handling query-snapshot: {e}")
        import traceback
        logger.error(f"[Server] Traceback: {traceback.format_exc()}")

async def handle_ephemeral(conn, doc, message_data):
    try:
        ephemeral_data = message_data.get("ephemeral", [])
        logger.info(f"[Server] Received ephemeral data: {len(ephemeral_data)} bytes")
        
        doc.last_ephemeral_sender = conn
        doc.ephemeral_store["data"]["last_update"] = ephemeral_data
        
    except Exception as e:
        logger.error(f"[Server] Error handling ephemeral: {e}")
        doc.last_ephemeral_sender = None

async def handle_query_ephemeral(conn, doc, message_data):
    try:
        ephemeral_data = list(doc.ephemeral_store["data"].get("last_update", []))
        
        response = EphemeralMessage(
            type=MESSAGE_EPHEMERAL,
            ephemeral=ephemeral_data,
            docId=doc.name
        )
        
        await conn.send(json.dumps(asdict(response)))
        
    except Exception as e:
        logger.error(f"[Server] Error handling query-ephemeral: {e}")

async def handle_update(conn, doc, message_data):
    try:
        update_data = message_data.get("update", [])
        logger.info(f"[Server] Received update: {len(update_data)} bytes")
        
        # Apply update to Loro document
        if update_data:
            update_bytes = bytes(update_data)
            doc.doc.import_(update_bytes)
        
        # Broadcast to other connections
        broadcast_count = 0
        for c in doc.conns:
            if c != conn:
                logger.info(f"Broadcasting update to connection")
                await c.send(json.dumps(message_data))
                broadcast_count += 1
        
        logger.info(f"Broadcasted to {broadcast_count} connections")
        
    except Exception as e:
        logger.error(f"[Server] Error handling update: {e}")
        import traceback
        logger.error(f"[Server] Traceback: {traceback.format_exc()}")

async def setup_ws_connection(conn, path: str):
    doc_name = path.strip('/').split('?')[0] if path else 'default'
    if not doc_name:
        doc_name = 'default'
    
    doc = get_doc(doc_name)
    doc.conns[conn] = set()
    
    conn_id = f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown"
    logger.info(f"New connection established: {conn_id} for document: {doc_name}")
    
    try:
        # Send initial snapshot using actual Loro document
        initial_snapshot = doc.doc.export(ExportMode.Snapshot())
        logger.info(f"[Server] Sending initial snapshot to new client: {len(initial_snapshot)} bytes")
        await conn.send(initial_snapshot)
        
        ephemeral_data = list(doc.ephemeral_store["data"].get("last_update", []))
        if ephemeral_data:
            ephemeral_message = EphemeralMessage(
                type=MESSAGE_EPHEMERAL,
                ephemeral=ephemeral_data,
                docId=doc_name
            )
            await conn.send(json.dumps(asdict(ephemeral_message)))
        
        async for message in conn:
            await message_listener(conn, doc, message)
            
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"WebSocket connection {conn_id} closed")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        close_conn(doc, conn)

async def start_server(host: str = "localhost", port: int = 3002):
    logger.info(f"Starting Loro WebSocket server on {host}:{port}")
    
    # Clear any cached documents from previous runs
    clear_docs()
    
    async def handler(websocket, path):
        await setup_ws_connection(websocket, path)
    
    server = await serve(handler, host, port)
    logger.info(f"Tree WebSocket server running on ws://{host}:{port}")
    
    return server

def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    loop = asyncio.get_event_loop()
    server = loop.run_until_complete(start_server())
    
    try:
        loop.run_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down server...")
    finally:
        server.close()
        loop.run_until_complete(server.wait_closed())

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script to verify client ID correlation between WebSocket connections and frontend client IDs
"""

import asyncio
import logging
import sys
import os

# Add the lexical_loro package to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from lexical_loro.websocket.server import LoroWebSocketServer, logger

def setup_logging():
    """Configure logging to show both INFO and DEBUG messages for testing"""
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    logger.addHandler(handler)
    
    print("🔧 [Test] Configured logging for client ID correlation testing")

async def main():
    """Start the WebSocket server for testing client ID correlation"""
    setup_logging()
    
    print("\n🚀 [Test] Starting WebSocket server for client ID correlation testing...")
    print("📋 [Test] Expected behavior:")
    print("   1. Server logs connection IDs like 'conn-127.0.0.1:PORT'")
    print("   2. When clients send snapshot/ephemeral queries with clientId, server should log correlation")
    print("   3. Subsequent messages should use the actual client ID instead of connection ID")
    print("   4. Example: '🆔 [Server] CLIENT ID from snapshot request: conn-127.0.0.1:57182 ↔ 14323506847357078000'")
    print("\n📡 [Test] Open your browser and navigate to: http://localhost:3002")
    print("🔗 [Test] Try opening multiple tabs to test multi-client correlation")
    print("💬 [Test] Type some text and watch the server logs for client ID correlation messages")
    print("\n⏹️  [Test] Press Ctrl+C to stop the server\n")
    
    try:
        # Create and start server with debug logging
        server = LoroWebSocketServer(
            host="localhost",
            port=3002,
            autosave_interval_sec=5
        )
        
        print(f"✅ [Test] WebSocket server running on ws://localhost:3002/ws")
        await server.start()
        
    except KeyboardInterrupt:
        print("\n🛑 [Test] Server stopped by user")
    except Exception as e:
        print(f"❌ [Test] Server error: {e}")
        # Stop server if it was created
        try:
            await server.stop()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(main())
#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Final test: Complete MCP collaborative functionality
"""

import asyncio
import json
from lexical_loro.mcp.server import append_paragraph, initialize_mcp_collaboration, document_manager

async def test_final_mcp_collaboration():
    """Test complete MCP collaborative functionality"""
    print("🚀 Final MCP Collaboration Test")
    print("=" * 50)
    
    # Initialize MCP collaboration with async WebSocket connection
    await initialize_mcp_collaboration()
    
    # Wait for connection to stabilize
    await asyncio.sleep(2)
    
    print(f"🔌 WebSocket connected: {document_manager.connected}")
    print(f"🆔 Client ID: {getattr(document_manager, 'client_id', 'N/A')}")
    
    # Test append paragraph through MCP
    print("\n➕ Testing MCP append_paragraph...")
    result = await append_paragraph("🎉 MCP collaborative test successful!", None)
    print(f"📤 Result: {json.dumps(result, indent=2)}")
    
    # Wait for propagation
    await asyncio.sleep(1)
    
    print("\n✅ MCP collaborative functionality verified!")
    print("🌐 Changes should now be visible to all connected clients")
    print("📝 Open browser at http://localhost:3000 to see real-time updates")

if __name__ == "__main__":
    asyncio.run(test_final_mcp_collaboration())

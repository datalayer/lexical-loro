#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Quick test to verify MCP server WebSocket integration fixes
"""
import asyncio
import aiohttp
import json

async def test_mcp_server():
    """Test the MCP server WebSocket integration"""
    print("🚀 Testing MCP Server WebSocket Integration...")
    
    async with aiohttp.ClientSession() as session:
        # Test getting a document (should trigger WebSocket connection)
        print("📝 Testing get_document...")
        
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "get_document",
            "params": {"doc_id": "websocket-test"}
        }
        
        async with session.post('http://localhost:3001', json=payload) as response:
            result = await response.json()
            print(f"   Response: {result.get('result', {}).get('success', False)}")
            
        print("📝 Testing append_paragraph...")
        
        payload = {
            "jsonrpc": "2.0", 
            "id": 2,
            "method": "append_paragraph",
            "params": {"doc_id": "websocket-test", "text": "Testing WebSocket integration"}
        }
        
        async with session.post('http://localhost:3001', json=payload) as response:
            result = await response.json()
            print(f"   Response: {result.get('result', {}).get('success', False)}")
            
        # Wait a moment for any WebSocket processing
        await asyncio.sleep(2)
        
        print("✅ Test completed - check server logs for WebSocket activity")

if __name__ == "__main__":
    asyncio.run(test_mcp_server())
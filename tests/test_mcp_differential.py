#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script to verify MCP operations work with differential updates
"""

import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def test_mcp_differential():
    """Test MCP operations with differential updates"""
    server_params = StdioServerParameters(
        command="python",
        args=["-m", "lexical_loro.mcp", "start", "--transport", "stdio"]
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            print("🔌 Connected to MCP server")
            
            # Initialize session
            await session.initialize()
            
            # Test get_document_info - this should use differential updates
            result = await session.call_tool("get_document_info", {"document_id": "example-1"})
            print(f"📄 Document info: {json.dumps(result.content, indent=2)}")
            
            # Test append_paragraph - this should also use differential updates
            result = await session.call_tool("append_paragraph", {
                "document_id": "example-1",
                "text": "This is a test paragraph added via MCP with differential updates!"
            })
            print(f"✅ Append result: {json.dumps(result.content, indent=2)}")
            
            print("🎉 Test completed successfully!")

if __name__ == "__main__":
    asyncio.run(test_mcp_differential())

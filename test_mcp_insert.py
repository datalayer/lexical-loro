#!/usr/bin/env python3

"""
Test script using MCP server to verify that insert_paragraph fix is working
"""

import asyncio
import json
import subprocess
import time

async def test_mcp_insert():
    """Test insert_paragraph via MCP server"""
    
    print("🧪 Testing insert_paragraph via MCP server...")
    
    # Start the MCP server in the background  
    print("🚀 Starting MCP server...")
    
    try:
        # Test append_paragraph first
        print("\n📝 Testing append_paragraph (should work)...")
        
        append_commands = [
            ["python", "-m", "lexical_loro.cli", "append-paragraph", "--doc-id", "test-mcp", "--text", "First paragraph"],
            ["python", "-m", "lexical_loro.cli", "append-paragraph", "--doc-id", "test-mcp", "--text", "Second paragraph"],
            ["python", "-m", "lexical_loro.cli", "append-paragraph", "--doc-id", "test-mcp", "--text", "Third paragraph"]
        ]
        
        for i, cmd in enumerate(append_commands):
            print(f"   Running: {' '.join(cmd[4:])}")  # Show just the relevant part
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(f"   ✅ Success: {result.stdout.strip()}")
            else:
                print(f"   ❌ Failed: {result.stderr.strip()}")
        
        # Now test insert_paragraph
        print("\n🎯 Testing insert_paragraph at index 1...")
        
        insert_cmd = ["python", "-m", "lexical_loro.cli", "insert-paragraph", "--doc-id", "test-mcp", "--index", "1", "--text", "INSERTED at index 1"]
        print(f"   Running: {' '.join(insert_cmd[4:])}")
        
        result = subprocess.run(insert_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"   ✅ Insert Success: {result.stdout.strip()}")
        else:
            print(f"   ❌ Insert Failed: {result.stderr.strip()}")
        
        # Get final document info
        print("\n📋 Getting final document info...")
        
        info_cmd = ["python", "-m", "lexical_loro.cli", "get-document-info", "--doc-id", "test-mcp"]
        result = subprocess.run(info_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"   ✅ Document info:")
            # Try to parse and format the JSON output
            try:
                doc_info = json.loads(result.stdout)
                if isinstance(doc_info, dict):
                    blocks = doc_info.get("content", {}).get("root", {}).get("children", [])
                    print(f"      Document has {len(blocks)} blocks:")
                    for idx, block in enumerate(blocks):
                        text_nodes = block.get("children", [])
                        if text_nodes and text_nodes[0].get("type") == "text":
                            text = text_nodes[0].get("text", "")
                            print(f"         {idx}: {text}")
                else:
                    print(f"      Raw output: {result.stdout.strip()}")
            except json.JSONDecodeError:
                print(f"      Raw output: {result.stdout.strip()}")
        else:
            print(f"   ❌ Info Failed: {result.stderr.strip()}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_mcp_insert())

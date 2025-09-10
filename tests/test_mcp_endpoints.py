#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


import requests
import json
import time
import subprocess
import threading

def test_mcp_server():
    """Test the MCP server endpoints"""
    
    # Start the server in background
    print("Starting MCP server...")
    server_process = subprocess.Popen([
        "python3", "-c", 
        "import uvicorn; from lexical_loro.mcp.server import mcp; uvicorn.run(mcp.streamable_http_app(), host='0.0.0.0', port=3001)"
    ])
    
    # Wait for server to start
    time.sleep(3)
    
    try:
        # Test different possible endpoints
        endpoints_to_test = [
            "http://localhost:3001/",
            "http://localhost:3001/mcp",
            "http://localhost:3001/tools",
            "http://localhost:3001/call_tool",
            "http://localhost:3001/list_tools"
        ]
        
        for endpoint in endpoints_to_test:
            print(f"\n🔍 Testing endpoint: {endpoint}")
            
            # Test GET request
            try:
                response = requests.get(endpoint, timeout=2)
                print(f"  GET: Status {response.status_code}")
                if response.status_code == 200:
                    print(f"  Response: {response.text[:200]}...")
            except Exception as e:
                print(f"  GET failed: {e}")
            
            # Test POST request
            try:
                test_data = {"method": "list_tools", "params": {}}
                response = requests.post(endpoint, json=test_data, timeout=2)
                print(f"  POST: Status {response.status_code}")
                if response.status_code == 200:
                    print(f"  Response: {response.text[:200]}...")
            except Exception as e:
                print(f"  POST failed: {e}")
        
        # Test the MCP tools directly if we can call them
        print(f"\n🔧 Testing direct tool call...")
        try:
            from lexical_loro.mcp.server import mcp
            # This would be the direct approach
            print("  Direct MCP object available")
        except Exception as e:
            print(f"  Direct access failed: {e}")
            
    finally:
        print("\n🛑 Stopping server...")
        server_process.terminate()
        server_process.wait()
        print("✅ Server stopped")

if __name__ == "__main__":
    test_mcp_server()

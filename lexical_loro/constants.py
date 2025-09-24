# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Shared constants for Lexical-Loro integration

This module defines constants that are shared across different components
of the Lexical-Loro system to ensure consistency.
"""

# Tree name used for Loro CRDT tree container
# Must match the TypeScript constant DEFAULT_TREE_NAME in utils/Utils.ts
DEFAULT_TREE_NAME = "lexical-tree"

# WebSocket server configuration
DEFAULT_WEBSOCKET_HOST = "localhost"
DEFAULT_WEBSOCKET_PORT = 3002

# MCP server configuration  
DEFAULT_MCP_HOST = "0.0.0.0"
DEFAULT_MCP_PORT = 3001
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

from .server import (
    main,
    LexicalMCPServer,
    set_document_manager,
    get_document_manager,
    mcp,
    document_manager,
)

__all__ = [
    "main",
    "LexicalMCPServer", 
    "set_document_manager",
    "get_document_manager",
    "mcp",
    "document_manager",
]

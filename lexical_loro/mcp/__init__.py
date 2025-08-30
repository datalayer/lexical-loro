# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

from .server import LexicalMCPServer, main_sync

# Export the sync version as main for script entry points
main = main_sync

__all__ = ["LexicalMCPServer", "main"]

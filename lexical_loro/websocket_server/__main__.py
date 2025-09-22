# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""Main entry point for the tree-based WebSocket server."""

import asyncio

if __name__ == "__main__":
    from .server import main
    asyncio.run(main())
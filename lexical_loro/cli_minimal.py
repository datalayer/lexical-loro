# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
CLI for Step 8: Minimal server demonstrating clean separation
"""

import asyncio
import logging
import click
from .server_minimal import MinimalLoroServer


@click.command()
@click.option("--port", "-p", default=8082, help="Port to run the minimal server on (default: 8082)")
@click.option("--host", "-h", default="localhost", help="Host to bind to (default: localhost)")
@click.option("--log-level", "-l", default="INFO", 
              type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
              help="Logging level (default: INFO)")
def main(port: int, host: str, log_level: str):
    """
    Start the Step 8 Minimal Loro Server demonstrating clean separation.
    
    This ~200-line server shows how easy it is to build a collaboration
    server when all document logic is contained in the LexicalModel library.
    
    Clean separation:
    - Server: WebSocket + Client Management
    - LexicalModel: Document Logic + CRDT Operations
    """
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    logger = logging.getLogger(__name__)
    logger.info("🎯 Step 8: Minimal Server Demo")
    logger.info(f"📍 Server: {host}:{port}")
    logger.info("✨ Clean separation: Server=WebSocket, LexicalModel=Documents")
    logger.info("🔄 Easy to swap with FastAPI, Flask, Django, etc.")
    
    # Create and start minimal server
    server = MinimalLoroServer(port=port, host=host)
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        logger.info("🛑 Minimal server stopped by user")


if __name__ == "__main__":
    main()

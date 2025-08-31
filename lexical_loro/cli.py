# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Command line interface for the Lexical Loro server
CLI for pure WebSocket relay server
"""

import asyncio
import logging
import click
from .server import LoroWebSocketServer


@click.command()
@click.option("--port", "-p", default=8081, help="Port to run the server on (default: 8081)")
@click.option("--host", "-h", default="localhost", help="Host to bind to (default: localhost)")
@click.option("--log-level", "-l", default="INFO", 
              type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
              help="Logging level (default: INFO)")
def main(port: int, host: str, log_level: str):
    """
    Start the Lexical Loro WebSocket relay server for real-time collaboration.
    
    This server is now a pure WebSocket relay that delegates all 
    document and ephemeral operations to LexicalModel. The server only handles:
    - Client connections and WebSocket communication
    - Message routing to LexicalModel methods  
    - Broadcasting responses from LexicalModel events
    
    All Loro CRDT operations and ephemeral data management are handled by LexicalModel.
    """
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Create and start the server
    server = LoroWebSocketServer(port=port, host=host)
    
    click.echo(f"🚀 Starting Lexical Loro relay server on {host}:{port}")
    click.echo(f"📋 Log level: {log_level}")
    click.echo("📡 Pure WebSocket relay - all operations delegated to LexicalModel")
    click.echo("Press Ctrl+C to stop the server")
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        click.echo("\n🛑 Server stopped by user")
    except Exception as e:
        click.echo(f"❌ Server error: {e}")
        raise click.ClickException(str(e))


if __name__ == "__main__":
    main()

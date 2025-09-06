# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Command line interface for the Lexical Loro server
CLI for WebSocket relay servers (V1 and V2)
"""

import asyncio
import logging
import click
from .server import LoroWebSocketServer
from .serverv2 import LoroWebSocketServerV2


@click.group()
def cli():
    """Lexical Loro WebSocket Servers"""
    pass


@cli.command()
@click.option("--port", "-p", default=8081, help="Port to run the server on (default: 8081)")
@click.option("--host", "-h", default="localhost", help="Host to bind to (default: localhost)")
@click.option("--log-level", "-l", default="INFO", 
              type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
              help="Logging level (default: INFO)")
def serverv1(port: int, host: str, log_level: str):
    """
    Start the Lexical Loro WebSocket relay server V1 for real-time collaboration.
    
    This server uses full editor state replacement and is compatible with the
    original LoroCollaborativePlugin.
    """
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Create and start the server
    server = LoroWebSocketServer(
        port=port,
        host=host,
        autosave_interval_sec=60
    )
    
    click.echo(f"🚀 Starting Lexical Loro V1 server on {host}:{port}")
    click.echo(f"📋 Log level: {log_level}")
    click.echo("📡 V1 Server - Full state replacement")
    click.echo("Press Ctrl+C to stop the server")
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        click.echo("\n🛑 Server stopped by user")


@cli.command()
@click.option("--port", "-p", default=8083, help="Port to run the server on (default: 8083)")
@click.option("--host", "-h", default="localhost", help="Host to bind to (default: localhost)")
@click.option("--log-level", "-l", default="INFO", 
              type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
              help="Logging level (default: INFO)")
def serverv2(port: int, host: str, log_level: str):
    """
    Start the Lexical Loro WebSocket server V2 for incremental collaboration.
    
    This server uses incremental Loro updates and is designed for the
    LoroCollaborativePluginV2 that follows the YJS pattern.
    """
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Create and start the V2 server
    server = LoroWebSocketServerV2(
        port=port,
        host=host
    )
    
    click.echo(f"🚀 Starting Lexical Loro V2 server on {host}:{port}")
    click.echo(f"📋 Log level: {log_level}")
    click.echo("⚡ V2 Server - Incremental updates, YJS-style collaboration")
    click.echo("Press Ctrl+C to stop the server")
    
    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        click.echo("\n🛑 V2 Server stopped by user")


# Keep the original main command for backward compatibility
@cli.command()
@click.option("--port", "-p", default=8081, help="Port to run the server on (default: 8081)")
@click.option("--host", "-h", default="localhost", help="Host to bind to (default: localhost)")
@click.option("--log-level", "-l", default="INFO", 
              type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"], case_sensitive=False),
              help="Logging level (default: INFO)")
def main(port: int, host: str, log_level: str):
    """
    Start the Lexical Loro WebSocket relay server for real-time collaboration.
    
    This is the V1 server (same as serverv1) kept for backward compatibility.
    """
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Create and start the server
    server = LoroWebSocketServer(
        port=port,
        host=host,
        autosave_interval_sec=60
    )
    
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
    cli()

"""
Command line interface for the Lexical Loro server
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
    Start the Lexical Loro WebSocket server for real-time collaboration.
    
    This server handles Loro CRDT operations for collaborative text editing
    with Lexical editor clients.
    """
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(levelname)s - %(message)s"
    )
    
    # Create and start the server
    server = LoroWebSocketServer(port)
    server.host = host  # Add host attribute if needed
    
    click.echo(f"🚀 Starting Lexical Loro server on {host}:{port}")
    click.echo(f"📋 Log level: {log_level}")
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

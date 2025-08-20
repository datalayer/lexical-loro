"""
Lexical Loro - Python package for Lexical + Loro CRDT integration
"""

__version__ = "0.1.0"
__author__ = "Datalayer"
__email__ = "eric@datalayer.io"

from .server import LoroWebSocketServer, Client

__all__ = ["LoroWebSocketServer", "Client"]

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Lexical Loro - Python package for Lexical + Loro CRDT integration
"""

__version__ = "0.1.0"
__author__ = "Datalayer"
__email__ = "eric@datalayer.io"

from .server import LoroWebSocketServer, Client
from .model.lexical_model import LexicalModel

__all__ = ["LoroWebSocketServer", "Client", "LexicalModel"]

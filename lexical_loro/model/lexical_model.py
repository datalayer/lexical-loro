# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import json
import time
from typing import Dict, Any, List, Optional
try:
    import loro
except ImportError:
    # Fallback for when loro is not available
    loro = None


class LoroModel:
    """
    A class that implements two-way binding between Lexical data structure and Loro documents.
    
    Manages two Loro documents:
    1. A text document with serialized content
    2. A structured document that mirrors the lexical structure with LoroMap and LoroArray
    """
    
    def __init__(self):
        if loro is None:
            raise ImportError("loro package is required for LoroModel")
            
        # Initialize two Loro documents
        self.text_doc = loro.LoroDoc()
        self.structured_doc = loro.LoroDoc()
        
        # Initialize the lexical model structure
        self.lexical_data = {
            "root": {
                "children": [],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "root",
                "version": 1
            },
            "lastSaved": int(time.time() * 1000),
            "source": "Lexical Loro",
            "version": "0.34.0"
        }
        
        # Initialize Loro documents with the base structure
        self._sync_to_loro()
    
    def _sync_to_loro(self):
        """Sync the current lexical_data to both Loro documents"""
        # Update text document with serialized JSON
        text_data = self.text_doc.get_text("content")
        current_length = text_data.len_unicode
        if current_length > 0:
            text_data.delete(0, current_length)
        text_data.insert(0, json.dumps(self.lexical_data))
        
        # Update structured document with basic metadata only
        root_map = self.structured_doc.get_map("root")
        
        # Clear existing data
        for key in list(root_map.keys()):
            root_map.delete(key)
            
        # Set basic properties using insert method
        root_map.insert("lastSaved", self.lexical_data["lastSaved"])
        root_map.insert("source", self.lexical_data["source"])
        root_map.insert("version", self.lexical_data["version"])
        root_map.insert("blockCount", len(self.lexical_data["root"]["children"]))
    
    def _sync_from_loro(self):
        """Sync data from Loro documents back to lexical_data"""
        # For now, sync from text document since it's simpler and more reliable
        try:
            text_data = self.text_doc.get_text("content")
            content = text_data.to_string()
            if content:
                self.lexical_data = json.loads(content)
        except Exception:
            # If sync fails, keep current data
            pass
    
    
    def add_block(self, block_detail: Dict[str, Any], block_type: str):
        """
        Add a new block to the lexical model
        
        Args:
            block_detail: Dictionary containing block details (text, formatting, etc.)
            block_type: Type of block (paragraph, heading1, heading2, etc.)
        """
        # Map block types to lexical types
        type_mapping = {
            "paragraph": "paragraph",
            "heading1": "heading",
            "heading2": "heading",
            "heading3": "heading",
            "heading4": "heading",
            "heading5": "heading",
            "heading6": "heading",
        }
        
        lexical_type = type_mapping.get(block_type, "paragraph")
        
        # Create the block structure
        new_block = {
            "children": [],
            "direction": None,
            "format": "",
            "indent": 0,
            "type": lexical_type,
            "version": 1
        }
        
        # Add heading tag if it's a heading
        if block_type.startswith("heading"):
            heading_level = block_type.replace("heading", "") or "1"
            new_block["tag"] = f"h{heading_level}"
        elif lexical_type == "paragraph":
            new_block["textFormat"] = 0
            new_block["textStyle"] = ""
        
        # Add text content if provided
        if "text" in block_detail:
            text_node = {
                "detail": block_detail.get("detail", 0),
                "format": block_detail.get("format", 0),
                "mode": block_detail.get("mode", "normal"),
                "style": block_detail.get("style", ""),
                "text": block_detail["text"],
                "type": "text",
                "version": 1
            }
            new_block["children"].append(text_node)
        
        # Add any additional properties from block_detail
        for key, value in block_detail.items():
            if key not in ["text", "detail", "format", "mode", "style"]:
                new_block[key] = value
        
        # Add block to the lexical data
        self.lexical_data["root"]["children"].append(new_block)
        self.lexical_data["lastSaved"] = int(time.time() * 1000)
        
        # Sync to Loro documents
        self._sync_to_loro()
    
    def get_blocks(self) -> List[Dict[str, Any]]:
        """Get all blocks from the lexical model"""
        self._sync_from_loro()
        return self.lexical_data["root"]["children"]
    
    def get_lexical_data(self) -> Dict[str, Any]:
        """Get the complete lexical data structure"""
        self._sync_from_loro()
        return self.lexical_data
    
    def update_block(self, index: int, block_detail: Dict[str, Any], block_type: Optional[str] = None):
        """
        Update an existing block
        
        Args:
            index: Index of the block to update
            block_detail: New block details
            block_type: New block type (optional)
        """
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            if block_type:
                # Remove the old block and insert updated one
                self.lexical_data["root"]["children"].pop(index)
                old_children = self.lexical_data["root"]["children"][index:]
                self.lexical_data["root"]["children"] = self.lexical_data["root"]["children"][:index]
                self.add_block(block_detail, block_type)
                self.lexical_data["root"]["children"].extend(old_children)
            else:
                # Update existing block in place
                current_block = self.lexical_data["root"]["children"][index]
                
                # Update text content if provided
                if "text" in block_detail and current_block.get("children"):
                    for child in current_block["children"]:
                        if child.get("type") == "text":
                            child["text"] = block_detail["text"]
                            for key in ["detail", "format", "mode", "style"]:
                                if key in block_detail:
                                    child[key] = block_detail[key]
                
                # Update other block properties
                for key, value in block_detail.items():
                    if key not in ["text", "detail", "format", "mode", "style"]:
                        current_block[key] = value
                
                self.lexical_data["lastSaved"] = int(time.time() * 1000)
                self._sync_to_loro()
    
    def remove_block(self, index: int):
        """Remove a block by index"""
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            self.lexical_data["root"]["children"].pop(index)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            self._sync_to_loro()
    
    def get_text_document(self):
        """Get the text Loro document"""
        return self.text_doc
    
    def get_structured_document(self):
        """Get the structured Loro document"""
        return self.structured_doc
    
    def export_as_json(self) -> str:
        """Export the current lexical data as JSON string"""
        self._sync_from_loro()
        return json.dumps(self.lexical_data, indent=2)
    
    def import_from_json(self, json_data: str):
        """Import lexical data from JSON string"""
        self.lexical_data = json.loads(json_data)
        self._sync_to_loro()

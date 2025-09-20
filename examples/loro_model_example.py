#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Demo script showcasing LoroModel usage for building collaborative models
"""

import json
import time
import loro
from typing import List, Dict, Any, Optional

class LoroModel:
    """LoroModel implementation using real Loro library"""
    
    def __init__(self):
        self.text_doc = loro.LoroDoc()
        self.structured_doc = loro.LoroDoc()
        
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
        
        # Initialize Loro models with the base structure
        self._sync_to_loro()
    
    def _sync_to_loro(self):
        """Sync the current lexical_data to both Loro models"""
        # Update text document with serialized JSON
        text_data = self.text_doc.get_text("content")
        current_length = text_data.len_unicode
        if current_length > 0:
            text_data.delete(0, current_length)
        text_data.insert(0, json.dumps(self.lexical_data))
        
        # Update structured document with basic metadata
        root_map = self.structured_doc.get_map("root")
        
        # Clear existing data
        for key in list(root_map.keys()):
            root_map.delete(key)
            
        # Set basic properties using insert method
        root_map.insert("lastSaved", self.lexical_data["lastSaved"])
        root_map.insert("source", self.lexical_data["source"])
        root_map.insert("version", self.lexical_data["version"])
        root_map.insert("blockCount", len(self.lexical_data["root"]["children"]))
    
    
    def add_block(self, block_detail: Dict[str, Any], block_type: str):
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
        
        new_block = {
            "children": [],
            "direction": None,
            "format": "",
            "indent": 0,
            "type": lexical_type,
            "version": 1
        }
        
        if block_type.startswith("heading"):
            heading_level = block_type.replace("heading", "") or "1"
            new_block["tag"] = f"h{heading_level}"
        elif lexical_type == "paragraph":
            new_block["textFormat"] = 0
            new_block["textStyle"] = ""
        
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
        
        for key, value in block_detail.items():
            if key not in ["text", "detail", "format", "mode", "style"]:
                new_block[key] = value
        
        self.lexical_data["root"]["children"].append(new_block)
        self.lexical_data["lastSaved"] = int(time.time() * 1000)
        
        # Sync to Loro models
        self._sync_to_loro()
    
    def get_blocks(self) -> List[Dict[str, Any]]:
        return self.lexical_data["root"]["children"]
    
    def update_block(self, index: int, block_detail: Dict[str, Any], block_type: Optional[str] = None):
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            if block_type:
                self.lexical_data["root"]["children"].pop(index)
                old_children = self.lexical_data["root"]["children"][index:]
                self.lexical_data["root"]["children"] = self.lexical_data["root"]["children"][:index]
                self.add_block(block_detail, block_type)
                self.lexical_data["root"]["children"].extend(old_children)
            else:
                current_block = self.lexical_data["root"]["children"][index]
                
                if "text" in block_detail and current_block.get("children"):
                    for child in current_block["children"]:
                        if child.get("type") == "text":
                            child["text"] = block_detail["text"]
                            for key in ["detail", "format", "mode", "style"]:
                                if key in block_detail:
                                    child[key] = block_detail[key]
                
                for key, value in block_detail.items():
                    if key not in ["text", "detail", "format", "mode", "style"]:
                        current_block[key] = value
                
                self.lexical_data["lastSaved"] = int(time.time() * 1000)
                self._sync_to_loro()
    
    def remove_block(self, index: int):
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            self.lexical_data["root"]["children"].pop(index)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            self._sync_to_loro()
    
    def export_as_json(self) -> str:
        return json.dumps(self.lexical_data, indent=2)
    
    def import_from_json(self, json_data: str):
        self.lexical_data = json.loads(json_data)
        self._sync_to_loro()


class DocumentBuilder:
    """Helper class to build models with LoroModel"""
    
    def __init__(self):
        self.model = LoroModel()
    
    def add_title(self, text: str):
        """Add a main title (H1)"""
        self.model.add_block({"text": text}, "heading1")
        return self
    
    def add_subtitle(self, text: str):
        """Add a subtitle (H2)"""
        self.model.add_block({"text": text}, "heading2")
        return self
    
    def add_section(self, text: str):
        """Add a section header (H3)"""
        self.model.add_block({"text": text}, "heading3")
        return self
    
    def add_paragraph(self, text: str, **formatting):
        """Add a paragraph with optional formatting"""
        block_detail = {"text": text}
        block_detail.update(formatting)
        self.model.add_block(block_detail, "paragraph")
        return self
    
    def add_bold_text(self, text: str):
        """Add bold paragraph"""
        return self.add_paragraph(text, format=1, style="font-weight: bold;")
    
    def add_italic_text(self, text: str):
        """Add italic paragraph"""
        return self.add_paragraph(text, format=2, style="font-style: italic;")
    
    def get_model(self) -> LoroModel:
        """Get the underlying LoroModel"""
        return self.model


def demo_blog_post():
    """Demo: Building a blog post"""
    print("📝 Demo: Building a Blog Post")
    print("-" * 40)
    
    builder = DocumentBuilder()
    
    # Build the blog post
    (builder
     .add_title("The Future of Collaborative Text Editing")
     .add_paragraph("In today's digital workplace, collaboration is key to productivity.")
     .add_subtitle("The Problem with Traditional Editors")
     .add_paragraph("Most text editors were designed for single-user scenarios.")
     .add_bold_text("Real-time collaboration often results in conflicts and lost work.")
     .add_subtitle("Enter Lexical-Loro")
     .add_paragraph("Lexical-Loro combines Facebook's Lexical with Loro's CRDT technology.")
     .add_section("Key Benefits")
     .add_paragraph("• Conflict-free collaborative editing")
     .add_paragraph("• Rich text formatting support")
     .add_paragraph("• Real-time synchronization")
     .add_italic_text("Experience the future of collaborative editing today!"))
    
    model = builder.get_model()
    blocks = model.get_blocks()
    
    print(f"✅ Created blog post with {len(blocks)} blocks")
    
    # Display the structure
    for i, block in enumerate(blocks):
        block_type = block['type']
        tag = block.get('tag', '')
        text = ""
        if block.get('children') and len(block['children']) > 0:
            text = block['children'][0].get('text', '')[:50]
            if len(text) == 50:
                text += "..."
        
        type_display = f"{tag.upper()}" if tag else block_type.upper()
        print(f"  {i+1:2d}. {type_display:<12} {text}")
    
    return model


def demo_collaborative_editing():
    """Demo: Simulating collaborative editing"""
    print("\n🤝 Demo: Collaborative Editing Simulation")
    print("-" * 45)
    
    model = LoroModel()
    
    # Simulate user actions with timestamps
    actions = [
        ("Alice", "add", "Meeting Notes", "heading1"),
        ("Bob", "add", "Attendees: Alice, Bob, Charlie", "paragraph"),
        ("Charlie", "add", "Agenda", "heading2"),
        ("Alice", "add", "1. Project status update", "paragraph"),
        ("Bob", "add", "2. Budget review", "paragraph"),
        ("Charlie", "add", "3. Next steps", "paragraph"),
        ("Alice", "update", 1, "Attendees: Alice, Bob, Charlie, Diana"),
        ("Bob", "add", "Action Items", "heading2"),
        ("Charlie", "add", "Alice: Complete project proposal by Friday", "paragraph"),
    ]
    
    print("Simulating real-time collaborative editing:")
    
    for i, action in enumerate(actions):
        time.sleep(0.1)  # Simulate time delay
        
        if action[1] == "add":
            user, op, text, block_type = action
            model.add_block({"text": text}, block_type)
            print(f"  {i+1:2d}. {user:<8} added {block_type:<10} '{text[:30]}{'...' if len(text) > 30 else ''}'")
        
        elif action[1] == "update":
            user, op, index, new_text = action
            model.update_block(index, {"text": new_text})
            print(f"  {i+1:2d}. {user:<8} updated block {index:<7} '{new_text[:30]}{'...' if len(new_text) > 30 else ''}'")
    
    blocks = model.get_blocks()
    print(f"\n✅ Collaborative document completed with {len(blocks)} blocks")
    
    print("\nFinal document structure:")
    for i, block in enumerate(blocks):
        block_type = block['type']
        tag = block.get('tag', '')
        text = block['children'][0]['text'] if block.get('children') else ""
        
        indent = "    " if block_type == "paragraph" else "  "
        type_display = f"[{tag.upper()}]" if tag else f"[{block_type.upper()}]"
        print(f"{indent}{type_display} {text}")
    
    return model


def demo_document_operations():
    """Demo: Document manipulation operations"""
    print("\n🔧 Demo: Document Operations")
    print("-" * 35)
    
    model = LoroModel()
    
    print("1. Creating initial document...")
    initial_content = [
        ("heading1", "Document Operations Demo"),
        ("paragraph", "This document will be modified."),
        ("heading2", "Section to be updated"),
        ("paragraph", "Original content here."),
        ("paragraph", "This paragraph will be removed."),
        ("heading2", "Final section")
    ]
    
    for block_type, text in initial_content:
        model.add_block({"text": text}, block_type)
    
    print(f"   ✓ Created document with {len(model.get_blocks())} blocks")
    
    print("\n2. Updating content...")
    # Update the title
    model.update_block(0, {"text": "Updated Document Operations Demo"})
    print("   ✓ Updated title")
    
    # Update section header
    model.update_block(2, {"text": "Updated Section Header"})
    print("   ✓ Updated section header")
    
    # Update paragraph with formatting
    model.update_block(3, {
        "text": "This content has been updated with bold formatting.",
        "format": 1,
        "style": "font-weight: bold;"
    })
    print("   ✓ Updated paragraph with formatting")
    
    print("\n3. Removing content...")
    # Remove the paragraph that was marked for removal
    model.remove_block(4)
    print("   ✓ Removed unwanted paragraph")
    
    print("\n4. Adding new content...")
    # Insert new content
    model.add_block({
        "text": "This is newly added content at the end.",
        "format": 2,
        "style": "font-style: italic;"
    }, "paragraph")
    print("   ✓ Added new italic paragraph")
    
    print(f"\nFinal document has {len(model.get_blocks())} blocks:")
    blocks = model.get_blocks()
    for i, block in enumerate(blocks):
        text = block['children'][0]['text'] if block.get('children') else ""
        block_type = block.get('tag', block['type']).upper()
        formatting = ""
        if block.get('children') and block['children'][0].get('format'):
            fmt = block['children'][0]['format']
            if fmt == 1:
                formatting = " (BOLD)"
            elif fmt == 2:
                formatting = " (ITALIC)"
        print(f"   {i+1}. [{block_type}] {text[:50]}{'...' if len(text) > 50 else ''}{formatting}")
    
    return model


def demo_data_exchange():
    """Demo: Data serialization and exchange"""
    print("\n💾 Demo: Data Serialization and Exchange")
    print("-" * 45)
    
    # Create a sample document
    print("1. Creating sample document...")
    model1 = LoroModel()
    
    sample_content = [
        ("heading1", "Data Exchange Example"),
        ("paragraph", "This document demonstrates serialization."),
        ("heading2", "Export Features"),
        ("paragraph", "Documents can be exported to JSON format."),
        ("paragraph", "The JSON includes all formatting and structure."),
        ("heading2", "Import Features"),
        ("paragraph", "JSON data can be imported to create identical models.")
    ]
    
    for block_type, text in sample_content:
        model1.add_block({"text": text}, block_type)
    
    print(f"   ✓ Created document with {len(model1.get_blocks())} blocks")
    
    print("\n2. Exporting to JSON...")
    json_data = model1.export_as_json()
    parsed_data = json.loads(json_data)
    
    print("   ✓ Exported to JSON")
    print(f"   ✓ JSON size: {len(json_data)} characters")
    print(f"   ✓ Root children: {len(parsed_data['root']['children'])}")
    print(f"   ✓ Document version: {parsed_data['version']}")
    print(f"   ✓ Source: {parsed_data['source']}")
    
    print("\n3. Creating new model from JSON...")
    model2 = LoroModel()
    model2.import_from_json(json_data)
    
    print("   ✓ Imported JSON data")
    
    print("\n4. Verifying data integrity...")
    blocks1 = model1.get_blocks()
    blocks2 = model2.get_blocks()
    
    assert len(blocks1) == len(blocks2), "Block count mismatch!"
    
    for i, (b1, b2) in enumerate(zip(blocks1, blocks2)):
        text1 = b1['children'][0]['text'] if b1.get('children') else ""
        text2 = b2['children'][0]['text'] if b2.get('children') else ""
        assert text1 == text2, f"Text mismatch at block {i}!"
        assert b1['type'] == b2['type'], f"Type mismatch at block {i}!"
    
    print("   ✅ All data verified - perfect match!")
    
    return model1, model2


def main():
    """Run all demos"""
    print("🚀 LoroModel Demo Suite")
    print("=" * 50)
    print("Showcasing comprehensive usage of the LoroModel class")
    print("=" * 50)
    
    try:
        # Run all demos
        blog_model = demo_blog_post()
        collab_model = demo_collaborative_editing()
        ops_model = demo_document_operations()
        export_model1, export_model2 = demo_data_exchange()
        
        print("\n🎉 All Demos Completed Successfully!")
        print("=" * 50)
        print("\nSummary of created models:")
        print(f"  📝 Blog Post: {len(blog_model.get_blocks())} blocks")
        print(f"  🤝 Collaborative Notes: {len(collab_model.get_blocks())} blocks")
        print(f"  🔧 Operations Demo: {len(ops_model.get_blocks())} blocks")
        print(f"  💾 Export/Import Demo: {len(export_model1.get_blocks())} blocks")
        
        total_blocks = sum([
            len(blog_model.get_blocks()),
            len(collab_model.get_blocks()),
            len(ops_model.get_blocks()),
            len(export_model1.get_blocks())
        ])
        print(f"\nTotal blocks created across all demos: {total_blocks}")
        
        print("\n✨ Key Features Demonstrated:")
        print("  • Document structure creation")
        print("  • Rich text formatting")
        print("  • Real-time collaborative editing simulation")
        print("  • CRUD operations (Create, Read, Update, Delete)")
        print("  • JSON serialization and data exchange")
        print("  • Loro document integration")
        
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

import asyncio
import sys
import os

# Add the current directory to sys.path to import lexical_loro
sys.path.insert(0, os.path.abspath('.'))

from lexical_loro.model.lexical_model import LexicalDocumentManager

async def test_document_direct():
    """Test document content directly via the model"""
    try:
        print("🔧 Creating document manager...")
        
        # Create a document manager
        doc_manager = LexicalDocumentManager(
            client_mode=True,
            websocket_base_url="ws://127.0.0.1:8081"
        )
        
        await doc_manager.start_client_mode()
        
        # Try to get document content
        doc_id = "example-1"
        print(f"🔍 Checking if document '{doc_id}' exists...")
        
        if doc_id in doc_manager.models:
            model = doc_manager.models[doc_id]
            print(f"✅ Document '{doc_id}' found!")
            
            # Get the Lexical state
            lexical_state = model.get_lexical_state()
            print(f"📄 Current Lexical state:")
            print("=" * 80)
            import json
            print(json.dumps(lexical_state, indent=2))
            print("=" * 80)
            
            # Count paragraphs
            if lexical_state and "root" in lexical_state:
                root = lexical_state["root"]
                if "children" in root:
                    children = root["children"]
                    paragraphs = [child for child in children if child.get("type") == "paragraph"]
                    print(f"📊 Found {len(paragraphs)} paragraphs")
                    
                    for i, para in enumerate(paragraphs):
                        if "children" in para and para["children"]:
                            text_content = ""
                            for text_node in para["children"]:
                                if text_node.get("type") == "text":
                                    text_content += text_node.get("text", "")
                            print(f"  {i}: {text_content[:50]}...")
                        else:
                            print(f"  {i}: [empty paragraph]")
        else:
            print(f"❌ Document '{doc_id}' not found")
            print(f"Available documents: {list(doc_manager.models.keys())}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_document_direct())

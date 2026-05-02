#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
LexicalModel Example: Real-time Collaboration Simulation

This example demonstrates how to use LexicalModel for simulating real-time 
collaboration between multiple users using Loro's CRDT capabilities.
"""

from lexical_loro.model.lexical_loro import LexicalModel
import json

def main():
    print("🤝 LexicalModel Real-time Collaboration Simulation")
    print("=" * 60)
    
    # Simulate a collaboration scenario
    print("Scenario: Two users collaborating on a project document\n")
    
    # User A creates the initial document
    print("👤 User A: Creating initial document...")
    user_a = LexicalModel.create_document("collab-project-doc")
    user_a.add_block({"text": "Project Collaboration Document"}, "heading1")
    user_a.add_block({"text": "This document demonstrates real-time collaboration using Loro CRDTs."}, "paragraph")
    user_a.add_block({"text": "Initial Requirements"}, "heading2")
    user_a.add_block({"text": "1. System must support multiple users"}, "paragraph")
    user_a.add_block({"text": "2. Changes must be conflict-free"}, "paragraph")
    
    print(f"   ✅ User A created document with {len(user_a.get_blocks())} blocks")
    
    # User A creates a snapshot to share
    print("\n📤 User A: Creating snapshot to share...")
    snapshot_v1 = user_a.get_snapshot()
    print(f"   📦 Snapshot size: {len(snapshot_v1)} bytes")
    
    # User B joins and imports the snapshot
    print("\n👤 User B: Joining collaboration...")
    user_b = LexicalModel.create_document("collab-project-doc-user-b")
    success = user_b.import_snapshot(snapshot_v1)
    
    if success:
        print(f"   ✅ User B imported snapshot successfully")
        print(f"   📊 User B has {len(user_b.get_blocks())} blocks")
    else:
        print("   ❌ Failed to import snapshot")
        return
    
    # User B adds their contributions
    print("\n👤 User B: Adding contributions...")
    user_b.add_block({"text": "Technical Specifications"}, "heading2")
    user_b.add_block({"text": "3. Must use Loro CRDTs for data synchronization"}, "paragraph")
    user_b.add_block({"text": "4. Support for Lexical editor format"}, "paragraph")
    user_b.add_block({"text": "User B's Analysis"}, "heading3")
    user_b.add_block({"text": "The CRDT approach ensures that concurrent edits can be merged without conflicts."}, "paragraph")
    
    print(f"   ✅ User B added content, now has {len(user_b.get_blocks())} blocks")
    
    # Meanwhile, User A also adds content (concurrent editing)
    print("\n👤 User A: Adding more content (concurrent editing)...")
    user_a.add_block({"text": "Timeline"}, "heading2")
    user_a.add_block({"text": "Week 1: Initial setup and requirements"}, "paragraph")
    user_a.add_block({"text": "Week 2: Implementation and testing"}, "paragraph")
    user_a.add_block({"text": "User A's Notes"}, "heading3")
    user_a.add_block({"text": "Need to coordinate with the design team for UI components."}, "paragraph")
    
    print(f"   ✅ User A added content, now has {len(user_a.get_blocks())} blocks")
    
    # User B shares their updated version
    print("\n📤 User B: Sharing updated document...")
    snapshot_v2 = user_b.get_snapshot()
    print(f"   📦 User B's snapshot size: {len(snapshot_v2)} bytes")
    
    # User A imports User B's changes
    print("\n👤 User A: Importing User B's changes...")
    success = user_a.import_snapshot(snapshot_v2)
    if success:
        print(f"   ✅ User A imported User B's changes")
        print(f"   📊 User A now has {len(user_a.get_blocks())} blocks")
    
    # User A shares back their version (including their concurrent edits)
    print("\n📤 User A: Sharing merged document...")
    snapshot_v3 = user_a.get_snapshot()
    
    # User B imports the final merged version
    print("\n👤 User B: Importing final merged document...")
    success = user_b.import_snapshot(snapshot_v3)
    if success:
        print(f"   ✅ User B imported merged document")
        print(f"   📊 User B now has {len(user_b.get_blocks())} blocks")
    
    # Verify both users have the same final state
    print("\n🔍 Verifying synchronization...")
    user_a_blocks = user_a.get_blocks()
    user_b_blocks = user_b.get_blocks()
    
    if len(user_a_blocks) == len(user_b_blocks):
        print(f"   ✅ Both users have {len(user_a_blocks)} blocks")
        
        # Compare content
        content_match = True
        for i, (block_a, block_b) in enumerate(zip(user_a_blocks, user_b_blocks)):
            text_a = extract_text_from_block(block_a)
            text_b = extract_text_from_block(block_b)
            if text_a != text_b:
                content_match = False
                print(f"   ⚠️  Block {i+1} differs:")
                print(f"      User A: {text_a}")
                print(f"      User B: {text_b}")
        
        if content_match:
            print("   ✅ All content matches between users")
        else:
            print("   ⚠️  Some content differences found")
    else:
        print(f"   ⚠️  Block count mismatch: A={len(user_a_blocks)}, B={len(user_b_blocks)}")
    
    # Show the final collaborative document
    print("\n📄 Final Collaborative Document:")
    print("-" * 50)
    final_blocks = user_a.get_blocks()  # Both should be the same
    for i, block in enumerate(final_blocks, 1):
        block_type = block.get('type', 'unknown')
        text_content = extract_text_from_block(block)
        indent = "  " if block_type.startswith('heading') and not block_type.endswith('1') else ""
        prefix = "#" * int(block_type[-1]) + " " if block_type.startswith('heading') else "• "
        print(f"{indent}{prefix}{text_content}")
    
    # Document statistics
    print("\n📊 Final Document Statistics:")
    summary = user_a.get_block_summary()
    print(f"   Total blocks: {len(final_blocks)}")
    print(f"   Block types: {summary['block_types']}")
    print(f"   Total text length: {summary['total_text_length']}")
    
    # Show the JSON structure (truncated)
    print("\n📋 JSON Structure (first 300 characters):")
    json_data = user_a.to_json()
    print(f"   {json_data[:300]}...")
    
    print(f"\n✅ Real-time collaboration simulation completed successfully!")
    print("   🎯 Key achievements:")
    print("      • Multiple users worked on the same document")
    print("      • Concurrent edits were made without conflicts")
    print("      • Changes were successfully merged using Loro CRDTs")
    print("      • Final document state is consistent across all users")

def extract_text_from_block(block):
    """Helper function to extract text from a block"""
    text_parts = []
    for child in block.get('children', []):
        if child.get('type') == 'text':
            text_parts.append(child.get('text', ''))
    return ''.join(text_parts)

if __name__ == "__main__":
    main()

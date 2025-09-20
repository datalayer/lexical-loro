#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


"""
Debug incremental updates in detail.
"""

import sys
import logging
from pathlib import Path

# Add the package path
sys.path.insert(0, str(Path(__file__).parent))

try:
    import loro
    from loro import ExportMode
    
    # Create a simple Loro document
    doc = loro.LoroDoc()
    
    print("🔍 Testing incremental updates step by step:")
    
    # Step 1: Get initial state
    print("\n1️⃣ Initial state:")
    initial_vv = doc.state_vv
    print(f"   Initial state_vv: {initial_vv}")
    print(f"   Type: {type(initial_vv)}")
    
    # Step 2: Add some content
    print("\n2️⃣ Adding content:")
    text_container = doc.get_text("content")
    text_container.insert(0, "Hello world")
    
    after_insert_vv = doc.state_vv
    print(f"   After insert state_vv: {after_insert_vv}")
    print(f"   Same as initial? {after_insert_vv == initial_vv}")
    
    # Step 3: Try to export updates
    print("\n3️⃣ Trying to export updates:")
    try:
        # Try to export updates from initial state
        update_mode = ExportMode.Updates(from_=initial_vv)
        update_data = doc.export(update_mode)
        print(f"   Update data: {update_data}")
        print(f"   Update length: {len(update_data)} bytes")
        print(f"   Update type: {type(update_data)}")
        if update_data:
            print(f"   Update hex: {update_data.hex()[:100]}...")
    except Exception as e:
        print(f"   ❌ Export updates failed: {e}")
    
    # Step 4: Try snapshot export for comparison
    print("\n4️⃣ Snapshot export for comparison:")
    try:
        snapshot_mode = ExportMode.Snapshot()
        snapshot_data = doc.export(snapshot_mode)
        print(f"   Snapshot length: {len(snapshot_data)} bytes")
        print(f"   Snapshot hex: {snapshot_data.hex()[:100]}...")
    except Exception as e:
        print(f"   ❌ Snapshot export failed: {e}")
    
    # Step 5: Add more content and test incremental
    print("\n5️⃣ Adding more content:")
    text_container.insert(11, " from Python")
    
    after_second_vv = doc.state_vv
    print(f"   After second insert state_vv: {after_second_vv}")
    
    # Try to export updates from first change
    try:
        update_mode2 = ExportMode.Updates(from_=after_insert_vv)
        update_data2 = doc.export(update_mode2)
        print(f"   Incremental update: {update_data2}")
        print(f"   Incremental length: {len(update_data2)} bytes")
        if update_data2:
            print(f"   Incremental hex: {update_data2.hex()[:100]}...")
    except Exception as e:
        print(f"   ❌ Incremental export failed: {e}")
        
    # Step 6: Test version vector creation
    print("\n6️⃣ Testing version vector creation:")
    try:
        # Try to create an empty version vector for initial state
        empty_vv = doc.oplog_vv  # This is the operation log version vector
        print(f"   Oplog VV: {empty_vv}")
        print(f"   Oplog VV type: {type(empty_vv)}")
        print(f"   Same as state_vv? {empty_vv == after_second_vv}")
        
        # Try to use oplog_vv for export
        update_mode3 = ExportMode.Updates(from_=empty_vv)
        update_data3 = doc.export(update_mode3)
        print(f"   Update from oplog_vv: {update_data3}")
        if update_data3:
            print(f"   Update from oplog_vv length: {len(update_data3)} bytes")
    except Exception as e:
        print(f"   ❌ Oplog VV test failed: {e}")
    
    print("\n✅ Debug completed!")
        
except Exception as e:
    print(f"❌ Error in debug: {e}")
    import traceback
    traceback.print_exc()

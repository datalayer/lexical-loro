#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

from loro import LoroDoc

# Check available methods
print("=== Available methods ===")
doc_test = LoroDoc()
methods = [m for m in dir(doc_test) if not m.startswith('_')]
print(f'LoroDoc methods: {methods}')

# Try different API calls
try:
    # Test 1: Empty document
    print("\n=== Test 1: Empty document ===")
    doc1 = LoroDoc()
    text_container1 = doc1.get_text('content')
    doc1.commit()
    
    # Try different export methods
    try:
        snapshot1 = doc1.export_snapshot()
        print(f'export_snapshot() works: {len(snapshot1)} bytes')
    except AttributeError:
        try:
            snapshot1 = doc1.export()
            print(f'export() works: {len(snapshot1)} bytes')
        except AttributeError:
            try:
                snapshot1 = doc1.get_snapshot()
                print(f'get_snapshot() works: {len(snapshot1)} bytes')
            except AttributeError:
                print('Could not find snapshot export method')
                snapshot1 = b''
    
    if len(snapshot1) > 0:
        print(f'Snapshot bytes: {list(snapshot1) if len(snapshot1) < 20 else f"First 20 bytes: {list(snapshot1[:20])}..."}')
    else:
        print('Empty snapshot')

except Exception as e:
    print(f'Error: {e}')
    import traceback
    traceback.print_exc()

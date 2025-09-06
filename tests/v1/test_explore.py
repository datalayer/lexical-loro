#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import loro

print("=== Exploring loro module ===")
print("Available attributes:", [attr for attr in dir(loro) if not attr.startswith('_')])

try:
    from loro import ExportMode
    print("ExportMode available:", True)
    print("ExportMode attributes:", [attr for attr in dir(ExportMode) if not attr.startswith('_')])
except ImportError as e:
    print("ExportMode not available:", e)

try:
    from loro import ImportMode
    print("ImportMode available:", True)
except ImportError as e:
    print("ImportMode not available:", e)

# Try to see if there are other export-related classes
for attr_name in dir(loro):
    if 'export' in attr_name.lower() or 'mode' in attr_name.lower():
        print(f"Found: {attr_name}")

# Test creating a document and seeing what methods work
print("\n=== Testing LoroDoc methods ===")
doc = loro.LoroDoc()
print("LoroDoc methods with 'export':", [m for m in dir(doc) if 'export' in m.lower()])

# Try calling export with different argument types
print("\n=== Testing export with different arguments ===")
text_container = doc.get_text('content')
text_container.insert(0, "Test content")
doc.commit()

# Test various ways to call export
test_args = [
    None,
    0, 1, 2, 3,
    'snapshot', 'binary', 'json', 'update'
]

for arg in test_args:
    try:
        if arg is None:
            result = doc.export()
        else:
            result = doc.export(arg)
        print(f"   ✅ export({arg}) works: {type(result)}, size: {len(result) if hasattr(result, '__len__') else 'unknown'}")
        if hasattr(result, '__len__') and len(result) < 100:
            print(f"      Content preview: {result}")
        break  # Stop on first success
    except Exception as e:
        print(f"   ❌ export({arg}) failed: {e}")

#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

from loro import LoroDoc, ExportMode

print("=== Testing ExportMode usage ===")

doc = LoroDoc()
text = doc.get_text('content')
text.insert(0, "Test content")
doc.commit()

print("ExportMode attributes:")
for attr in dir(ExportMode):
    if not attr.startswith('_'):
        value = getattr(ExportMode, attr)
        print(f"  {attr}: {value} (type: {type(value)})")

print("\nTesting different ways to use ExportMode:")

# Method 1: Direct attribute
try:
    result = doc.export(ExportMode.Snapshot)
    print(f"✅ doc.export(ExportMode.Snapshot) works: {len(result)} bytes")
except Exception as e:
    print(f"❌ doc.export(ExportMode.Snapshot) failed: {e}")

# Method 2: Instantiate the enum
try:
    mode = ExportMode.Snapshot()
    result = doc.export(mode)
    print(f"✅ doc.export(ExportMode.Snapshot()) works: {len(result)} bytes")
except Exception as e:
    print(f"❌ doc.export(ExportMode.Snapshot()) failed: {e}")

# Method 3: Try other modes
for mode_name in ['Snapshot', 'ShallowSnapshot', 'StateOnly', 'Updates']:
    if hasattr(ExportMode, mode_name):
        try:
            mode = getattr(ExportMode, mode_name)
            result = doc.export(mode)
            print(f"✅ doc.export(ExportMode.{mode_name}) works: {len(result)} bytes")
            break
        except Exception as e:
            print(f"❌ doc.export(ExportMode.{mode_name}) failed: {e}")

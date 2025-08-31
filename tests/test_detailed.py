#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

from loro import LoroDoc

print("=== Testing Loro Python API ===")

# Test 1: Create document and add content
print("\n1. Creating document and adding content...")
doc = LoroDoc()
text_container = doc.get_text('content')
text_container.insert(0, "Hello World!")
doc.commit()
print(f"   Content: '{text_container.to_string()}'")

# Test 2: Try different export methods
print("\n2. Testing export methods...")
export_result = None
method_used = None

try:
    export_result = doc.export('snapshot')
    method_used = "export('snapshot')"
    print(f"   ✅ {method_used} works")
except Exception as e:
    print(f"   ❌ export('snapshot') failed: {e}")
    
    try:
        export_result = doc.export('binary')
        method_used = "export('binary')"
        print(f"   ✅ {method_used} works")
    except Exception as e:
        print(f"   ❌ export('binary') failed: {e}")
        
        try:
            export_result = doc.export()
            method_used = "export()"
            print(f"   ✅ {method_used} works")
        except Exception as e:
            print(f"   ❌ export() failed: {e}")

if export_result:
    print(f"   Export size: {len(export_result)} bytes")
    if len(export_result) < 50:
        print(f"   Export content: {list(export_result)}")
else:
    print("   ❌ No export method worked")

# Test 3: Import to new document
if export_result:
    print("\n3. Testing import to new document...")
    doc2 = LoroDoc()
    doc2.import_(export_result)
    text_container2 = doc2.get_text('content')
    imported_content = text_container2.to_string()
    print(f"   Imported content: '{imported_content}'")
    print(f"   ✅ Content matches: {imported_content == 'Hello World!'}")
else:
    print("\n3. Skipping import test (no export data)")

# Test 4: Simulate the server scenario
print("\n4. Simulating server initialization scenario...")
server_doc = LoroDoc()
server_text = server_doc.get_text('content')
server_doc.commit()
print(f"   Empty server doc content: '{server_text.to_string()}'")

# Export empty document
try:
    empty_export = server_doc.export('snapshot')
    print(f"   Empty doc export size: {len(empty_export)} bytes")
except:
    try:
        empty_export = server_doc.export()
        print(f"   Empty doc export size: {len(empty_export)} bytes")
    except Exception as e:
        print(f"   Empty doc export failed: {e}")
        empty_export = None

# Add content to server doc
server_text.insert(0, "Server content")
server_doc.commit()
print(f"   Server doc after adding content: '{server_text.to_string()}'")

# Export with content
try:
    content_export = server_doc.export('snapshot')
    print(f"   Doc with content export size: {len(content_export)} bytes")
except:
    try:
        content_export = server_doc.export()
        print(f"   Doc with content export size: {len(content_export)} bytes")
    except Exception as e:
        print(f"   Doc with content export failed: {e}")
        content_export = None

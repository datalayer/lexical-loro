#!/usr/bin/env python3

"""
Investigate available methods on Loro document objects.
"""

import sys
import logging
from pathlib import Path

# Add the package path
sys.path.insert(0, str(Path(__file__).parent))

try:
    import loro
    
    # Create a simple Loro document
    doc = loro.LoroDoc()
    
    print("🔍 Available methods on LoroDoc:")
    methods = [method for method in dir(doc) if not method.startswith('_')]
    for method in sorted(methods):
        print(f"  - {method}")
    
    print("\n🔍 Checking specific methods:")
    
    # Check for version vector methods
    version_methods = ['version_vector', 'vv', 'get_version', 'oplog_vv', 'frontiers']
    for method in version_methods:
        if hasattr(doc, method):
            print(f"  ✅ {method} - Available")
            try:
                result = getattr(doc, method)()
                print(f"    Result type: {type(result)}")
                print(f"    Result: {result}")
            except Exception as e:
                print(f"    Error calling: {e}")
        else:
            print(f"  ❌ {method} - Not available")
    
    # Check for export methods
    export_methods = ['export_updates', 'export_from', 'export_since', 'get_changes']
    for method in export_methods:
        if hasattr(doc, method):
            print(f"  ✅ {method} - Available")
        else:
            print(f"  ❌ {method} - Not available")
    
    # Check ExportMode
    print("\n🔍 Checking ExportMode:")
    try:
        from loro import ExportMode
        print(f"  ✅ ExportMode available")
        
        # Check what export modes are available
        export_modes = [attr for attr in dir(ExportMode) if not attr.startswith('_')]
        print(f"  Available modes: {export_modes}")
        
        # Try different export modes
        for mode_name in export_modes:
            if hasattr(ExportMode, mode_name):
                try:
                    mode = getattr(ExportMode, mode_name)
                    if callable(mode):
                        mode_instance = mode()
                        print(f"    {mode_name}(): {type(mode_instance)}")
                    else:
                        print(f"    {mode_name}: {mode}")
                except Exception as e:
                    print(f"    {mode_name} error: {e}")
                    
    except ImportError as e:
        print(f"  ❌ ExportMode not available: {e}")
    
    # Try to add some content and see what happens
    print("\n🔍 Testing with content:")
    text_container = doc.get_text("content")
    text_container.insert(0, "Hello world")
    
    # Check version after change
    for method in version_methods:
        if hasattr(doc, method):
            try:
                result = getattr(doc, method)()
                print(f"  After change - {method}: {result}")
            except Exception as e:
                print(f"  After change - {method} error: {e}")
                
except Exception as e:
    print(f"❌ Error investigating Loro: {e}")
    import traceback
    traceback.print_exc()

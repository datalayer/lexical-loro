#!/usr/bin/env python3
"""
Simple integration test to validate the text content fix.
"""

import asyncio
import aiohttp
import time
import threading
from lexical_loro.mcp import server
import logging

# Set up detailed logging
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)

def start_server():
    server.main()

async def comprehensive_test():
    try:
        async with aiohttp.ClientSession() as session:
            base_url = 'http://localhost:3001'
            doc_id = 'comprehensive-test'
            
            # Test texts
            texts = [
                'First paragraph with important content',
                'Second paragraph with different text', 
                'Third paragraph to verify multiple appends work'
            ]
            
            print(f'\n📝 Adding {len(texts)} paragraphs...')
            
            # Add multiple paragraphs
            for i, text in enumerate(texts):
                async with session.post(base_url, json={
                    'jsonrpc': '2.0',
                    'id': i + 1,
                    'method': 'append_paragraph',
                    'params': {'doc_id': doc_id, 'text': text}
                }) as response:
                    result = await response.json()
                    success = result.get('result', {}).get('success', False)
                    print(f'   ✅ Paragraph {i+1}: {success} - "{text[:30]}..."')
            
            print(f'\n📋 Retrieving final document structure...')
            
            # Get final document
            async with session.post(base_url, json={
                'jsonrpc': '2.0',
                'id': 99,
                'method': 'get_document',
                'params': {'doc_id': doc_id}
            }) as response:
                result = await response.json()
                
                if 'result' in result:
                    lexical_json = result['result']['lexical_json']
                    children = lexical_json['root']['children']
                    
                    print(f'   📊 Total children: {len(children)}')
                    print(f'   📊 Expected: {len(texts) + 1} (initial + {len(texts)} added)')
                    
                    # Validate each paragraph
                    actual_texts = []
                    for i, child in enumerate(children):
                        if 'children' in child and child['children']:
                            text_node = child['children'][0]
                            text_content = text_node.get('text', '[MISSING]')
                            actual_texts.append(text_content)
                            print(f'   📄 [{i}] "{text_content}"')
                        else:
                            actual_texts.append('[EMPTY]')
                            print(f'   ❌ [{i}] [NO TEXT CONTENT]')
                    
                    # Validation
                    expected_texts = ['New Document'] + texts
                    print(f'\n🔍 VALIDATION:')
                    print(f'   Expected: {len(expected_texts)} paragraphs')
                    print(f'   Actual: {len(actual_texts)} paragraphs')
                    
                    all_valid = True
                    for i, (expected, actual) in enumerate(zip(expected_texts, actual_texts)):
                        if expected == actual:
                            print(f'   ✅ [{i}] MATCH: "{expected}"')
                        else:
                            print(f'   ❌ [{i}] MISMATCH: Expected "{expected}", Got "{actual}"')
                            all_valid = False
                    
                    if all_valid and len(expected_texts) == len(actual_texts):
                        print(f'\n🎉 SUCCESS: All text content properly stored and retrieved!')
                        return True
                    else:
                        print(f'\n💥 FAILURE: Text content validation failed')
                        return False
                else:
                    print(f'   ❌ Failed to get document')
                    return False
                    
    except Exception as e:
        print(f'❌ Error during testing: {e}')
        import traceback
        traceback.print_exc()
        return False

def main():
    print('🚀 COMPREHENSIVE INTEGRATION TEST - Testing text content storage fix...')

    # Start MCP server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Wait for server to start
    time.sleep(3)

    # Run the comprehensive test
    success = asyncio.run(comprehensive_test())
    print(f'\n🏁 FINAL RESULT: {"PASS" if success else "FAIL"}')
    return success

if __name__ == "__main__":
    main()
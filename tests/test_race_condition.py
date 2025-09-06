#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test race condition fix for concurrent operations
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from lexical_loro.model.lexical_model import LexicalModel

async def test_concurrent_append_operations():
    """Test that multiple concurrent append operations don't cause race conditions"""
    print("🧪 Testing concurrent append operations with async locks...")
    
    # Create a model
    model = LexicalModel.create_document("test-race")
    print(f"✅ Created model with {len(model.lexical_data['root']['children'])} initial blocks")
    
    # Function to append a paragraph
    async def append_paragraph_task(task_id, text):
        try:
            print(f"🚀 Task {task_id}: Starting append operation...")
            result = await model._handle_append_paragraph({"message": text}, f"client-{task_id}")
            print(f"✅ Task {task_id}: Completed successfully - {result.get('success', False)}")
            return result
        except Exception as e:
            print(f"❌ Task {task_id}: Failed with error: {e}")
            return {"success": False, "error": str(e), "task_id": task_id}
    
    # Create multiple concurrent tasks
    tasks = []
    num_tasks = 5
    for i in range(num_tasks):
        task = append_paragraph_task(i, f"Concurrent paragraph {i}")
        tasks.append(task)
    
    print(f"🔄 Running {num_tasks} concurrent append operations...")
    
    # Run all tasks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Check results
    successful_tasks = 0
    failed_tasks = 0
    
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            print(f"❌ Task {i}: Exception - {result}")
            failed_tasks += 1
        elif result.get("success", False):
            print(f"✅ Task {i}: Success")
            successful_tasks += 1
        else:
            print(f"⚠️ Task {i}: Failed - {result.get('error', 'Unknown error')}")
            failed_tasks += 1
    
    # Check final state
    final_blocks = len(model.lexical_data['root']['children'])
    expected_blocks = num_tasks  # Should have added one block per task
    
    print(f"\n📊 Results Summary:")
    print(f"   Successful tasks: {successful_tasks}")
    print(f"   Failed tasks: {failed_tasks}")
    print(f"   Final blocks: {final_blocks}")
    print(f"   Expected blocks: {expected_blocks}")
    
    # Verify all operations succeeded
    success = (successful_tasks == num_tasks and failed_tasks == 0 and final_blocks == expected_blocks)
    
    if success:
        print(f"✅ RACE CONDITION TEST PASSED: All concurrent operations completed successfully!")
    else:
        print(f"❌ RACE CONDITION TEST FAILED: Some operations failed or block count mismatch")
    
    return success

async def test_rapid_sequential_operations():
    """Test rapid sequential operations to stress test the lock"""
    print("\n🧪 Testing rapid sequential operations...")
    
    model = LexicalModel.create_document("test-sequential")
    
    num_operations = 10
    for i in range(num_operations):
        result = await model._handle_append_paragraph({"message": f"Sequential paragraph {i}"}, f"client-seq-{i}")
        if not result.get("success", False):
            print(f"❌ Sequential operation {i} failed: {result.get('error', 'Unknown error')}")
            return False
        print(f"✅ Sequential operation {i} completed")
    
    final_blocks = len(model.lexical_data['root']['children'])
    if final_blocks == num_operations:
        print(f"✅ SEQUENTIAL TEST PASSED: All {num_operations} operations completed successfully!")
        return True
    else:
        print(f"❌ SEQUENTIAL TEST FAILED: Expected {num_operations} blocks, got {final_blocks}")
        return False

async def main():
    """Main test function"""
    print("🚀 Starting race condition tests with async locks...")
    print("=" * 60)
    
    # Test concurrent operations
    concurrent_success = await test_concurrent_append_operations()
    
    # Test sequential operations
    sequential_success = await test_rapid_sequential_operations()
    
    overall_success = concurrent_success and sequential_success
    
    print("\n" + "=" * 60)
    print(f"📋 Final Results:")
    print(f"   Concurrent operations: {'✅ PASS' if concurrent_success else '❌ FAIL'}")
    print(f"   Sequential operations: {'✅ PASS' if sequential_success else '❌ FAIL'}")
    print(f"   Overall test: {'✅ PASS' if overall_success else '❌ FAIL'}")
    
    if overall_success:
        print(f"\n🎉 RACE CONDITION TESTS PASSED!")
        print(f"🔒 Async locks are working correctly to prevent race conditions")
    else:
        print(f"\n❌ RACE CONDITION TESTS FAILED!")
        print(f"⚠️ Race condition still exists or other issues detected")
    
    return overall_success

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)

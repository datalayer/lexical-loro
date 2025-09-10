#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test suite for container logic consistency.

This module tests that the simplified container logic (always using "content")
works correctly and consistently across all operations, while maintaining
proper document isolation based on doc_id.
"""

import pytest
import json
import loro
from lexical_loro.model.lexical_model import LexicalModel


class TestContainerLogicConsistency:
    """Test container logic consistency after simplification"""

    def test_all_models_use_content_container(self):
        """Test that all models consistently use 'content' as internal container"""
        doc_ids = ['test-1', 'test-2', 'test-3', 'special-chars-!@#', 'numbers-123']
        
        for doc_id in doc_ids:
            doc = LexicalModel.create_document(doc_id, event_callback=None)
            doc.add_block({'text': f'Content for {doc_id}'}, 'paragraph')
            
            # Check internal document state
            doc_state = doc.text_doc.get_deep_value()
            assert isinstance(doc_state, dict)
            assert 'content' in doc_state
            
            # Should not have any other container names
            container_keys = [k for k in doc_state.keys() if isinstance(doc_state[k], str) and len(doc_state[k]) > 100]
            # Only 'content' should have substantial text content
            assert len(container_keys) <= 1  # At most just 'content'
            if container_keys:
                assert 'content' in container_keys

    def test_sync_operations_use_content_container(self):
        """Test that all sync operations consistently use 'content' container"""
        doc = LexicalModel.create_document('sync-test', event_callback=None)
        
        # Add initial content
        doc.add_block({'text': 'Initial content'}, 'paragraph')
        
        # Test _get_current_text_content method
        content = doc._get_current_text_content()
        assert content != ""
        assert 'Initial content' in content
        
        # Test _sync_from_loro method
        original_blocks = len(doc.get_blocks())
        doc._sync_from_loro()
        synced_blocks = len(doc.get_blocks())
        assert synced_blocks == original_blocks  # Should remain the same
        
        # Add more content to test persistence
        doc.add_block({'text': 'Additional content'}, 'heading1')
        
        # Content should be updated
        updated_content = doc._get_current_text_content()
        assert len(updated_content) > len(content)
        assert 'Additional content' in updated_content

    def test_no_special_case_container_names(self):
        """Test that no special case container names are used anymore"""
        # Create models with doc_ids that were previously special cases
        special_doc_ids = ['content', 'lexical-shared-doc', 'shared-text']
        
        models = {}
        for doc_id in special_doc_ids:
            models[doc_id] = LexicalModel.create_document(doc_id, event_callback=None)
            models[doc_id].add_block({'text': f'Content for {doc_id}'}, 'paragraph')
        
        # All should use 'content' internally regardless of doc_id
        for doc_id, doc in models.items():
            doc_state = doc.text_doc.get_deep_value()
            assert 'content' in doc_state
            
            # Verify content is different for each document
            content = doc_state['content']
            assert f'Content for {doc_id}' in content
            
            # Verify no cross-contamination
            for other_doc_id in special_doc_ids:
                if other_doc_id != doc_id:
                    assert f'Content for {other_doc_id}' not in content

    def test_container_id_vs_internal_container_separation(self):
        """Test that container_id (doc_id) is separate from internal container name"""
        doc = LexicalModel.create_document('external-id-123', event_callback=None)
        
        # container_id should be the doc_id
        assert doc.container_id == 'external-id-123'
        
        # But internal storage should use 'content'
        doc.add_block({'text': 'Test content'}, 'paragraph')
        doc_state = doc.text_doc.get_deep_value()
        
        # Should have 'content' key with actual content
        assert 'content' in doc_state
        content_data = doc_state['content']
        assert isinstance(content_data, str)
        assert len(content_data) > 0
        
        # The content should be stored under 'content' and contain our text
        assert 'Test content' in content_data

    def test_broadcast_data_uses_correct_doc_id(self):
        """Test that broadcast data uses the correct doc_id even with simplified containers"""
        events_captured = []
        
        def capture_event(event_type, event_data):
            events_captured.append((event_type, event_data))
        
        doc = LexicalModel.create_document('broadcast-test-doc', event_callback=capture_event)
        doc.add_block({'text': 'Test content'}, 'paragraph')
        
        # Should have captured broadcast events
        assert len(events_captured) > 0
        
        # Find broadcast_needed event
        broadcast_events = [event for event in events_captured if event[0] == 'broadcast_needed']
        assert len(broadcast_events) > 0
        
        # Check that doc_id is correctly set in broadcast data
        for event_type, event_data in broadcast_events:
            if 'broadcast_data' in event_data:
                broadcast_data = event_data['broadcast_data']
                assert broadcast_data.get('docId') == 'broadcast-test-doc'

    def test_serialization_consistency(self):
        """Test that serialization format is consistent with simplified container logic"""
        doc = LexicalModel.create_document('serialization-test', event_callback=None)
        
        # Add various types of content
        doc.add_block({'text': 'Paragraph content'}, 'paragraph')
        doc.add_block({'text': 'Heading content'}, 'heading1')
        doc.add_block({'text': 'Another paragraph'}, 'paragraph')
        
        # Get serialized content
        json_content = doc.export_as_json()
        parsed_content = json.loads(json_content)
        
        # Should have proper lexical structure
        assert 'root' in parsed_content
        assert 'children' in parsed_content['root']
        assert len(parsed_content['root']['children']) == 3
        
        # Verify content types
        children = parsed_content['root']['children']
        assert children[0]['type'] == 'paragraph'
        assert children[1]['type'] == 'heading1'
        assert children[2]['type'] == 'paragraph'
        
        # Test import back
        new_doc = LexicalModel.create_document('import-test', event_callback=None)
        new_doc.import_from_json(json_content)
        
        # Should have same content
        new_blocks = new_doc.get_blocks()
        assert len(new_blocks) == 3
        assert new_blocks[0]['type'] == 'paragraph'
        assert new_blocks[1]['type'] == 'heading1'
        assert new_blocks[2]['type'] == 'paragraph'

    def test_loro_snapshot_operations(self):
        """Test that Loro snapshot operations work correctly with simplified container logic"""
        # Create source document
        source_doc = LexicalModel.create_document('source-doc', event_callback=None)
        source_doc.add_block({'text': 'Source content 1'}, 'paragraph')
        source_doc.add_block({'text': 'Source content 2'}, 'heading1')
        
        # Get snapshot
        snapshot = source_doc.get_snapshot()
        assert snapshot is not None
        assert len(snapshot) > 0
        
        # Create target document and import snapshot
        target_doc = LexicalModel.create_document('target-doc', event_callback=None)
        success = target_doc.import_snapshot(snapshot)
        assert success
        
        # Verify content was transferred
        source_blocks = source_doc.get_blocks()
        target_blocks = target_doc.get_blocks()
        
        assert len(source_blocks) == len(target_blocks)
        
        # Compare block content (should be the same)
        for i, (source_block, target_block) in enumerate(zip(source_blocks, target_blocks)):
            assert source_block['type'] == target_block['type']
            
            source_text = ''.join([child.get('text', '') for child in source_block.get('children', [])])
            target_text = ''.join([child.get('text', '') for child in target_block.get('children', [])])
            assert source_text == target_text

    def test_update_operations_consistency(self):
        """Test that update operations work consistently with simplified container logic"""
        # Create two models
        doc1 = LexicalModel.create_document('update-doc-1', event_callback=None)
        doc2 = LexicalModel.create_document('update-doc-2', event_callback=None)
        
        # Add content to doc1
        doc1.add_block({'text': 'Update test content'}, 'paragraph')
        
        # Export update from doc1
        update_data = doc1.export_update()
        
        # Apply update to doc2
        if update_data:
            success = doc2.apply_update(update_data)
            assert success
            
            # doc2 should now have the same content as doc1
            doc1_blocks = doc1.get_blocks()
            doc2_blocks = doc2.get_blocks()
            
            assert len(doc1_blocks) == len(doc2_blocks)
            
            if len(doc1_blocks) > 0:
                doc1_text = ''.join([child.get('text', '') for child in doc1_blocks[0].get('children', [])])
                doc2_text = ''.join([child.get('text', '') for child in doc2_blocks[0].get('children', [])])
                assert doc1_text == doc2_text

    def test_container_logic_with_edge_cases(self):
        """Test container logic with edge cases and unusual doc_ids"""
        edge_cases = [
            '',  # Empty string
            'a',  # Single character
            'very-long-doc-id-with-many-hyphens-and-numbers-123456789',  # Long ID
            '中文文档',  # Non-ASCII characters
            'spaces in name',  # Spaces
            'symbols!@#$%^&*()',  # Special symbols
        ]
        
        for doc_id in edge_cases:
            if doc_id == '':
                doc_id = 'empty-fallback'  # Handle empty case
                
            doc = LexicalModel.create_document(doc_id, event_callback=None)
            doc.add_block({'text': f'Content for edge case: {doc_id}'}, 'paragraph')
            
            # Should still use 'content' container internally
            doc_state = doc.text_doc.get_deep_value()
            assert 'content' in doc_state
            
            # Should have the expected content (JSON serialized, so check differently)
            content = doc_state['content']
            assert isinstance(content, str)
            assert len(content) > 0
            
            # Parse the JSON content to check the actual text
            import json
            try:
                parsed_content = json.loads(content)
                # Extract text from the lexical structure
                if 'root' in parsed_content and 'children' in parsed_content['root']:
                    found_text = False
                    for block in parsed_content['root']['children']:
                        for child in block.get('children', []):
                            if child.get('type') == 'text' and child.get('text'):
                                if f'Content for edge case: {doc_id}' in child['text']:
                                    found_text = True
                                    break
                        if found_text:
                            break
                    assert found_text, f"Expected text not found in content for doc_id: {doc_id}"
            except json.JSONDecodeError:
                # If it's not JSON, just check if the text is in the content
                assert f'Content for edge case: {doc_id}' in content
            
            # container_id should match the doc_id
            assert doc.container_id == doc_id


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

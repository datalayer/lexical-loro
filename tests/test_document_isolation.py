#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test suite for document isolation behavior.

This module tests that multiple models with different doc_ids are properly
isolated from each other, even though they all use "content" as the internal
container name within their respective LoroDoc instances.
"""

import pytest
import loro
from lexical_loro.model.lexical_model import LexicalModel


class TestDocumentIsolation:
    """Test document isolation with multiple doc_ids"""

    def test_basic_document_isolation(self):
        """Test that models with different doc_ids are completely isolated"""
        # Create two models with different doc_ids
        doc1 = LexicalModel.create_document('doc-1', event_callback=None)
        doc2 = LexicalModel.create_document('doc-2', event_callback=None)
        
        # Verify they have different container_ids
        assert doc1.container_id == 'doc-1'
        assert doc2.container_id == 'doc-2'
        
        # Verify they have different underlying LoroDoc instances
        assert doc1.text_doc is not doc2.text_doc
        assert doc1.structured_doc is not doc2.structured_doc
        
        # Add different content to each document
        doc1.add_block({'text': 'Content for document 1'}, 'paragraph')
        doc2.add_block({'text': 'Content for document 2'}, 'heading1')
        
        # Verify isolation - each document should only see its own content
        doc1_blocks = doc1.get_blocks()
        doc2_blocks = doc2.get_blocks()
        
        assert len(doc1_blocks) == 1
        assert len(doc2_blocks) == 1
        
        # Extract text content
        doc1_text = ''.join([child.get('text', '') for child in doc1_blocks[0].get('children', [])
                            if child.get('type') == 'text'])
        doc2_text = ''.join([child.get('text', '') for child in doc2_blocks[0].get('children', [])
                            if child.get('type') == 'text'])
        
        assert doc1_text == 'Content for document 1'
        assert doc2_text == 'Content for document 2'
        
        # Verify block types are different
        assert doc1_blocks[0]['type'] == 'paragraph'
        assert doc2_blocks[0]['type'] == 'heading1'

    def test_document_content_lengths_are_different(self):
        """Test that models with different content have different serialized lengths"""
        doc1 = LexicalModel.create_document('length-test-1', event_callback=None)
        doc2 = LexicalModel.create_document('length-test-2', event_callback=None)
        
        # Add different amounts of content
        doc1.add_block({'text': 'Short'}, 'paragraph')
        
        doc2.add_block({'text': 'This is a much longer piece of content'}, 'paragraph')
        doc2.add_block({'text': 'With multiple blocks'}, 'heading1')
        doc2.add_block({'text': 'And even more content here'}, 'paragraph')
        
        # Get serialized content lengths
        doc1_content = doc1._get_current_text_content()
        doc2_content = doc2._get_current_text_content()
        
        assert len(doc1_content) < len(doc2_content)
        assert len(doc1.get_blocks()) == 1
        assert len(doc2.get_blocks()) == 3

    def test_modifications_to_one_document_dont_affect_another(self):
        """Test that modifying one document doesn't affect another"""
        doc_alpha = LexicalModel.create_document('alpha', event_callback=None)
        doc_beta = LexicalModel.create_document('beta', event_callback=None)
        
        # Initial state - both empty
        assert len(doc_alpha.get_blocks()) == 0
        assert len(doc_beta.get_blocks()) == 0
        
        # Add content to alpha only
        doc_alpha.add_block({'text': 'Alpha content'}, 'paragraph')
        
        # Verify alpha has content but beta is still empty
        assert len(doc_alpha.get_blocks()) == 1
        assert len(doc_beta.get_blocks()) == 0
        
        # Add different content to beta
        doc_beta.add_block({'text': 'Beta content'}, 'heading1')
        doc_beta.add_block({'text': 'More beta content'}, 'paragraph')
        
        # Verify final state
        assert len(doc_alpha.get_blocks()) == 1
        assert len(doc_beta.get_blocks()) == 2
        
        # Verify content hasn't cross-contaminated
        alpha_text = ''.join([child.get('text', '') for child in doc_alpha.get_blocks()[0].get('children', [])
                             if child.get('type') == 'text'])
        beta_text = ''.join([child.get('text', '') for child in doc_beta.get_blocks()[0].get('children', [])
                            if child.get('type') == 'text'])
        
        assert 'Alpha' in alpha_text
        assert 'Beta' not in alpha_text
        assert 'Beta' in beta_text
        assert 'Alpha' not in beta_text

    def test_same_doc_id_returns_same_instance(self):
        """Test that requesting the same doc_id multiple times returns the same instance"""
        # Simulate server behavior with a document store
        document_store = {}
        
        def get_or_create_document(doc_id):
            if doc_id not in document_store:
                loro_doc = loro.LoroDoc()
                model = LexicalModel.create_document(doc_id, event_callback=None, loro_doc=loro_doc)
                document_store[doc_id] = model
            return document_store[doc_id]
        
        # Request same doc_id multiple times
        doc1 = get_or_create_document('shared-doc')
        doc2 = get_or_create_document('shared-doc')
        doc3 = get_or_create_document('shared-doc')
        
        # Should all be the same instance
        assert doc1 is doc2
        assert doc2 is doc3
        assert doc1 is doc3
        
        # Add content via one reference
        doc1.add_block({'text': 'Shared content'}, 'paragraph')
        
        # All references should see the same content
        assert len(doc1.get_blocks()) == 1
        assert len(doc2.get_blocks()) == 1
        assert len(doc3.get_blocks()) == 1

    def test_many_models_isolation(self):
        """Test isolation with many models to ensure no memory leaks or cross-contamination"""
        models = {}
        
        # Create 10 models with different doc_ids
        for i in range(10):
            doc_id = f'doc-{i:03d}'
            models[doc_id] = LexicalModel.create_document(doc_id, event_callback=None)
            
            # Add unique content to each
            models[doc_id].add_block({'text': f'Content for document {i}'}, 'paragraph')
            models[doc_id].add_block({'text': f'Second block for document {i}'}, 'heading1')
        
        # Verify each document has exactly the content we expect
        for i in range(10):
            doc_id = f'doc-{i:03d}'
            doc = models[doc_id]
            
            blocks = doc.get_blocks()
            assert len(blocks) == 2
            
            # Check first block
            first_text = ''.join([child.get('text', '') for child in blocks[0].get('children', [])
                                 if child.get('type') == 'text'])
            assert first_text == f'Content for document {i}'
            assert blocks[0]['type'] == 'paragraph'
            
            # Check second block
            second_text = ''.join([child.get('text', '') for child in blocks[1].get('children', [])
                                  if child.get('type') == 'text'])
            assert second_text == f'Second block for document {i}'
            assert blocks[1]['type'] == 'heading1'
            
            # Verify container_id is correct
            assert doc.container_id == doc_id

    def test_content_container_consistency(self):
        """Test that all models consistently use 'content' as internal container name"""
        doc1 = LexicalModel.create_document('container-test-1', event_callback=None)
        doc2 = LexicalModel.create_document('container-test-2', event_callback=None)
        
        # Add content to both
        doc1.add_block({'text': 'Test content 1'}, 'paragraph')
        doc2.add_block({'text': 'Test content 2'}, 'paragraph')
        
        # Check that both use "content" container internally
        doc1_state = doc1.text_doc.get_deep_value()
        doc2_state = doc2.text_doc.get_deep_value()
        
        assert isinstance(doc1_state, dict)
        assert isinstance(doc2_state, dict)
        
        # Both should have "content" as a key
        assert 'content' in doc1_state
        assert 'content' in doc2_state
        
        # Content should be different
        assert doc1_state['content'] != doc2_state['content']
        
        # Verify content contains the text we added
        assert 'Test content 1' in doc1_state['content']
        assert 'Test content 2' in doc2_state['content']
        
        # Cross-verify isolation
        assert 'Test content 1' not in doc2_state['content']
        assert 'Test content 2' not in doc1_state['content']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

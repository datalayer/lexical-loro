#!/usr/bin/env python3
"""
Test suite for server-like document management behavior.

This module tests scenarios that simulate how a server would manage multiple
collaborative documents with different doc_ids, ensuring proper isolation
and shared access patterns.
"""

import pytest
import loro
from lexical_loro.model.lexical_model import LexicalModel


class DocumentManager:
    """Simulates server-side document management"""
    
    def __init__(self):
        self.documents = {}
        self.client_connections = {}
    
    def get_or_create_document(self, doc_id):
        """Get existing document or create new one - simulates server behavior"""
        if doc_id not in self.documents:
            loro_doc = loro.LoroDoc()
            model = LexicalModel.create_document(doc_id, event_callback=None, loro_doc=loro_doc)
            self.documents[doc_id] = model
        return self.documents[doc_id]
    
    def connect_client(self, client_id, doc_id):
        """Simulate client connecting to a document"""
        document = self.get_or_create_document(doc_id)
        self.client_connections[client_id] = {
            'doc_id': doc_id,
            'document': document
        }
        return document
    
    def disconnect_client(self, client_id):
        """Simulate client disconnecting"""
        if client_id in self.client_connections:
            del self.client_connections[client_id]
    
    def get_document_stats(self):
        """Get statistics about managed documents"""
        return {
            'total_documents': len(self.documents),
            'total_clients': len(self.client_connections),
            'document_ids': list(self.documents.keys()),
            'client_distribution': {doc_id: sum(1 for conn in self.client_connections.values() 
                                              if conn['doc_id'] == doc_id) 
                                   for doc_id in self.documents.keys()}
        }


class TestServerLikeDocumentManagement:
    """Test server-like document management scenarios"""

    def test_basic_document_manager(self):
        """Test basic document manager functionality"""
        manager = DocumentManager()
        
        # Initially no documents
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 0
        assert stats['total_clients'] == 0
        
        # Create first document
        doc1 = manager.get_or_create_document('project-alpha')
        assert doc1.container_id == 'project-alpha'
        
        # Create second document
        doc2 = manager.get_or_create_document('project-beta')
        assert doc2.container_id == 'project-beta'
        
        # Request first document again - should get same instance
        doc1_again = manager.get_or_create_document('project-alpha')
        assert doc1 is doc1_again
        
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 2
        assert 'project-alpha' in stats['document_ids']
        assert 'project-beta' in stats['document_ids']

    def test_multiple_clients_same_document(self):
        """Test multiple clients working on the same document"""
        manager = DocumentManager()
        
        # Connect multiple clients to same document
        client1_doc = manager.connect_client('client-1', 'shared-project')
        client2_doc = manager.connect_client('client-2', 'shared-project')
        client3_doc = manager.connect_client('client-3', 'shared-project')
        
        # All should get the same document instance
        assert client1_doc is client2_doc
        assert client2_doc is client3_doc
        
        # Add content from different clients
        client1_doc.add_block({'text': 'Content from client 1'}, 'paragraph')
        client2_doc.add_block({'text': 'Content from client 2'}, 'paragraph')
        client3_doc.add_block({'text': 'Content from client 3'}, 'heading1')
        
        # All clients should see all content
        blocks = client1_doc.get_blocks()
        assert len(blocks) == 3
        
        # Verify client distribution stats
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 1
        assert stats['total_clients'] == 3
        assert stats['client_distribution']['shared-project'] == 3

    def test_clients_on_different_documents(self):
        """Test clients working on different documents simultaneously"""
        manager = DocumentManager()
        
        # Connect clients to different documents
        alpha_doc = manager.connect_client('alice', 'project-alpha')
        beta_doc = manager.connect_client('bob', 'project-beta')
        gamma_doc = manager.connect_client('charlie', 'project-gamma')
        
        # Add different content to each document
        alpha_doc.add_block({'text': 'Alice working on Alpha'}, 'paragraph')
        beta_doc.add_block({'text': 'Bob working on Beta'}, 'heading1')
        gamma_doc.add_block({'text': 'Charlie working on Gamma'}, 'paragraph')
        
        # Verify isolation
        assert len(alpha_doc.get_blocks()) == 1
        assert len(beta_doc.get_blocks()) == 1
        assert len(gamma_doc.get_blocks()) == 1
        
        # Verify different content
        alpha_text = ''.join([child.get('text', '') for child in alpha_doc.get_blocks()[0].get('children', [])])
        beta_text = ''.join([child.get('text', '') for child in beta_doc.get_blocks()[0].get('children', [])])
        gamma_text = ''.join([child.get('text', '') for child in gamma_doc.get_blocks()[0].get('children', [])])
        
        assert 'Alice' in alpha_text
        assert 'Bob' in beta_text
        assert 'Charlie' in gamma_text
        
        # Verify no cross-contamination
        assert 'Bob' not in alpha_text
        assert 'Charlie' not in alpha_text
        assert 'Alice' not in beta_text
        assert 'Charlie' not in beta_text
        assert 'Alice' not in gamma_text
        assert 'Bob' not in gamma_text

    def test_client_disconnect_and_reconnect(self):
        """Test client disconnect and reconnect scenarios"""
        manager = DocumentManager()
        
        # Client connects and adds content
        doc = manager.connect_client('user-1', 'persistent-doc')
        doc.add_block({'text': 'Content before disconnect'}, 'paragraph')
        
        initial_blocks = len(doc.get_blocks())
        initial_content = doc._get_current_text_content()
        
        # Client disconnects
        manager.disconnect_client('user-1')
        
        # Document should still exist in manager
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 1
        assert stats['total_clients'] == 0
        
        # Same client reconnects
        doc_again = manager.connect_client('user-1', 'persistent-doc')
        
        # Should get the same document with preserved content
        assert len(doc_again.get_blocks()) == initial_blocks
        assert doc_again._get_current_text_content() == initial_content
        
        # Different client connects to same document
        doc_other = manager.connect_client('user-2', 'persistent-doc')
        assert doc_other is doc_again  # Same document instance

    def test_high_load_scenario(self):
        """Test managing many documents and clients simultaneously"""
        manager = DocumentManager()
        
        # Create 50 documents with 2-5 clients each
        documents_created = []
        clients_created = []
        
        for doc_num in range(50):
            doc_id = f'doc-{doc_num:03d}'
            documents_created.append(doc_id)
            
            # Connect 2-5 clients to this document
            client_count = (doc_num % 4) + 2  # 2-5 clients
            for client_num in range(client_count):
                client_id = f'client-{doc_num:03d}-{client_num}'
                clients_created.append(client_id)
                doc = manager.connect_client(client_id, doc_id)
                
                # Add some content
                doc.add_block({'text': f'Content from {client_id}'}, 'paragraph')
        
        # Verify final state
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 50
        assert stats['total_clients'] == len(clients_created)
        
        # Verify each document has expected content
        for doc_id in documents_created:
            doc = manager.get_or_create_document(doc_id)
            blocks = doc.get_blocks()
            
            # Should have as many blocks as clients that connected
            expected_clients = stats['client_distribution'][doc_id]
            assert len(blocks) == expected_clients
            
            # Each block should contain the client ID in the text
            for block in blocks:
                text = ''.join([child.get('text', '') for child in block.get('children', [])])
                assert 'client-' in text
                assert doc_id.split('-')[1] in text  # doc number should be in client name

    def test_concurrent_modifications(self):
        """Test concurrent modifications to the same document"""
        manager = DocumentManager()
        
        # Multiple clients connect to same document
        doc1 = manager.connect_client('concurrent-1', 'shared-doc')
        doc2 = manager.connect_client('concurrent-2', 'shared-doc')
        doc3 = manager.connect_client('concurrent-3', 'shared-doc')
        
        # All should be the same instance
        assert doc1 is doc2 is doc3
        
        # Simulate concurrent modifications
        doc1.add_block({'text': 'First modification'}, 'paragraph')
        doc2.add_block({'text': 'Second modification'}, 'paragraph')
        doc3.add_block({'text': 'Third modification'}, 'heading1')
        
        # All modifications should be visible
        blocks = doc1.get_blocks()
        assert len(blocks) == 3
        
        # Verify content order (should be in order of addition)
        texts = []
        for block in blocks:
            text = ''.join([child.get('text', '') for child in block.get('children', [])])
            texts.append(text)
        
        assert 'First modification' in texts[0]
        assert 'Second modification' in texts[1] 
        assert 'Third modification' in texts[2]

    def test_document_memory_efficiency(self):
        """Test that document instances are properly shared and not duplicated"""
        manager = DocumentManager()
        
        # Create one document instance
        original_doc = manager.get_or_create_document('efficiency-test')
        
        # Connect 100 clients to the same document
        client_docs = []
        for i in range(100):
            doc = manager.connect_client(f'client-{i}', 'efficiency-test')
            client_docs.append(doc)
        
        # All should be the exact same instance (memory efficient)
        for doc in client_docs:
            assert doc is original_doc
        
        # Only one document should exist in manager
        stats = manager.get_document_stats()
        assert stats['total_documents'] == 1
        assert stats['total_clients'] == 100
        assert stats['client_distribution']['efficiency-test'] == 100


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

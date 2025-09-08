/**
 * Simple test to verify LoroXmlText works
 */

import { LoroDoc } from 'loro-crdt';
import { createLoroXmlText } from './../src/collab/loro/types';

// Create a test document
const doc = new LoroDoc();
const xmlText = createLoroXmlText(doc);

// Test basic operations
console.log('Testing LoroXmlText...');

// Insert some text
xmlText.insert(0, 'Hello ');
xmlText.insert(6, 'World!');
console.log('Text after inserts:', xmlText.toString()); // Should be "Hello World!"

// Insert an embedded object
const embeddedObj = { type: 'image', src: 'test.jpg' };
xmlText.insertEmbed(6, embeddedObj);

// Test toDelta
const delta = xmlText.toDelta();
console.log('Delta:', JSON.stringify(delta, null, 2));

// Test delete
xmlText.delete(0, 6); // Delete "Hello "
console.log('Text after delete:', xmlText.toString()); // Should be "World!"

console.log('LoroXmlText test completed successfully!');

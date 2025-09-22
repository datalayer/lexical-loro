import { LoroDoc, LoroText } from 'loro-crdt';
import * as fs from 'fs';
import * as path from 'path';

describe('Loro Performance Tests', () => {

  test('should measure time for LoroDoc creation, LoroText operations and commit', () => {
    const measurements: Record<string, number> = {};
    
    // Measure LoroDoc creation
    const docCreationStart = performance.now();
    const doc = new LoroDoc();
    const docCreationEnd = performance.now();
    measurements.docCreation = docCreationEnd - docCreationStart;
    
    // Measure LoroText creation
    const textCreationStart = performance.now();
    const textId = 'performance-test-text';
    const text = doc.getText(textId);
    const textCreationEnd = performance.now();
    measurements.textCreation = textCreationEnd - textCreationStart;
    
    // Measure text insertion (small content)
    const smallInsertStart = performance.now();
    text.insert(0, 'Hello, World!');
    const smallInsertEnd = performance.now();
    measurements.smallInsert = smallInsertEnd - smallInsertStart;
    
    // Measure text insertion (large content)
    const largeContent = 'A'.repeat(10000); // 10KB of text
    const largeInsertStart = performance.now();
    text.insert(text.length, largeContent);
    const largeInsertEnd = performance.now();
    measurements.largeInsert = largeInsertEnd - largeInsertStart;
    
    // Measure commit operation
    const commitStart = performance.now();
    doc.commit();
    const commitEnd = performance.now();
    measurements.commit = commitEnd - commitStart;
    
    // Measure total time
    const totalTime = docCreationEnd - docCreationStart;
    measurements.total = totalTime;
    
    // Log measurements for debugging
    console.log('📊 Loro Performance Measurements:', {
      docCreation: `${measurements.docCreation.toFixed(3)}ms`,
      textCreation: `${measurements.textCreation.toFixed(3)}ms`, 
      smallInsert: `${measurements.smallInsert.toFixed(3)}ms`,
      largeInsert: `${measurements.largeInsert.toFixed(3)}ms`,
      commit: `${measurements.commit.toFixed(3)}ms`,
      total: `${measurements.total.toFixed(3)}ms`
    });
    
    // Assertions to ensure operations completed successfully
    expect(doc).toBeDefined();
    expect(text).toBeDefined();
    expect(text.toString()).toBe('Hello, World!' + largeContent);
    expect(text.length).toBe(13 + largeContent.length);
    
    // Performance expectations (these are reasonable thresholds)
    expect(measurements.docCreation).toBeLessThan(100); // Doc creation should be < 100ms
    expect(measurements.textCreation).toBeLessThan(50); // Text creation should be < 50ms
    expect(measurements.smallInsert).toBeLessThan(10); // Small insert should be < 10ms
    expect(measurements.largeInsert).toBeLessThan(100); // Large insert should be < 100ms
    expect(measurements.commit).toBeLessThan(200); // Commit should be < 200ms
  });

  test('should measure commit performance with multiple text containers', () => {
    const doc = new LoroDoc();
    const textCount = 100;
    const texts: LoroText[] = [];
    
    // Create multiple text containers
    const multiTextCreationStart = performance.now();
    for (let i = 0; i < textCount; i++) {
      const text = doc.getText(`text-${i}`);
      text.insert(0, `Content for text container ${i}`);
      texts.push(text);
    }
    const multiTextCreationEnd = performance.now();
    
    // Measure commit with multiple containers
    const multiCommitStart = performance.now();
    doc.commit();
    const multiCommitEnd = performance.now();
    
    const measurements = {
      multiTextCreation: multiTextCreationEnd - multiTextCreationStart,
      multiCommit: multiCommitEnd - multiCommitStart
    };
    
    console.log('📊 Multi-Container Performance:', {
      textCount,
      creation: `${measurements.multiTextCreation.toFixed(3)}ms`,
      commit: `${measurements.multiCommit.toFixed(3)}ms`,
      avgCreationPerText: `${(measurements.multiTextCreation / textCount).toFixed(3)}ms`,
      commitPerText: `${(measurements.multiCommit / textCount).toFixed(3)}ms`
    });
    
    // Assertions
    expect(texts).toHaveLength(textCount);
    expect(measurements.multiTextCreation).toBeLessThan(1000); // Should create 100 texts in < 1s
    expect(measurements.multiCommit).toBeLessThan(500); // Should commit 100 texts in < 500ms
  });

  test('should measure commit performance with large document size', () => {
    const doc = new LoroDoc();
    const text = doc.getText('large-doc-text');
    
    // Build a large document incrementally
    const chunkSize = 1000;
    const chunks = 50; // 50KB total
    const buildStart = performance.now();
    
    for (let i = 0; i < chunks; i++) {
      const chunk = `Chunk ${i}: ${'x'.repeat(chunkSize - 20)}\n`;
      text.insert(text.length, chunk);
    }
    
    const buildEnd = performance.now();
    
    // Measure commit on large document
    const largeCommitStart = performance.now();
    doc.commit();
    const largeCommitEnd = performance.now();
    
    const measurements = {
      documentBuild: buildEnd - buildStart,
      largeDocCommit: largeCommitEnd - largeCommitStart,
      documentSize: text.length
    };
    
    console.log('📊 Large Document Performance:', {
      documentSize: `${measurements.documentSize} characters`,
      buildTime: `${measurements.documentBuild.toFixed(3)}ms`,
      commitTime: `${measurements.largeDocCommit.toFixed(3)}ms`,
      commitPerKB: `${(measurements.largeDocCommit / (measurements.documentSize / 1024)).toFixed(3)}ms/KB`
    });
    
    // Assertions
    expect(text.length).toBeGreaterThan(45000); // Should be around 50KB
    expect(measurements.documentBuild).toBeLessThan(2000); // Build should be < 2s
    expect(measurements.largeDocCommit).toBeLessThan(1000); // Large commit should be < 1s
  });

  test('should measure commit performance under rapid editing simulation', () => {
    const doc = new LoroDoc();
    const text = doc.getText('rapid-edit-text');
    
    // Simulate rapid editing with frequent commits
    const editsPerBatch = 50;
    const batches = 20;
    const totalEdits = editsPerBatch * batches;
    
    console.log(`🚀 Starting rapid editing simulation: ${totalEdits} edits across ${batches} batches`);
    
    const rapidEditStart = performance.now();
    const commitTimes: number[] = [];
    
    for (let batch = 0; batch < batches; batch++) {
      // Perform a batch of edits
      for (let edit = 0; edit < editsPerBatch; edit++) {
        const content = `Edit ${batch * editsPerBatch + edit}: Some content here. `;
        text.insert(text.length, content);
      }
      
      // Measure commit time for this batch
      const batchCommitStart = performance.now();
      doc.commit();
      const batchCommitEnd = performance.now();
      commitTimes.push(batchCommitEnd - batchCommitStart);
    }
    
    const rapidEditEnd = performance.now();
    
    // Calculate statistics
    const totalTime = rapidEditEnd - rapidEditStart;
    const avgCommitTime = commitTimes.reduce((a, b) => a + b, 0) / commitTimes.length;
    const maxCommitTime = Math.max(...commitTimes);
    const minCommitTime = Math.min(...commitTimes);
    const totalCommitTime = commitTimes.reduce((a, b) => a + b, 0);
    
    console.log('📊 Rapid Editing Performance:', {
      totalEdits,
      totalTime: `${totalTime.toFixed(3)}ms`,
      avgEditTime: `${(totalTime / totalEdits).toFixed(3)}ms`,
      totalCommitTime: `${totalCommitTime.toFixed(3)}ms`,
      avgCommitTime: `${avgCommitTime.toFixed(3)}ms`,
      minCommitTime: `${minCommitTime.toFixed(3)}ms`,
      maxCommitTime: `${maxCommitTime.toFixed(3)}ms`,
      documentSize: `${text.length} characters`,
      commitOverhead: `${((totalCommitTime / totalTime) * 100).toFixed(1)}%`
    });
    
    // Assertions
    expect(text.length).toBeGreaterThan(totalEdits * 20); // Each edit adds ~40+ chars
    expect(avgCommitTime).toBeLessThan(10); // Average commit should be < 10ms
    expect(maxCommitTime).toBeLessThan(50); // Max commit should be < 50ms
    expect(totalTime).toBeLessThan(5000); // Total should be < 5s
    
    // Verify content integrity
    const finalContent = text.toString();
    expect(finalContent).toContain('Edit 0:');
    expect(finalContent).toContain(`Edit ${totalEdits - 1}:`);
  });

  test('should measure performance when importing big-loro-updates.json', () => {
    console.log('🔥 Starting big JSON import performance test...');
    
    // Load the big JSON file from disk
    const jsonFilePath = path.join(__dirname, 'big-loro-updates.json');
    
    const fileLoadStart = performance.now();
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    const fileLoadEnd = performance.now();
    
    console.log(`📁 JSON file loaded: ${jsonContent.length} characters (${(jsonContent.length / 1024 / 1024).toFixed(2)}MB)`);
    
    // Create a new LoroDoc
    const docCreationStart = performance.now();
    const doc = new LoroDoc();
    const docCreationEnd = performance.now();
    
    // Import the JSON updates
    const importStart = performance.now();
    doc.importJsonUpdates(jsonContent);
    const importEnd = performance.now();

    // Get document state after import
    const stateCheckStart = performance.now();
    const docVersion = doc.version();
    const stateCheckEnd = performance.now();
    
    // Add a new LoroText after import to test performance on large doc
    const textCreationStart = performance.now();
    const newText = doc.getText('performance-test-after-import');
    const textCreationEnd = performance.now();
    
    // Insert content into the new text
    const textInsertStart = performance.now();
    newText.insert(0, 'This is a test text added after importing large document');
    const textInsertEnd = performance.now();
    
    // Commit the changes
    const commitStart = performance.now();
    doc.commit();
    const commitEnd = performance.now();
    
    // Calculate measurements
    const measurements = {
      fileLoad: fileLoadEnd - fileLoadStart,
      docCreation: docCreationEnd - docCreationStart,
      jsonImport: importEnd - importStart,
      stateCheck: stateCheckEnd - stateCheckStart,
      textCreation: textCreationEnd - textCreationStart,
      textInsert: textInsertEnd - textInsertStart,
      commit: commitEnd - commitStart,
      totalTime: commitEnd - docCreationStart
    };
    
    // Log comprehensive performance metrics
    console.log('📊 Big JSON Import Performance:', {
      fileSize: `${(jsonContent.length / 1024 / 1024).toFixed(2)}MB`,
      fileLoad: `${measurements.fileLoad.toFixed(3)}ms`,
      docCreation: `${measurements.docCreation.toFixed(3)}ms`,
      jsonImport: `${measurements.jsonImport.toFixed(3)}ms`,
      stateCheck: `${measurements.stateCheck.toFixed(3)}ms`,
      textCreation: `${measurements.textCreation.toFixed(3)}ms`,
      textInsert: `${measurements.textInsert.toFixed(3)}ms`,
      commit: `${measurements.commit.toFixed(3)}ms`,
      totalTime: `${measurements.totalTime.toFixed(3)}ms`,
      docVersion: JSON.stringify(docVersion),
      importThroughput: `${(jsonContent.length / 1024 / measurements.jsonImport).toFixed(2)}KB/ms`
    });
    
    // Performance assertions
    expect(doc).toBeDefined();
    expect(newText).toBeDefined();
    expect(Object.keys(docVersion).length).toBeGreaterThan(0);
    expect(newText.toString()).toBe('This is a test text added after importing large document');
    
    // Reasonable performance expectations for a large document
    expect(measurements.fileLoad).toBeLessThan(1000); // File load < 1s
    expect(measurements.docCreation).toBeLessThan(100); // Doc creation < 100ms
    expect(measurements.jsonImport).toBeLessThan(10000); // Import < 10s for large file
    expect(measurements.textCreation).toBeLessThan(100); // Text creation < 100ms even on large doc
    expect(measurements.textInsert).toBeLessThan(50); // Text insert < 50ms
    expect(measurements.commit).toBeLessThan(1000); // Commit < 1s even for large doc
    
    // Log final document statistics
    console.log('📈 Final Document Stats:', {
      docVersionEntries: Object.keys(docVersion).length,
      newTextLength: newText.toString().length,
      docStateSize: 'Unknown' // LoroDoc doesn't expose size directly
    });
  });

  test('should compare performance: empty doc vs imported large doc operations', () => {
    console.log('⚖️ Starting performance comparison test...');
    
    // Test 1: Operations on empty document
    const emptyDoc = new LoroDoc();
    const emptyTestStart = performance.now();
    
    const emptyText = emptyDoc.getText('empty-test');
    emptyText.insert(0, 'Test content for empty doc');
    emptyDoc.commit();
    
    const emptyTestEnd = performance.now();
    const emptyDocTime = emptyTestEnd - emptyTestStart;
    
    // Test 2: Load big document and perform same operations
    const jsonContent = fs.readFileSync(path.join(__dirname, 'big-loro-updates.json'), 'utf-8');
    const bigDoc = new LoroDoc();
    
    const importStart = performance.now();
    bigDoc.importJsonUpdates(jsonContent);
    const importEnd = performance.now();
    
    const bigTestStart = performance.now();
    
    const bigText = bigDoc.getText('big-test');
    bigText.insert(0, 'Test content for big doc');
    bigDoc.commit();
    
    const bigTestEnd = performance.now();
    const bigDocTime = bigTestEnd - bigTestStart;
    
    // Calculate performance impact
    const performanceImpact = {
      emptyDocOps: emptyDocTime,
      bigDocOps: bigDocTime,
      importTime: importEnd - importStart,
      slowdownFactor: bigDocTime / emptyDocTime,
      absoluteDifference: bigDocTime - emptyDocTime
    };
    
    console.log('📊 Performance Comparison:', {
      emptyDoc: `${performanceImpact.emptyDocOps.toFixed(3)}ms`,
      bigDoc: `${performanceImpact.bigDocOps.toFixed(3)}ms`,
      importTime: `${performanceImpact.importTime.toFixed(3)}ms`,
      slowdownFactor: `${performanceImpact.slowdownFactor.toFixed(2)}x`,
      absoluteDifference: `${performanceImpact.absoluteDifference.toFixed(3)}ms`,
      conclusion: performanceImpact.slowdownFactor < 2 ? 'Minimal impact' : 
                 performanceImpact.slowdownFactor < 5 ? 'Moderate impact' : 'Significant impact'
    });
    
    // Assertions
    expect(emptyDoc).toBeDefined();
    expect(bigDoc).toBeDefined();
    expect(performanceImpact.slowdownFactor).toBeLessThan(10); // Should not be 10x slower
    expect(performanceImpact.absoluteDifference).toBeLessThan(1000); // Difference < 1s
  });

});

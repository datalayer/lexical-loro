# Performance

The `binding.doc.commit({ origin: binding.doc.peerIdStr })` call can cause latency with large documents because it's synchronously processing all the changes and potentially triggering network synchronization.

Here are several approaches to handle commits asynchronously:

1. Debounced Commit Strategy: Instead of committing after every mutation batch, debounce commits to reduce frequency.
2. Async Commit with Promise:Wrap the commit in a Promise and use setTimeout to yield control.
3. Batched Commit Strategy: Accumulate multiple updates before committing.
4. Web Worker Commit (Advanced): For very large documents, move commit processing to a Web Worker.
5. RequestIdleCallback Strategy;: Commit during browser idle time.

For now, we have implemented the Debounced Commit Strategy (#1) as it provides the best balance of performance and simplicity.

In this collaborative Lexical editor backed by loro crdt, the collaborative cursor is displayed in an approximative way. 

Think really deep to leverage loro cursor https://loro.dev/docs/tutorial/cursor and ephemeral-store https://loro.dev/docs/tutorial/ephemeral in typescript and python.

For now the key of the anchor and focus is used - the key is a NodeKey and the NodeKeys are not stable, as being recomputed on each lexical state replacement done on sync.

For info, the cursor movement and selection works fine before changes to the lexical state. Once a sync occurs, the lexical state is overriden, and then cursor and selection logic breaks

I see also in the code specific condition like  Y-AXIS SPECIFIC: Check if cursor is way outside the editor area - that should not be and that should be removed completely.

There should be a way to find a stable way to compute and display the cursor positions of other collaborators. Find another solution.


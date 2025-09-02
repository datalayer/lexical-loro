# Initialization Best Practices

⚠️ **Important**: To avoid race conditions and initial state corruption, always wait for collaboration initialization to complete before enabling other Lexical plugins or performing document operations.

## Why Initialization Matters

Collaborative editing involves complex synchronization between:
- Local Lexical editor state
- Remote CRDT document state  
- WebSocket connection establishment
- Initial document snapshot loading

Enabling other plugins or performing operations before this synchronization completes can cause:
- Document state corruption
- Lost edits
- Inconsistent collaborative state
- Race conditions between local and remote changes

## Proper Plugin Ordering

```tsx
function MyEditor() {
  const [isCollabInitialized, setIsCollabInitialized] = useState(false);

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div>
        {/* ALWAYS load collaborative plugin first */}
        <LoroCollaborativePlugin
          websocketUrl="ws://localhost:8081"
          docId="my-document"
          onInitialization={(success) => {
            setIsCollabInitialized(success);
            console.log('Collaboration ready:', success);
          }}
        />
        
        {/* WAIT for collaboration before enabling other plugins */}
        {isCollabInitialized && (
          <>
            <HistoryPlugin />
            <AutoLinkPlugin />
            <ListPlugin />
            <CheckListPlugin />
            {/* Other plugins... */}
          </>
        )}
        
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={<div>Loading collaborative editor...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
    </LexicalComposer>
  );
}
```

## Initialization Callback

The `onInitialization` callback provides essential feedback:

```tsx
<LoroCollaborativePlugin
  websocketUrl="ws://localhost:8081"
  docId="document-123"
  onInitialization={(success: boolean) => {
    if (success) {
      // ✅ Safe to enable other plugins and features
      console.log('Collaboration initialized successfully');
      enableOtherFeatures();
    } else {
      // ❌ Handle initialization failure
      console.error('Collaboration failed to initialize');
      showErrorMessage('Failed to connect to collaborative server');
    }
  }}
/>
```

## Visual Status Indicators

Provide users with clear feedback about initialization status:

```tsx
function CollaborativeEditor() {
  const [isInitialized, setIsInitialized] = useState(false);

  return (
    <div>
      <div className="status-bar">
        Collaboration: {isInitialized ? '✅ Ready' : '⏳ Connecting...'}
      </div>
      
      <LexicalComposer initialConfig={editorConfig}>
        <LoroCollaborativePlugin
          websocketUrl="ws://localhost:8081"
          docId="document-123"
          onInitialization={setIsInitialized}
        />
        
        {/* Editor becomes fully functional only after initialization */}
        <RichTextPlugin
          contentEditable={
            <ContentEditable 
              style={{ 
                opacity: isInitialized ? 1 : 0.5,
                pointerEvents: isInitialized ? 'auto' : 'none'
              }} 
            />
          }
          placeholder={
            <div>
              {isInitialized 
                ? 'Start typing...' 
                : 'Connecting to collaboration server...'
              }
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </LexicalComposer>
    </div>
  );
}
```

## Common Anti-Patterns to Avoid

❌ **Don't** enable plugins immediately:
```tsx
// WRONG: Race condition risk
<LoroCollaborativePlugin websocketUrl="..." />
<HistoryPlugin /> {/* May interfere with initial sync */}
```

❌ **Don't** perform immediate document operations:
```tsx
// WRONG: May overwrite remote content
useEffect(() => {
  editor.update(() => {
    $getRoot().clear(); // Dangerous before sync!
  });
}, []);
```

❌ **Don't** ignore initialization status:
```tsx
// WRONG: No feedback on connection issues
<LoroCollaborativePlugin websocketUrl="..." />
```

## Debugging Initialization Issues

If initialization fails, check:

1. **WebSocket Connection**: Ensure server is running and accessible
2. **Network Issues**: Check browser network tab for connection errors
3. **CORS Settings**: Verify server allows cross-origin WebSocket connections
4. **Document ID**: Ensure unique document IDs for different models
5. **Server Logs**: Enable debug logging on server side

```bash
# Enable debug logging
export LEXICAL_LORO_LOG_LEVEL=DEBUG
lexical-loro-server
```

## Best Practices Summary

✅ **DO:**
- Wait for initialization before enabling other plugins
- Use the `onInitialization` callback
- Provide visual status indicators to users
- Handle initialization failures gracefully
- Test with slow network conditions

❌ **DON'T:**
- Enable other plugins immediately
- Perform document operations before sync
- Ignore connection status
- Assume initialization always succeeds
- Skip error handling

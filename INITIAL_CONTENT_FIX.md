# Initial Content Fix for Browser Display

## Issue Identified
The browser was not showing initial content because the server was creating empty LexicalModel documents without seeding them with default content.

**Root Cause:**
- Server was calling `LexicalModel.create_document()` without `initial_content` parameter
- Empty documents resulted in empty snapshots being sent to clients
- Browser received snapshots but got no content to display

**Client Logs Showed:**
```
⚠️ Empty content received from snapshot
📄 Lexical editor received and applied initial snapshot
📋 Got structured content from "content" container: ...
```

## Fix Applied

### 1. **Added Initial Content Constant**
```python
INITIAL_LEXICAL_JSON = """
{"editorState":{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}},"lastSaved":1755694807576,"source":"Lexical Loro","version":"0.34.0"}
"""
```

### 2. **Updated get_model() Method**
```python
def get_model(self, doc_id: str) -> LexicalModel:
    if doc_id not in self.models:
        # Provide initial content for lexical documents
        initial_content = None
        if doc_id == 'lexical-shared-doc':
            initial_content = INITIAL_LEXICAL_JSON
        
        # Create model with initial content
        model = LexicalModel.create_document(
            doc_id=doc_id,
            initial_content=initial_content,
            event_callback=self._on_model_event,
            ephemeral_timeout=300000
        )
```

## Expected Result

When you refresh the browser now, you should see:

1. **Default Content**: "Lexical with Loro" heading and "Type something..." paragraph
2. **No Empty Content Warning**: Client logs should show actual content being received
3. **Proper Initialization**: Editor should be ready for collaborative editing

## Server Logs Verification

The server should now show:
- ✅ Models created successfully with initial content
- ✅ Snapshots containing actual data (not empty)  
- ✅ No errors when sending initial snapshots to clients

## Testing
- ✅ Server starts without errors
- ✅ No syntax issues in the code
- ✅ Initial content constant properly defined
- ✅ get_model() method updated to seed lexical documents

The initial content should now be visible in the browser when you refresh!

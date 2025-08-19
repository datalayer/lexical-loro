import { useEffect, useRef } from 'react';
import { LoroDoc, LoroMap } from 'loro-crdt';

interface LoroCollaborativePlugin0Props {
  websocketUrl: string;
  docId: string;
  onConnectionChange?: (connected: boolean) => void;
}

export function LoroCollaborativePlugin0({ websocketUrl, docId, onConnectionChange }: LoroCollaborativePlugin0Props) {
  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<LoroDoc>(new LoroDoc());
  const mapRef = useRef<LoroMap | null>(null);

  // Initialize LoroMap
  useEffect(() => {
    mapRef.current = docRef.current.getMap(docId);
  }, [docId]);

  // WebSocket setup
  useEffect(() => {
    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[LoroCollaborativePlugin0] WebSocket connected');
      onConnectionChange?.(true);
    };

    ws.onmessage = (event) => {
      // Expecting binary Loro update
      if (event.data instanceof ArrayBuffer) {
        const update = new Uint8Array(event.data);
        docRef.current.import(update);
        console.log('[LoroCollaborativePlugin0] Received Loro update from server');
      } else {
        console.log('[LoroCollaborativePlugin0] Received non-binary message:', event.data);
      }
    };

    ws.onclose = () => {
      console.log('[LoroCollaborativePlugin0] WebSocket disconnected');
      onConnectionChange?.(false);
    };

    ws.onerror = (err) => {
      console.error('[LoroCollaborativePlugin0] WebSocket error', err);
      onConnectionChange?.(false);
    };

    return () => {
      ws.close();
      onConnectionChange?.(false);
    };
  }, [websocketUrl, onConnectionChange]);

  // Listen to LoroDoc state changes
  useEffect(() => {
    const doc = docRef.current;
    const handleChange = () => {
      if (mapRef.current) {
        console.log('[LoroCollaborativePlugin0] LoroMap state changed:', mapRef.current.toJSON());
      }
    };
    const unsubscribe = doc.subscribe(handleChange);
    return () => {
      unsubscribe();
    };
  }, []);

  // Send Loro updates to server
  useEffect(() => {
    if (!wsRef.current || !mapRef.current) return;
    const doc = docRef.current;
    const handleChange = () => {
      // Export only the changes since last export (use docId as container id)
      const update = doc.export({ mode: "snapshot" });
      wsRef.current?.send(update);
      console.log('[LoroCollaborativePlugin0] Sent Loro update to server');
    };
    const unsubscribe = doc.subscribe(handleChange);
    return () => {
      unsubscribe();
    };
  }, [docId]);

  return null;
}

/*
 * Copyright (c) 2021-Present Datalayer, Inc.
 *
 * MIT License
 */

/**
 * A menu of the MCP server's tools, each invoked on the room.
 *
 * The example runs an MCP server beside the relay
 * (`npm run server:py:mcp`); this menu lists its tools through the MCP
 * client and calls the chosen one on the current room, so what the server
 * writes shows up in both panes through the relay. The address bar can point
 * it elsewhere with `?mcp=http://host:port/mcp`.
 *
 * @module example/McpToolsMenu
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionList, ActionMenu, Text } from '@primer/react';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Where the example's MCP server listens (`npm run server:py:mcp`). */
export const DEFAULT_MCP_URL = 'http://localhost:3001/mcp';

interface Tool {
  name: string;
  description?: string;
  inputSchema: { properties?: Record<string, { type?: string; default?: unknown }>; required?: string[] };
}

/** What each argument of a tool is filled with, asked or assumed. */
function argumentsFor(tool: Tool, room: string): Record<string, unknown> | null {
  const properties = tool.inputSchema.properties ?? {};
  const args: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(properties)) {
    if (name === 'doc_id') {
      args[name] = room;
      continue;
    }
    const required = (tool.inputSchema.required ?? []).includes(name);
    const fallback =
      schema.default !== undefined
        ? String(schema.default)
        : name === 'index'
          ? '-1'
          : name === 'level'
            ? '1'
            : name === 'language'
              ? 'python'
              : name === 'code'
                ? "print('Hello from MCP')"
                : name === 'block_json'
                  ? '{"type":"horizontalrule","version":1}'
                  : 'Hello from MCP';
    if (!required && schema.default !== undefined) {
      args[name] = schema.default;
      continue;
    }
    const answer = window.prompt(`${tool.name} — ${name}`, fallback);
    if (answer === null) {
      return null;
    }
    args[name] = schema.type === 'integer' || schema.type === 'number' ? Number(answer) : answer;
  }
  return args;
}

export function McpToolsMenu({ room }: { room: string }): JSX.Element {
  const url = new URLSearchParams(window.location.search).get('mcp') ?? DEFAULT_MCP_URL;
  const clientRef = useRef<Client | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [status, setStatus] = useState<string>('');

  const client = useCallback(async () => {
    if (clientRef.current) {
      return clientRef.current;
    }
    const next = new Client({ name: 'lexical-loro-example', version: '1.0.0' });
    await next.connect(new StreamableHTTPClientTransport(new URL(url)));
    clientRef.current = next;
    return next;
  }, [url]);

  const refresh = useCallback(async () => {
    try {
      const listed = await (await client()).listTools();
      setTools(listed.tools as Tool[]);
      setStatus(`${listed.tools.length} tools at ${url}`);
    } catch (error) {
      clientRef.current = null;
      setStatus(`No MCP server at ${url}: ${String((error as Error).message ?? error)}`);
    }
  }, [client, url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invoke = async (tool: Tool) => {
    const args = argumentsFor(tool, room);
    if (args === null) {
      return;
    }
    setStatus(`${tool.name}…`);
    try {
      const result = await (await client()).callTool({ name: tool.name, arguments: args });
      const first = (result.content as Array<{ type: string; text?: string }>)[0];
      let summary = first?.text ?? '';
      try {
        const parsed = JSON.parse(summary);
        summary = parsed.success ? `ok — ${parsed.total_blocks ?? ''} blocks`.trim() : `failed — ${parsed.error}`;
      } catch {
        // Not JSON: shown as it is.
      }
      setStatus(`${tool.name}: ${summary.slice(0, 120)}`);
    } catch (error) {
      setStatus(`${tool.name} failed: ${String((error as Error).message ?? error)}`);
    }
  };

  return (
    <>
      <ActionMenu onOpenChange={open => open && void refresh()}>
        <ActionMenu.Button>MCP</ActionMenu.Button>
        <ActionMenu.Overlay width="large">
          <ActionList>
            <ActionList.Group>
              <ActionList.GroupHeading>Tools on room “{room}”</ActionList.GroupHeading>
              {tools.map(tool => (
                <ActionList.Item key={tool.name} onSelect={() => void invoke(tool)}>
                  {tool.name}
                  <ActionList.Description variant="block">
                    {(tool.description ?? '').split('\n')[0].slice(0, 140)}
                  </ActionList.Description>
                </ActionList.Item>
              ))}
              {tools.length === 0 && <ActionList.Item disabled>No tools — is the MCP server running?</ActionList.Item>}
            </ActionList.Group>
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
      {status && (
        <Text sx={{ fontSize: 0, color: 'var(--fgColor-muted)' }} data-testid="mcp-status">
          {status}
        </Text>
      )}
    </>
  );
}

export default McpToolsMenu;

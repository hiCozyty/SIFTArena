import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "customMCP", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Register your tools here
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "my_tool",
      description: "Does something useful",
      inputSchema: {
        type: "object",
        properties: {
          input: {
            type: "string",
            description: "Some input value",
          },
        },
        required: ["input"],
      },
    },
  ],
}));

// Handle tool calls here
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "my_tool") {
    const result = `You passed: ${args?.input}`;
    return {
      content: [{ type: "text", text: result }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Connect via stdio (how opencode talks to local MCP servers)
const transport = new StdioServerTransport();
await server.connect(transport);
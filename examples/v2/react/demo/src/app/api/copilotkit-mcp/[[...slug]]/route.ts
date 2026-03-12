import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkitnext/runtime";
import { handle } from "hono/vercel";
import { BasicAgent } from "@copilotkitnext/agent";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { ProxyAgent } from "undici";

// Patch global fetch to route external requests through the corporate proxy.
// Node.js fetch (undici) ignores HTTPS_PROXY env vars by default.
// undici is listed in serverExternalPackages so webpack doesn't bundle it.
(function patchFetchWithProxy() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl || (globalThis as { __fetchProxyPatched?: boolean }).__fetchProxyPatched) return;
  (globalThis as { __fetchProxyPatched?: boolean }).__fetchProxyPatched = true;

  const noProxy = (process.env.NO_PROXY || "localhost,127.0.0.1")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const dispatcher = new ProxyAgent(proxyUrl);
  const origFetch = globalThis.fetch;

  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (noProxy.some((h) => url.includes(`//${h}`))) return origFetch(input, init);
    // @ts-expect-error dispatcher is undici-specific, not in standard RequestInit
    return origFetch(input, { ...init, dispatcher });
  };
  console.log("[proxy] fetch patched →", proxyUrl);
})();

const determineModel = () => {
  if (process.env.OPENAI_API_KEY?.trim()) return "openai/gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "anthropic/claude-3-5-haiku-20241022";
  if (process.env.GOOGLE_API_KEY?.trim()) return "google/gemini-2.0-flash";
  return "openai/gpt-4o-mini";
};

const agent = new BasicAgent({
  model: determineModel(),
  prompt: "You are a helpful AI assistant with access to MCP apps and tools. When the user asks about time, always call the get-time tool.",
  temperature: 0.7,
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      { type: "http", url: "http://localhost:3102/mcp" }, // basic-server-react (get-time)
    ],
  }),
);

const honoRuntime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
});

const app = createCopilotEndpoint({
  runtime: honoRuntime,
  basePath: "/api/copilotkit-mcp",
});

export const GET = handle(app);
export const POST = handle(app);

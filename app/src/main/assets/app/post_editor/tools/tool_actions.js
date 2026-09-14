/**
 * Tool behavior registry.
 * IDs (tool_1 / tool_m1 / toolbox_1) identify UI entries; behavior dispatch uses action/url only.
 * The optional `name` metadata is intentionally never read here.
 */
const ToolActions = (() => {
  const handlers = new Map();

  function register(action, handler) {
    handlers.set(action, handler);
  }

  async function run(tool) {
    if (typeof tool.url === 'string') {
      return openConfiguredTool(tool);
    }
    const handler = handlers.get(tool.action);
    if (!handler) throw new Error(`Unsupported tool action: ${tool.action}`);
    return handler(tool);
  }

  return Object.freeze({ register, run });
})();

/**
 * Tool behavior registry.
 *
 * IDs (tool_1 / tool_m1 / toolbox_1) identify UI entries.
 * Behavior dispatch uses action/url only.
 *
 * Optional `name` metadata is intentionally ignored here.
 */
const ToolActions = (() => {
  const handlers = new Map();

  function register(action, handler) {
    if (!action || typeof handler !== 'function') {
      throw new TypeError(
        'ToolActions.register requires an action and handler'
      );
    }

    handlers.set(action, handler);
  }

  async function run(tool, options = {}) {
    if (!tool) {
      throw new TypeError(
        'ToolActions.run requires a tool'
      );
    }


    const handler =
      handlers.get(tool.action);

    if (!handler) {
      throw new Error(
        `Unsupported tool action: ${tool.action}`
      );
    }

    return handler(
      tool,
      options
    );
  }

  return Object.freeze({
    register,
    run
  });
})();
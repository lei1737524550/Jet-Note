/**
 * Tool configuration loader.
 *
 * Naming contract:
 * - tools[]         -> tool_1, tool_2, ...
 * - toolbox_tools[] -> toolbox_tool_1, toolbox_tool_2, ...
 * - name            -> maintainer-only description; runtime logic must ignore it.
 */
const ToolLoader = (() => {
  const URL = 'app/post_editor/tools/tools.json';
  let cache = null;

  function enabledItems(value) {
    return Array.isArray(value)
      ? value.filter(item => item && item.enabled !== false)
      : [];
  }

  async function load(force = false) {
    if (cache && !force) return cache;
    const response = await fetch(URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Tool config unavailable: ${response.status}`);

    const raw = await response.json();
    cache = Object.freeze({
      ...raw,
      tools: enabledItems(raw.tools),
      toolbox_tools: enabledItems(raw.toolbox_tools),
    });
    return cache;
  }

  function layout(config) {
    const tools = config?.tools || [];
    const toolboxTools = config?.toolbox_tools || [];
    return Object.freeze({
      tools,
      toolboxTools,
      total: tools.length + toolboxTools.length,
    });
  }

  function clear() { cache = null; }
  return Object.freeze({ load, layout, clear });
})();

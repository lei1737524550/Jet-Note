/**
 * Canonical New/Edit Post tool model.
 *
 * - Tool: a normal toolbar entry.
 * - Toolbox extends Tool: an anchor entry whose children temporarily occupy
 *   slots immediately to its LEFT while expanded.
 * - The original tools[] model is never mutated by expansion.
 * - Tool definitions and tool-specific behavior come exclusively from
 *   src/features/editor/tool_area/tools/tools.json.
 */
const ToolLoader = (() => {
  const TOOLS_URL =
    'src/features/editor/tool_area/tools/tools.json';

  let cache = null;


  class Tool {
    constructor(raw = {}) {
      Object.assign(
        this,
        raw
      );

      this.type =
        raw.type || 'tool';

      Object.freeze(this);
    }
  }


  class Toolbox extends Tool {
    constructor(raw = {}) {
      const children =
        Array.isArray(raw.children)
          ? raw.children
              .filter(
                item =>
                  item &&
                  item.enabled !== false
              )
              .map(
                item =>
                  new Tool({
                    ...item,
                    type: 'toolbox_tool'
                  })
              )
          : [];

      super({
        ...raw,
        type: 'toolbox',
        children:
          Object.freeze(children)
      });
    }
  }


  function normalizeTool(raw) {
    if (
      !raw ||
      raw.enabled === false
    ) {
      return null;
    }

    return raw.type === 'toolbox'
      ? new Toolbox(raw)
      : new Tool(raw);
  }


  async function fetchJson(url) {
    const response =
      await fetch(
        url,
        {
          cache: 'no-store'
        }
      );

    if (!response.ok) {
      throw new Error(
        `Tool config unavailable: ${url} (${response.status})`
      );
    }

    return response.json();
  }


  async function load(
    force = false
  ) {
    if (
      cache &&
      !force
    ) {
      return cache;
    }

    const rawConfig =
      await fetchJson(
        TOOLS_URL
      );


    const tools =
      Array.isArray(rawConfig.tools)
        ? rawConfig.tools
            .map(normalizeTool)
            .filter(Boolean)
        : [];


    const toolbox =
      tools.find(
        item =>
          item.type === 'toolbox'
      ) || null;


    const maximumVisibleTools =
      Number(
        rawConfig.maximumVisibleTools ??
        rawConfig.maximum_visible_tools ??
        6
      );


    const networkProbeTimeoutMs =
      Number(
        rawConfig.networkProbeTimeoutMs ??
        rawConfig.network_probe_timeout_ms ??
        3500
      );


    cache =
      Object.freeze({
        tools:
          Object.freeze(tools),

        toolbox,

        maximumVisibleTools,

        networkProbeTimeoutMs
      });


    return cache;
  }


  /**
   * Build a temporary visual slot array.
   *
   * Toolbox expansion walks left from the Toolbox anchor
   * and replaces those visible slots with children in child order.
   *
   * The source tools[] array is never modified.
   */
  function buildVisibleTools(
    config,
    expanded = false
  ) {
    const source =
      Array.from(
        config?.tools || []
      );

    const configuredMaximum =
      Number(
        config?.maximumVisibleTools
      );

    const max =
      Number.isFinite(
        configuredMaximum
      )
        ? configuredMaximum
        : 6;

    const toolbox =
      config?.toolbox;


    /*
     * tool_m1 is a special "-1" anchor.
     *
     * When a Toolbox exists it always occupies the final
     * visible slot. New primary tools are selected before it
     * instead of pushing the Toolbox outside the configured
     * visible capacity.
     */
    let visible;


    if (toolbox) {
      const primary =
        source.filter(
          item =>
            item.id !== toolbox.id
        );

      visible = [
        ...primary.slice(
          0,
          max - 1
        ),
        toolbox
      ];
    } else {
      visible =
        source.slice(
          0,
          max
        );
    }


    if (
      !expanded ||
      !toolbox
    ) {
      return visible;
    }


    const anchorIndex =
      visible.findIndex(
        item =>
          item.id === toolbox.id
      );


    if (anchorIndex < 0) {
      return visible;
    }


    let slot =
      anchorIndex - 1;


    for (
      const child
      of toolbox.children || []
    ) {
      if (slot < 0) {
        break;
      }

      visible[slot] =
        child;

      slot -= 1;
    }


    return visible;
  }


  function clear() {
    cache = null;
  }


  return Object.freeze({
    Tool,
    Toolbox,
    load,
    buildVisibleTools,
    clear
  });
})();
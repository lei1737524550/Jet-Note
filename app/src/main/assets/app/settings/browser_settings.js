/* Browser Settings ---------------------------------------------------------
   Browser auto-entry and Get Source extension filtering share one persistent
   settings model. Extension buttons use the same selected visual language as
   Enable Debug: the label never gains a checkmark. */
(() => {
  const BROWSER_KEY = 'jet_note_browser_enabled_v1';
  const FILTER_ENABLED_KEY = 'jet_note_resource_filter_enabled_v1';
  const FILTER_SELECTED_KEY = 'jet_note_resource_filter_selected_v1';
  let extensionsPromise = null;

  const readSelected = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FILTER_SELECTED_KEY) || '[]');
      return Array.isArray(parsed) ? [...new Set(parsed.map(v => String(v).trim().toLowerCase()).filter(Boolean))] : [];
    } catch (_) { return []; }
  };
  const saveSelected = values => localStorage.setItem(FILTER_SELECTED_KEY, JSON.stringify(values));
  const enabled = key => localStorage.getItem(key) === '1';
  const setEnabled = (key, value) => localStorage.setItem(key, value ? '1' : '0');

  async function loadExtensions() {
    if (!extensionsPromise) {
      extensionsPromise = fetch('get_source/config.json', {cache:'no-store'})
        .then(response => { if (!response.ok) throw new Error(`Get Source config ${response.status}`); return response.json(); })
        .then(config => {
          const ordered = [];
          ['text','audio','image','video'].forEach(type => {
            const values = config?.[type]?.extensions;
            if (!Array.isArray(values)) return;
            values.forEach(value => {
              const ext = String(value).trim().toLowerCase();
              if (ext && !ordered.includes(ext)) ordered.push(ext);
            });
          });
          return ordered;
        })
        .catch(error => { console.warn('Jet Note: unable to load Get Source extension list', error); return []; });
    }
    return extensionsPromise;
  }

  function effectiveFilter() {
    if (!enabled(FILTER_ENABLED_KEY)) return [];
    return readSelected(); // [] intentionally means capture all configured types.
  }

  function syncNativeFilter() {
    try {
      window.JetNoteNative?.setGetSourceExtensionFilterJson?.(JSON.stringify(effectiveFilter()));
    } catch (error) {
      console.warn('Jet Note: unable to sync Get Source extension filter', error);
    }
  }

  function styleToggle(button, active, enabledText, disabledText) {
    if (!button) return;
    button.classList.toggle('debug-enabled', active);
    button.setAttribute('aria-pressed', String(active));
    const label = button.querySelector('.settings-choice-main');
    if (label) label.textContent = active ? enabledText : disabledText;
  }

  async function renderExtensionButtons() {
    const host = document.getElementById('browserResourceFilterGrid');
    const wrapper = document.getElementById('browserResourceFilter');
    if (!host || !wrapper) return;
    const filterEnabled = enabled(FILTER_ENABLED_KEY);
    wrapper.hidden = !filterEnabled;
    if (!filterEnabled) return;

    const all = await loadExtensions();
    const selected = new Set(readSelected());
    host.replaceChildren(...all.map(ext => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'browser-extension-button common_border';
      button.textContent = ext;
      const active = selected.has(ext);
      button.classList.toggle('debug-enabled', active);
      button.setAttribute('aria-pressed', String(active));
      button.addEventListener('click', () => {
        const values = new Set(readSelected());
        if (values.has(ext)) values.delete(ext); else values.add(ext);
        saveSelected([...values]);
        renderExtensionButtons();
        syncNativeFilter();
      });
      return button;
    }));
  }

  const Feature = {
    browserEnabled(){ return enabled(BROWSER_KEY); },
    resourceFilterEnabled(){ return enabled(FILTER_ENABLED_KEY); },
    selectedExtensions: readSelected,
    setBrowserEnabled(value){
      const next = Boolean(value);
      setEnabled(BROWSER_KEY, next);
      window.JET_NOTE_BROWSER_MODE = next;
      // Keep a native copy because the next process must choose its startup
      // route before home.html/localStorage has been loaded.
      try { window.JetNoteNative?.setBrowserModeEnabled?.(next); }
      catch (error) { console.warn('Jet Note: unable to persist Browser Mode natively', error); }
      this.refreshSettings();
    },
    setResourceFilterEnabled(value){
      setEnabled(FILTER_ENABLED_KEY, value);
      syncNativeFilter();
      // Migration/synchronization for installs that previously stored Browser
      // Mode only in WebView localStorage.
      try { window.JetNoteNative?.setBrowserModeEnabled?.(this.browserEnabled()); } catch (_) {}
      this.refreshSettings();
    },
    refreshSettings(){
      styleToggle(document.getElementById('enableBrowserButton'), this.browserEnabled(), t('browserEnabled'), t('enableBrowser'));
      styleToggle(document.getElementById('enableResourceFilterButton'), this.resourceFilterEnabled(), t('resourceFilterEnabled'), t('enableResourceFilter'));
      void renderExtensionButtons();
    },
    syncNativeFilter,
    relaunch(){
      try {
        if (window.JetNoteNative?.relaunchForConfigReload) {
          window.JetNoteNative.relaunchForConfigReload();
          return true;
        }
      } catch (error) {
        console.warn('Jet Note: unable to relaunch for configuration reload', error);
      }
      // Browser fallback: force every module/config promise to be rebuilt.
      window.location.reload();
      return false;
    },
    async maybeAutoOpen(){
      syncNativeFilter();
      // Startup Browser routing is decided natively before Home is loaded.
      // If Home exists, it was intentionally entered (for example by pressing
      // Back in startup Browser Mode), so never reopen the browser here.
      window.JET_NOTE_BROWSER_MODE = false;
      return false;
    },
    bind(){
      const browserButton = document.getElementById('enableBrowserButton');
      const filterButton = document.getElementById('enableResourceFilterButton');
      const relaunchButton = document.getElementById('browserRelaunchButton');
      if (browserButton && !browserButton.dataset.browserBound) {
        browserButton.dataset.browserBound = 'true';
        browserButton.addEventListener('click', () => this.setBrowserEnabled(!this.browserEnabled()));
      }
      if (filterButton && !filterButton.dataset.browserBound) {
        filterButton.dataset.browserBound = 'true';
        filterButton.addEventListener('click', () => this.setResourceFilterEnabled(!this.resourceFilterEnabled()));
      }
      if (relaunchButton && !relaunchButton.dataset.browserBound) {
        relaunchButton.dataset.browserBound = 'true';
        relaunchButton.addEventListener('click', () => this.relaunch());
      }
      syncNativeFilter();
      // Migration/synchronization for installs that previously stored Browser
      // Mode only in WebView localStorage.
      try { window.JetNoteNative?.setBrowserModeEnabled?.(this.browserEnabled()); } catch (_) {}
      this.refreshSettings();
    }
  };

  window.BrowserSettingsFeature = Feature;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Feature.bind(), {once:true});
  else Feature.bind();
})();

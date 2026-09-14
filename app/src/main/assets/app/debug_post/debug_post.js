(function(){
  'use strict';

  const DEBUG_MODE_STORAGE_KEY = 'jet_note_debug_enabled_v1';

  function escapeHtmlForDebugPreview(value){
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  class BaseNonPersistentPostRenderer {
    render(){ return ''; }
  }

  class DebugConfigurationPostRenderer extends BaseNonPersistentPostRenderer {
    constructor(configurationJsonText){
      super();
      this.configurationJsonText = String(configurationJsonText || '{}');
    }

    render(){
      return `
        <article class="post debug-configuration-post common_border" data-debug-configuration-post="true">
          <div class="debug-configuration-post-header">
            <div class="debug-configuration-post-filename">config.json</div>
            <button class="more debug-configuration-post-edit-button" type="button" data-debug-configuration-post-action="edit" aria-label="Edit config.json" title="Edit config.json">
              <img src="shared/icons/edit_pencil.svg" alt="" aria-hidden="true">
            </button>
          </div>
          <div class="debug-configuration-post-json-preview">${escapeHtmlForDebugPreview(this.configurationJsonText)}</div>
        </article>`;
    }
  }

  class BaseFullScreenTextEditorController {
    constructor({screenElementId, textareaElementId}){
      this.screenElementId = screenElementId;
      this.textareaElementId = textareaElementId;
    }

    get screenElement(){ return document.getElementById(this.screenElementId); }
    get textareaElement(){ return document.getElementById(this.textareaElementId); }

    isOpen(){
      return Boolean(this.screenElement?.classList.contains('open'));
    }

    openWithText(initialText){
      const screenElement = this.screenElement;
      const textareaElement = this.textareaElement;
      if (!screenElement || !textareaElement) {
        throw new Error('Debug configuration editor view is incomplete.');
      }

      // Full-screen routes are mounted once. Keeping them directly under body
      // prevents fragment containers from changing clipping or stacking behavior.
      if (screenElement.parentElement !== document.body) {
        document.body.appendChild(screenElement);
      }

      textareaElement.value = String(initialText ?? '');

      // Native TextureView video can sit above WebView regardless of CSS z-index.
      // Suspend it before painting any editor screen.
      window.JetNoteVideoOverlay?.suspend?.();
      screenElement.classList.add('open');
      screenElement.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      window.__jetSyncNativeVideoVisibility?.();
      window.ViewportManager?.update?.();

      const focusTextareaAtEnd = () => {
        textareaElement.focus({preventScroll:true});
        const endOffset = textareaElement.value.length;
        try { textareaElement.setSelectionRange(endOffset, endOffset); } catch (_) {}
      };
      focusTextareaAtEnd();
      setTimeout(focusTextareaAtEnd, 80);
    }

    closeWithoutSaving(){
      const screenElement = this.screenElement;
      if (!screenElement) return;
      this.textareaElement?.blur?.();
      screenElement.classList.remove('open');
      screenElement.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      window.__jetSyncNativeVideoVisibility?.();
    }
  }

  class DebugConfigurationEditorController extends BaseFullScreenTextEditorController {
    constructor(){
      super({
        screenElementId: 'debugConfigurationEditorScreen',
        textareaElementId: 'debugConfigurationJsonTextarea'
      });
      this.hasBoundTextareaEvents = false;
      this.isSavingConfiguration = false;
    }

    get validationErrorBox(){
      return document.getElementById('debugConfigurationValidationError');
    }

    get validationErrorMessage(){
      return this.validationErrorBox?.querySelector('.debug-configuration-validation-error-message') || null;
    }

    bindTextareaEventsOnce(){
      if (this.hasBoundTextareaEvents) return;
      const textareaElement = this.textareaElement;
      if (!textareaElement) return;
      textareaElement.addEventListener('input', () => this.clearValidationError());
      this.hasBoundTextareaEvents = true;
    }

    openConfigurationJson(configurationJsonText){
      this.bindTextareaEventsOnce();
      this.clearValidationError();
      super.openWithText(configurationJsonText);
    }

    clearValidationError(){
      const validationErrorBox = this.validationErrorBox;
      if (!validationErrorBox) return;
      validationErrorBox.hidden = true;
      if (this.validationErrorMessage) this.validationErrorMessage.textContent = '';
    }

    showValidationError(message){
      const validationErrorBox = this.validationErrorBox;
      if (!validationErrorBox) return;
      if (this.validationErrorMessage) {
        this.validationErrorMessage.textContent = String(message || 'Invalid JSON.');
      }
      validationErrorBox.hidden = false;
      validationErrorBox.scrollIntoView?.({block:'nearest', behavior:'smooth'});
    }

    validateConfigurationJson(configurationJsonText){
      try {
        const parsedConfiguration = JSON.parse(configurationJsonText);
        if (!parsedConfiguration || Array.isArray(parsedConfiguration) || typeof parsedConfiguration !== 'object') {
          return {valid:false, error:new Error('config.json root must be a JSON object.')};
        }
        return {valid:true, parsedConfiguration};
      } catch (error) {
        return {valid:false, error};
      }
    }

    async saveConfigurationAndClose(){
      if (this.isSavingConfiguration) return;

      const textareaElement = this.textareaElement;
      const saveButton = this.screenElement?.querySelector('.debug-configuration-editor-save-button');
      if (!textareaElement) return;

      const configurationJsonText = textareaElement.value;
      const validationResult = this.validateConfigurationJson(configurationJsonText);
      if (!validationResult.valid) {
        this.showValidationError(validationResult.error?.message || 'Invalid JSON. Please check the syntax and try again.');
        textareaElement.focus({preventScroll:true});
        return;
      }

      this.clearValidationError();
      this.isSavingConfiguration = true;
      if (saveButton) saveButton.disabled = true;

      try {
        const nativeBridge = window.JetNoteNative;
        if (!nativeBridge || typeof nativeBridge.setRuntimeConfigJson !== 'function') {
          throw new Error('Runtime config bridge is unavailable.');
        }

        const didSaveConfiguration = nativeBridge.setRuntimeConfigJson(configurationJsonText);
        if (!didSaveConfiguration) {
          throw new Error('Unable to save config.json.');
        }

        this.closeWithoutSaving();
        // Reload is intentional: every config consumer then sees one consistent
        // snapshot instead of partially applying fields in-place.
        location.reload();
      } catch (error) {
        this.showValidationError(error?.message || 'Unable to save config.json.');
      } finally {
        this.isSavingConfiguration = false;
        if (saveButton?.isConnected) saveButton.disabled = false;
      }
    }
  }

  let debugConfigurationEditorController = null;

  function getDebugConfigurationEditorController(){
    if (!debugConfigurationEditorController) {
      debugConfigurationEditorController = new DebugConfigurationEditorController();
    }
    debugConfigurationEditorController.bindTextareaEventsOnce();
    return debugConfigurationEditorController;
  }

  const DebugConfigurationFeature = {
    enabled(){
      return localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
    },

    setEnabled(shouldEnableDebugMode){
      localStorage.setItem(DEBUG_MODE_STORAGE_KEY, shouldEnableDebugMode ? '1' : '0');
      this.refreshSettings();
      if (typeof renderPosts === 'function') renderPosts();
    },

    getCurrentConfigurationJson(){
      try {
        const runtimeConfigurationJson = window.JetNoteNative?.getRuntimeConfigJson?.();
        return runtimeConfigurationJson || '{}';
      } catch (_) {
        return '{}';
      }
    },

    render(){
      if (!this.enabled()) return '';
      return new DebugConfigurationPostRenderer(this.getCurrentConfigurationJson()).render();
    },

    openEditor(event){
      event?.preventDefault?.();
      event?.stopPropagation?.();
      getDebugConfigurationEditorController().openConfigurationJson(this.getCurrentConfigurationJson());
    },

    closeEditor(){
      const controller = debugConfigurationEditorController;
      if (!controller?.isOpen()) return false;
      controller.closeWithoutSaving();
      return true;
    },

    isEditorOpen(){
      return Boolean(debugConfigurationEditorController?.isOpen());
    },

    saveJsonToDownloads(){
      const debugSettingsStatus = document.getElementById('debugSettingsStatus');
      if (debugSettingsStatus) debugSettingsStatus.textContent = '';

      try {
        const nativeBridge = window.JetNoteNative;
        if (!nativeBridge || typeof nativeBridge.saveEffectiveConfigJsonToDownloads !== 'function') {
          throw new Error('Config export bridge is unavailable.');
        }
        const accepted = nativeBridge.saveEffectiveConfigJsonToDownloads();
        if (!accepted && debugSettingsStatus) debugSettingsStatus.textContent = 'Unable to save config.json.';
      } catch (error) {
        if (debugSettingsStatus) debugSettingsStatus.textContent = error?.message || 'Unable to save config.json.';
      }
    },

    refreshSettings(){
      const enableDebugButton = document.getElementById('enableDebugButton');
      if (!enableDebugButton) return;

      const isDebugEnabled = this.enabled();
      enableDebugButton.classList.toggle('debug-enabled', isDebugEnabled);
      const buttonLabel = enableDebugButton.querySelector('.settings-choice-main');
      if (buttonLabel) buttonLabel.textContent = isDebugEnabled ? 'Debug Enabled' : 'Enable Debug';
      else enableDebugButton.textContent = isDebugEnabled ? 'Debug Enabled' : 'Enable Debug';
      enableDebugButton.setAttribute('aria-pressed', String(isDebugEnabled));
    },

    bind(){
      getDebugConfigurationEditorController();
      this.refreshSettings();

      // Event delegation survives post-list rerenders and fragment remounts.
      if (document.documentElement.dataset.debugConfigurationFeatureEventsBound === 'true') return;
      document.documentElement.dataset.debugConfigurationFeatureEventsBound = 'true';

      document.addEventListener('click', event => {
        const debugPostAction = event.target.closest('[data-debug-configuration-post-action]')?.dataset.debugConfigurationPostAction;
        if (debugPostAction === 'edit') {
          event.preventDefault();
          event.stopPropagation();
          DebugConfigurationFeature.openEditor(event);
          return;
        }

        const editorAction = event.target.closest('[data-debug-configuration-editor-action]')?.dataset.debugConfigurationEditorAction;
        if (!editorAction) return;

        const controller = getDebugConfigurationEditorController();
        if (editorAction === 'cancel') {
          event.preventDefault();
          controller.closeWithoutSaving();
        } else if (editorAction === 'save') {
          event.preventDefault();
          void controller.saveConfigurationAndClose();
        }
      });
    }
  };

  // Keep the public feature name stable because Settings, Posts and Navigation
  // intentionally depend on this small interface.
  window.DebugConfigurationFeature = DebugConfigurationFeature;
  // Temporary compatibility alias for any stale WebView cache from an older build.
  window.DebugPostFeature = DebugConfigurationFeature;
  window.DebugConfigurationPostRenderer = DebugConfigurationPostRenderer;
  window.DebugConfigurationEditorController = DebugConfigurationEditorController;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DebugConfigurationFeature.bind(), {once:true});
  } else {
    DebugConfigurationFeature.bind();
  }
})();

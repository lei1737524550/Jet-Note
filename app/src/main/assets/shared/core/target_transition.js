'use strict';

/**
 * Single X -> Target transition transaction.
 * Callers describe only the target and the mutation required to expose it.
 * Cover/capture/frozen animation ordering cannot be bypassed by page code.
 */
window.JetTargetTransition = (() => {
  let busy = false;

  const twoFrames = () => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));

  async function run(target, prepareTarget, sourceZAxisHeight = null) {
    if (busy) return false;
    busy = true;
    const native = window.JetNoteNative;
    let coverReadyHandler = null;
    let targetPrepared = false;
    try {
      if (!native?.beginFrozenTransitionCover || !native?.runPreparedFrozenSplitTransition) {
        await prepareTarget?.();
        return false;
      }

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (coverReadyHandler) window.removeEventListener('jetnote:frozen-cover-ready', coverReadyHandler);
          reject(new Error('Frozen transition cover readiness timed out'));
        }, 2000);
        coverReadyHandler = event => {
          if (event?.detail?.target !== target) return;
          clearTimeout(timeout);
          window.removeEventListener('jetnote:frozen-cover-ready', coverReadyHandler);
          coverReadyHandler = null;
          resolve();
        };
        window.addEventListener('jetnote:frozen-cover-ready', coverReadyHandler);
        if (sourceZAxisHeight != null && native.beginFrozenTransitionCoverFromZAxisHeight) {
          native.beginFrozenTransitionCoverFromZAxisHeight(target, Number(sourceZAxisHeight));
        } else {
          native.beginFrozenTransitionCover(target);
        }
      });

      await prepareTarget?.();
      targetPrepared = true;
      await twoFrames();
      const completed = new Promise(resolve => {
        const handler = event => {
          if (event?.detail?.target !== target) return;
          window.removeEventListener('jetnote:frozen-split-complete', handler);
          resolve();
        };
        window.addEventListener('jetnote:frozen-split-complete', handler);
        setTimeout(() => {
          window.removeEventListener('jetnote:frozen-split-complete', handler);
          resolve();
        }, 3000);
      });
      native.runPreparedFrozenSplitTransition(target);
      await completed;
      return true;
    } catch (error) {
      console.error('[XToTarget] transition failed', target, error);
      if (!targetPrepared) {
        try { await prepareTarget?.(); } catch (_) {}
      }
      return false;
    } finally {
      if (coverReadyHandler) window.removeEventListener('jetnote:frozen-cover-ready', coverReadyHandler);
      busy = false;
    }
  }

  function waitForNativeTargetPreparation(action) {
    return new Promise(resolve => {
      const handler = event => {
        if (event?.detail?.action !== action) return;
        window.removeEventListener('jetnote:native-target-prepared', handler);
        resolve();
      };
      window.addEventListener('jetnote:native-target-prepared', handler);
      window.JetNoteNative?.completeNativeSourceToEditor?.();
    });
  }

  return Object.freeze({
    run,
    toHome: prepare => run('x_to_home', prepare),
    toEditor: prepare => run('x_to_editor', prepare),
    nativeSourceToEditor: sourceZ => run('x_to_editor', () => waitForNativeTargetPreparation('editor'), sourceZ),
    isBusy: () => busy,
  });
})();

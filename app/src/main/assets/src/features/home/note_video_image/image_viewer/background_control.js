(function () {
  'use strict';

  let backgroundIndex = 0;
  let colorProbe = null;


  function configuration() {
    return (
      window.JetNoteImageViewerConfiguration?.state || {
        backgroundColorCycle: [],
        defaultBackgroundColorIndex: 0
      }
    );
  }


  function backgroundColors() {
    const colors =
      configuration().backgroundColorCycle;

    return Array.isArray(colors)
      ? colors
      : [];
  }


  function normalizeIndex() {
    const colors = backgroundColors();

    if (!colors.length) {
      backgroundIndex = 0;
      return 0;
    }

    backgroundIndex =
      (
        (backgroundIndex % colors.length) +
        colors.length
      ) % colors.length;

    return backgroundIndex;
  }


  function initialize() {
    const config = configuration();
    const colors = backgroundColors();

    if (!colors.length) {
      backgroundIndex = 0;
      return;
    }

    const configuredIndex =
      Number(config.defaultBackgroundColorIndex);

    backgroundIndex =
      Number.isFinite(configuredIndex)
        ? Math.trunc(configuredIndex)
        : 0;

    normalizeIndex();
  }


  function resolveControlColor(background) {
    if (!colorProbe) {
      colorProbe =
        document.createElement('span');

      colorProbe.style.position = 'fixed';
      colorProbe.style.width = '0';
      colorProbe.style.height = '0';
      colorProbe.style.visibility = 'hidden';
      colorProbe.style.pointerEvents = 'none';

      document.body.appendChild(colorProbe);
    }

    colorProbe.style.color =
      String(background);

    const resolved =
      getComputedStyle(colorProbe).color;

    const match = resolved.match(
      /rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i
    );

    if (!match) {
      return '#ffffff';
    }

    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);

    const luminance =
      0.2126 * r +
      0.7152 * g +
      0.0722 * b;

    return luminance >= 180
      ? '#000000'
      : '#ffffff';
  }


  function parseRgb(color) {
    const match = String(color || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  }

  function inverseRgb(rgb) {
    if (!rgb) return null;
    return `rgb(${255-Math.round(rgb[0])}, ${255-Math.round(rgb[1])}, ${255-Math.round(rgb[2])})`;
  }

  function sampledInverseAtControl(image, control, fallback) {
    if (!image?.classList.contains('active') || !control || !image.naturalWidth || !image.naturalHeight) return fallback;
    const ir=image.getBoundingClientRect(), cr=control.getBoundingClientRect();
    const x=cr.left+cr.width/2, y=cr.top+cr.height/2;
    if(x<ir.left||x>ir.right||y<ir.top||y>ir.bottom||ir.width<=0||ir.height<=0)return fallback;
    try {
      const sx=Math.max(0,Math.min(image.naturalWidth-1,Math.round((x-ir.left)/ir.width*image.naturalWidth)));
      const sy=Math.max(0,Math.min(image.naturalHeight-1,Math.round((y-ir.top)/ir.height*image.naturalHeight)));
      const canvas=document.createElement('canvas'); canvas.width=5; canvas.height=5;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,Math.max(0,sx-2),Math.max(0,sy-2),5,5,0,0,5,5);
      const data=ctx.getImageData(0,0,5,5).data; let r=0,g=0,b=0,n=0;
      for(let i=0;i<data.length;i+=4){if(data[i+3]){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}
      return n ? inverseRgb([r/n,g/n,b/n]) : fallback;
    } catch (_) { return fallback; }
  }


  function apply() {
    const viewer =
      document.getElementById('imageViewer');

    const image =
      document.getElementById('imageViewerImg');

    const button =
      document.getElementById(
        'imageViewerBackgroundSwitch'
      );

    const colors = backgroundColors();

    const imageActive =
      !!image?.classList.contains('active');

    if (button) {
      button.classList.toggle(
        'is-hidden',
        !imageActive || colors.length < 2
      );
    }

    if (
      !viewer ||
      !imageActive ||
      !colors.length
    ) {
      return;
    }

    const background =
      colors[normalizeIndex()];

    viewer.style.background =
      background;

    /*
     * Keep both upper-right controls visible throughout
     * the background cycle.
     *
     * Do not use mix-blend-mode: difference.
     * On a mid-gray background (#808080), white difference
     * blends to nearly the same gray and appears to vanish.
     */
    const controlColor = resolveControlColor(background);
    const backgroundRgb = (() => {
      colorProbe.style.color=String(background);
      return parseRgb(getComputedStyle(colorProbe).color);
    })();
    const backgroundInverse = inverseRgb(backgroundRgb) || controlColor;
    const closeButton=document.querySelector('.image-viewer-close');
    const switchButton=document.getElementById('imageViewerBackgroundSwitch');
    // If a control sits over the actual image, derive its color from the pixels
    // underneath it. Otherwise use the viewer background's inverse color.
    viewer.style.setProperty('--image-viewer-close-color',sampledInverseAtControl(image,closeButton,backgroundInverse));
    viewer.style.setProperty('--image-viewer-switch-color',sampledInverseAtControl(image,switchButton,backgroundInverse));
    viewer.style.setProperty('--image-viewer-control-color',backgroundInverse);
  }


  function reset() {
    const viewer =
      document.getElementById('imageViewer');

    const button =
      document.getElementById(
        'imageViewerBackgroundSwitch'
      );

    if (viewer) {
      viewer.style.removeProperty(
        'background'
      );

      viewer.style.removeProperty('--image-viewer-control-color');
      viewer.style.removeProperty('--image-viewer-close-color');
      viewer.style.removeProperty('--image-viewer-switch-color');
    }

    if (button) {
      button.classList.add('is-hidden');
    }
  }


  function cycle(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const colors = backgroundColors();

    const image =
      document.getElementById('imageViewerImg');

    if (
      !image?.classList.contains('active') ||
      colors.length < 2
    ) {
      return;
    }

    backgroundIndex =
      (normalizeIndex() + 1) %
      colors.length;

    apply();
  }


  function install() {
    initialize();

    const button =
      document.getElementById(
        'imageViewerBackgroundSwitch'
      );

    if (!button) {
      return;
    }

    const label =
      window.JetNoteLanguage?.text?.(
        'imageViewerSwitchBackground',
        null,
        ''
      ) ||
      window.JET_NOTE_VIEWER_STRINGS
        ?.switchBackground ||
      '';

    if (label) {
      button.setAttribute(
        'aria-label',
        String(label)
      );
    }

    button.addEventListener(
      'pointerdown',
      event => {
        event.stopPropagation();
      }
    );

    button.addEventListener(
      'click',
      cycle
    );

    button.addEventListener(
      'contextmenu',
      event => {
        event.preventDefault();
      }
    );

    apply();
  }


  window.JetNoteImageViewerBackgroundControl =
    Object.freeze({
      install,
      apply,
      reset,
      cycle,
      initialize
    });
})();
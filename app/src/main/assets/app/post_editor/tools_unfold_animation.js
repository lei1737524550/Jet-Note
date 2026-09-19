(function(){
  'use strict';
  function apply({expanded,buttons}) {
    buttons.forEach((button, index) => {
      button.classList.remove('toolbox-tool-unfolding');
      if (!expanded) return;
      button.style.setProperty('--toolbox-unfold-delay', `${index * 28}ms`);
      void button.offsetWidth;
      button.classList.add('toolbox-tool-unfolding');
    });
  }
  window.JetNoteToolboxUnfoldAnimation = Object.freeze({apply});
})();

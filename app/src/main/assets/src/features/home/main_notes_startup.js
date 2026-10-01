/* Home startup. Feature implementations are loaded explicitly by home.html. */

// Initialize canonical Three Posts, One Body geometry before config.json arrives.
applyThreePostOneBodyConfig();

fetch('config.json', {cache: 'no-store'})
  .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
  .then(config => {
    window.__jetRuntimeConfig = config;
    threePostOneBodyConfig = configuredThreePostOneBody(config);
    homeDisplayConfig = {...HOME_DISPLAY_DEFAULTS, ...(config?.is_display || {})};
    applyThreePostOneBodyConfig();
    renderPosts();
  })
  .catch(() => { /* defaults remain active */ });


function openSettings(){
  cancelDeleteConfirm?.();
  if(typeof closePostActionPanel==='function')closePostActionPanel();
  const screen=document.getElementById('settingsScreen');
  if(screen.parentElement!==document.body)document.body.appendChild(screen);
  screen.classList.add('open');document.body.style.overflow='hidden';applyLanguage();refreshAppearanceSettings?.();
}
function closeSettings(){document.getElementById('settingsScreen')?.classList.remove('open');document.body.style.overflow='';}
function openTools(){
  const screen=document.getElementById('toolsScreen');
  if(screen.parentElement!==document.body)document.body.appendChild(screen);
  screen.classList.add('open');document.body.style.overflow='hidden';
}
function closeTools(){document.getElementById('toolsScreen')?.classList.remove('open');document.body.style.overflow='';}

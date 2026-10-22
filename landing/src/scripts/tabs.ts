/** Accessible tabs: [data-tabs] holds role="tab" buttons (aria-controls → panel id). Arrow keys, Home and End move. */
export function initTabs() {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((list) => {
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const select = (tab: HTMLButtonElement, focus: boolean) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls') || '');
        if (panel) {
          panel.hidden = !on;
          if (on) panel.querySelectorAll('.rowIn, .flip').forEach((el, i) => {
            el.classList.remove('rowIn'); void (el as HTMLElement).offsetWidth; el.classList.add('rowIn');
            (el as HTMLElement).style.animationDelay = i * 18 + 'ms';
          });
        }
      });
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        const n = tabs.length;
        const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
          : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
        if (to < 0) return;
        e.preventDefault();
        select(tabs[to], true);
      });
    });
  });
}

/** Information desk: topic chips and a search box filter the answer cards and keep each chip's count current. */
export function initDesk() {
  const desk = document.getElementById('faq');
  if (!desk) return;
  const input = desk.querySelector<HTMLInputElement>('[data-desk-search]');
  const chips = [...desk.querySelectorAll<HTMLButtonElement>('[data-topic]')];
  const cards = [...desk.querySelectorAll<HTMLElement>('[data-faq]')];
  const empty = desk.querySelector<HTMLElement>('[data-desk-empty]');
  const echo = desk.querySelector<HTMLElement>('[data-desk-query]');
  let topic = 'all';
  const text = cards.map((c) => (c.textContent || '').toLowerCase());
  const run = () => {
    const q = (input?.value || '').trim().toLowerCase();
    const hit = (i: number) => !q || text[i].includes(q);
    let shown = 0;
    cards.forEach((c, i) => {
      const on = (topic === 'all' || c.dataset.faq === topic) && hit(i);
      c.hidden = !on;
      if (on) shown++;
    });
    chips.forEach((chip) => {
      const t = chip.dataset.topic!;
      const n = cards.filter((c, i) => (t === 'all' || c.dataset.faq === t) && hit(i)).length;
      const count = chip.querySelector('[data-count]');
      if (count) count.textContent = String(n);
      chip.setAttribute('aria-pressed', String(t === topic));
    });
    if (empty) empty.hidden = shown > 0;
    if (echo) echo.textContent = input?.value.trim() || '';
  };
  chips.forEach((chip) => chip.addEventListener('click', () => { topic = chip.dataset.topic!; run(); }));
  input?.addEventListener('input', run);
  run();
}

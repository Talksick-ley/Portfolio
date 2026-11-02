/* ============================================================
   COURSEWORK.JS: marks records and project slots
   - "Add row" copies the last row of a CATs/Exams table.
   - "Add project" copies the <template> inside a Practicals block.
   - "Remove" deletes one project slot.
   Nothing here stores data: entries live only in the open page.
   ============================================================ */
(function () {
  'use strict';

  // Marks tables: add a blank row
  document.querySelectorAll('[data-add-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tbody = btn.parentElement.querySelector('table tbody');
      if (!tbody || !tbody.rows.length) return;
      const row = tbody.rows[tbody.rows.length - 1].cloneNode(true);
      row.querySelectorAll('input').forEach((input) => { input.value = ''; });
      tbody.appendChild(row);
      row.querySelector('input').focus();
    });
  });

  // Practicals: project slots
  document.querySelectorAll('[data-project-block]').forEach((block) => {
    const list = block.querySelector('[data-project-list]');
    const template = block.querySelector('template');
    const empty = block.querySelector('[data-empty]');
    const addBtn = block.querySelector('[data-add-project]');
    if (!list || !template || !addBtn) return;

    const sync = () => { if (empty) empty.hidden = list.children.length > 0; };

    addBtn.addEventListener('click', () => {
      const item = template.content.firstElementChild.cloneNode(true);
      list.appendChild(item);
      sync();
      item.querySelector('input').focus();
    });

    list.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      remove.closest('li').remove();
      sync();
      addBtn.focus();
    });

    sync();
  });
})();

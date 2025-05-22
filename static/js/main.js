// static/js/main.js

// Ключ для localStorage
const STORAGE_KEY = 'trainingFormData';

// Показать/скрыть overlay со спиннером
function showOverlay() {
  const ov = document.getElementById('overlay');
  if (ov) ov.style.display = 'flex';
}
function hideOverlay() {
  const ov = document.getElementById('overlay');
  if (ov) ov.style.display = 'none';
}

// Сохранить данные формы в localStorage
function saveForm() {
  const data = {
    type:        document.getElementById('typeSelect')?.value || '',
    date:        document.getElementById('dateInput')?.value || '',
    start:       document.getElementById('startInput')?.value || '',
    end:         document.getElementById('endInput')?.value || '',
    room:        document.getElementById('roomSelect')?.value || '',
    trainer:     document.getElementById('trainerSelect')?.value || '',
    participants:document.getElementById('idsInput')?.value || ''
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Загрузить данные формы из localStorage
function loadForm() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  const data = JSON.parse(saved);

  const fields = [
    { id: 'typeSelect',   val: data.type },
    { id: 'dateInput',    val: data.date },
    { id: 'startInput',   val: data.start },
    { id: 'endInput',     val: data.end },
    { id: 'roomSelect',   val: data.room },
    { id: 'trainerSelect',val: data.trainer },
    { id: 'idsInput',     val: data.participants }
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) el.value = f.val;
  });
}

// Переопределяем fetch, чтобы показывать overlay
(function() {
  const orig = window.fetch;
  window.fetch = function(...args) {
    showOverlay();
    return orig.apply(this, args).finally(hideOverlay);
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  // 1) Восстанавливаем форму
  loadForm();

  // 2) Заполняем dropdown-ы
  async function fill(id, url) {
    const sel = document.getElementById(id);
    if (!sel) return;
    try {
      const arr = await (await fetch(url)).json();
      arr.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
    } catch (e) {
      console.error(`Error loading ${url}`, e);
    }
  }
  fill('typeSelect',    '/api/options/types');
  fill('roomSelect',    '/api/options/rooms');
  fill('trainerSelect', '/api/options/trainers');

  // 3) Подписываемся на input, чтобы автосохранение работало
  ['typeSelect','dateInput','startInput','endInput','roomSelect','trainerSelect','idsInput']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', saveForm);
    });

  // 4) Кнопка "Очистити форму"
  const clearBtn = document.getElementById('clearForm');
  const form     = document.getElementById('form-schedule');
  if (clearBtn && form) {
    clearBtn.addEventListener('click', () => {
      form.reset();
      localStorage.removeItem(STORAGE_KEY);
    });
  }

  // 5) Парсинг Excel-файла
  const fi = document.getElementById('fileInput');
  if (fi) {
    fi.addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      try {
        const ids = await (await fetch('/api/parse_ids', { method:'POST', body: fd })).json();
        document.getElementById('idsInput').value = ids.join(';');
        saveForm();
      } catch (err) {
        console.error('Failed parsing IDs:', err);
      }
    });
  }

  // 6) Сабмит формы
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      saveForm();

      const payload = {
        type:        document.getElementById('typeSelect').value,
        room:        document.getElementById('roomSelect').value,
        trainer:     document.getElementById('trainerSelect').value,
        date:        document.getElementById('dateInput').value,
        start:       document.getElementById('startInput').value,
        end:         document.getElementById('endInput').value,
        participants:document.getElementById('idsInput').value
      };

      try {
        const res  = await fetch('/api/schedule', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          document.getElementById('formError').textContent = data.error || 'Помилка';
        } else {
          // сброс
          form.reset();
          localStorage.removeItem(STORAGE_KEY);
          window.location.href = '/calendar';
        }
      } catch (err) {
        document.getElementById('formError').textContent = 'Network error';
        console.error(err);
      }
    });
  }

  // 7) Инициализация календаря
  const calEl = document.getElementById('calendar');
  if (calEl) {
    const calendar = new FullCalendar.Calendar(calEl, {
      initialView:'dayGridMonth',
      weekNumberCalculation: 'ISO',
      locale:'uk',
      events:'/api/events',
      height:'auto',
        eventClick: info => {
          const e = info.event;
          document.getElementById('modalTitle').textContent    = e.title;
          // старт/енд
          document.getElementById('modalStart').textContent    =
            e.start.toLocaleTimeString('uk',{hour:'2-digit',minute:'2-digit'});
          document.getElementById('modalEnd').textContent      =
            e.end.toLocaleTimeString('uk',{hour:'2-digit',minute:'2-digit'});
          // кімната/тренер
          document.getElementById('modalRoom').textContent     = e.extendedProps.room;
          document.getElementById('modalTrainer').textContent  = e.extendedProps.trainer;
          // учасники
          const ul = document.getElementById('modalParticipants');
          ul.innerHTML = '';
          (e.extendedProps.participants||[]).forEach(n=>{
            const li = document.createElement('li');
            li.textContent = n;
            ul.appendChild(li);
          });
          document.getElementById('eventModal').style.display = 'flex';
          document.body.style.overflowY = 'hidden';
        }
    });
    calendar.render();
    document.getElementById('modalClose').onclick = () => {
      document.getElementById('eventModal').style.display = 'none';
      document.body.style.overflowY = 'auto';
    }
      
  }
});

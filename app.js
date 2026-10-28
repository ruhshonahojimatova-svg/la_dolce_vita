
(() => {
  const cfg = window.RESTAURANT_CONFIG || {};
  const $ = id => document.getElementById(id);
  const money = n =>
    Number(n || 0).toLocaleString('ru-RU') + ' ' + (cfg.CURRENCY || '₽');

  let db = null;
  let dishes = [];
  let cart = new Map();
  let category = 'Все';

  const fallback = [
    {
      id: 'demo1',
      name: 'Маргарита',
      category: 'Пицца',
      price: 590,
      description: 'Томатный соус, моцарелла, базилик.',
      image_url: 'https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=800&q=80',
      available: true
    },
    {
      id: 'demo2',
      name: 'Карбонара',
      category: 'Паста',
      price: 690,
      description: 'Паста, сыр, яйцо и чёрный перец.',
      image_url: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?auto=format&fit=crop&w=800&q=80',
      available: true
    },
    {
      id: 'demo3',
      name: 'Тирамису',
      category: 'Десерты',
      price: 390,
      description: 'Кофейный десерт с маскарпоне и какао.',
      image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80',
      available: true
    }
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(
      () => $('toast').classList.remove('show'),
      2400
    );
  }

  function init() {
    const configured =
      window.supabase &&
      cfg.SUPABASE_URL &&
      !cfg.SUPABASE_URL.includes('ВСТАВЬТЕ') &&
      cfg.SUPABASE_KEY &&
      !cfg.SUPABASE_KEY.includes('ВСТАВЬТЕ');

    if (configured) {
      db = window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_KEY
      );
    }
  }

  function filters() {
    const categories = [
      'Все',
      ...new Set(dishes.map(d => d.category).filter(Boolean))
    ];

    $('filters').innerHTML = categories.map(c => `
      <button class="filter ${c === category ? 'active' : ''}"
              data-cat="${esc(c)}">
        ${esc(c === 'Все' ? 'Всё меню' : c)}
      </button>
    `).join('');
  }

  function render() {
    const list = dishes.filter(d =>
      d.available !== false &&
      (category === 'Все' || d.category === category)
    );

    $('menuGrid').innerHTML = list.map(d => `
      <article class="dish">
        <img src="${esc(d.image_url || '')}"
             alt="${esc(d.name)}"
             loading="lazy"
             onerror="this.style.visibility='hidden'">

        <div class="dish-content">
          <div class="dish-heading">
            <h3>${esc(d.name)}</h3>
            <span class="price">${money(d.price)}</span>
          </div>

          <p>${esc(d.description || '')}</p>

          <button class="add" data-add="${esc(d.id)}">
            ＋ Добавить в заказ
          </button>
        </div>
      </article>
    `).join('');

    $('menuStatus').textContent = list.length
      ? ''
      : dishes.length
        ? 'В этой категории пока нет доступных блюд.'
        : 'Меню пустое. Добавьте блюда через админ-панель.';
  }

  async function load() {
    init();

    if (!db) {
      dishes = fallback;
      $('menuStatus').textContent =
        'Демонстрационное меню. Заполните config.js и запустите SQL, чтобы подключить базу.';
      filters();
      render();
      return;
    }

    const { data, error } = await db
      .from('products')
      .select('id,name,category,price,description,tag,image_url,available')
      .order('sort_order')
      .order('created_at', { ascending: false });

    if (error) {
      dishes = [];
      $('menuStatus').textContent =
        'Не удалось загрузить меню. Проверьте Supabase и политики доступа.';
    } else {
      dishes = data || [];
    }

    filters();
    render();
    cartRender();
  }

  function cartRender() {
    $('cartCount').textContent =
      [...cart.values()].reduce((sum, quantity) => sum + quantity, 0);

    const entries = [...cart.entries()];

    $('cartItems').innerHTML = entries.length
      ? entries.map(([id, quantity]) => {
          const dish = dishes.find(d => String(d.id) === String(id));

          return dish ? `
            <div class="cart-item">
              <span>${esc(dish.name)} × ${quantity}</span>
              <span>
                ${money(dish.price * quantity)}
                <button data-remove="${esc(id)}">Убрать</button>
              </span>
            </div>
          ` : '';
        }).join('')
      : '<p>Корзина пока пуста.</p>';

    const total = entries.reduce((sum, [id, quantity]) => {
      const dish = dishes.find(d => String(d.id) === String(id));
      return sum + (dish ? Number(dish.price) * quantity : 0);
    }, 0);

    $('cartTotal').textContent = money(total);
  }

  $('filters').addEventListener('click', event => {
    const button = event.target.closest('[data-cat]');
    if (!button) return;

    category = button.dataset.cat;
    filters();
    render();
  });

  $('menuGrid').addEventListener('click', event => {
    const button = event.target.closest('[data-add]');
    if (!button) return;

    const dish = dishes.find(
      d => String(d.id) === String(button.dataset.add)
    );

    if (dish) {
      const id = String(dish.id);
      cart.set(id, (cart.get(id) || 0) + 1);
      cartRender();
      toast('Добавлено в заказ ♡');
    }
  });

  $('cartItems').addEventListener('click', event => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;

    cart.delete(String(button.dataset.remove));
    cartRender();
  });

  $('cartButton').onclick = () =>
    $('cartPanel').classList.add('open');

  $('closeCart').onclick = () =>
    $('cartPanel').classList.remove('open');

  $('cartPanel').addEventListener('click', event => {
    if (event.target === $('cartPanel')) {
      $('cartPanel').classList.remove('open');
    }
  });

  function whatsapp(message) {
    const number = String(cfg.WHATSAPP_NUMBER || '').replace(/\D/g, '');

    if (!number || number === '70000000000') {
      toast('Укажите настоящий WhatsApp в config.js.');
      return;
    }

    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener'
    );
  }

  $('checkoutForm').addEventListener('submit', event => {
    event.preventDefault();

    if (!cart.size) {
      toast('Добавьте блюда в заказ.');
      return;
    }

    const lines = [...cart.entries()]
      .map(([id, quantity]) => {
        const dish = dishes.find(d => String(d.id) === String(id));

        return dish
          ? `${dish.name} × ${quantity} — ${money(dish.price * quantity)}`
          : '';
      })
      .filter(Boolean);

    const total = [...cart.entries()].reduce((sum, [id, quantity]) => {
      const dish = dishes.find(d => String(d.id) === String(id));
      return sum + (dish ? dish.price * quantity : 0);
    }, 0);

    whatsapp(
      `Здравствуйте! Заказ LA DOLCE VITA:\n` +
      `${lines.join('\n')}\n` +
      `Итого: ${money(total)}\n` +
      `Имя: ${$('orderName').value}\n` +
      `Телефон: ${$('orderPhone').value}`
    );
  });

  $('reservationForm').addEventListener('submit', event => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const selectedDate = new Date(form.get('date') + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      $('reservationMessage').textContent =
        'Выберите сегодняшнюю или будущую дату.';
      return;
    }

    whatsapp(
      `Здравствуйте! Хочу забронировать столик в LA DOLCE VITA.\n` +
      `Имя: ${form.get('name')}\n` +
      `Телефон: ${form.get('phone')}\n` +
      `Дата: ${form.get('date')}\n` +
      `Время: ${form.get('time')}\n` +
      `Гости: ${form.get('guests')}`
    );

    $('reservationMessage').textContent =
      'Если открылся WhatsApp, отправьте сообщение для подтверждения.';
  });

  $('menuToggle').onclick = () =>
    $('navLinks').classList.toggle('open');

  document.querySelectorAll('#navLinks a').forEach(link => {
    link.onclick = () => $('navLinks').classList.remove('open');
  });

  $('year').textContent = new Date().getFullYear();

  const now = new Date();
  $('date').min =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  load();
})();

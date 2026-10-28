
(() => {
  const cfg = window.RESTAURANT_CONFIG || {};
  const $ = id => document.getElementById(id);
  const money = n =>
    Number(n || 0).toLocaleString('ru-RU') + ' ' + (cfg.CURRENCY || '₽');

  let db = null;
  let user = null;
  let products = [];
  let file = null;
  let previewUrl = null;

  const invalid =
    !window.supabase ||
    !cfg.SUPABASE_URL ||
    !cfg.SUPABASE_KEY ||
    cfg.SUPABASE_URL.includes('ВСТАВЬТЕ') ||
    cfg.SUPABASE_KEY.includes('ВСТАВЬТЕ');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }

  function msg(id, message, ok = false) {
    $(id).textContent = message;
    $(id).style.color = ok ? '#354c39' : '#8e302e';
  }

  function init() {
    if (invalid) {
      $('setupWarning').hidden = false;
      $('loginPanel').hidden = true;
      return;
    }

    db = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_KEY
    );
  }

  async function session() {
    if (!db) return;

    const { data } = await db.auth.getSession();

    if (data.session) {
      await verify(data.session.user);
    }
  }

  function showLogin() {
    $('loginPanel').hidden = false;
    $('dashboard').hidden = true;
    user = null;
  }

  async function verify(currentUser) {
    const { data, error } = await db
      .from('admins')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error || !data) {
      await db.auth.signOut();
      showLogin();

      msg(
        'loginMessage',
        error
          ? 'Не удалось проверить доступ. Проверьте SQL-политики.'
          : 'Нет прав администратора. Добавьте UUID пользователя в таблицу admins.'
      );

      return;
    }

    user = currentUser;
    $('loginPanel').hidden = true;
    $('dashboard').hidden = false;
    $('adminEmail').textContent = currentUser.email || '';

    await load();
  }

  $('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    if (!db) return;

    const button = event.currentTarget.querySelector('button');
    button.disabled = true;

    msg('loginMessage', 'Проверяем данные…', true);

    const { data, error } = await db.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });

    button.disabled = false;

    if (error) {
      msg('loginMessage', 'Ошибка входа: ' + error.message);
      return;
    }

    await verify(data.user);
  });

  $('logoutButton').onclick = async () => {
    await db.auth.signOut();
    reset();
    showLogin();
  };

  $('refreshButton').onclick = load;

  async function load() {
    if (!user) return;

    $('productsList').textContent = 'Загружаем меню…';

    const { data, error } = await db
      .from('products')
      .select('*')
      .order('sort_order')
      .order('created_at', { ascending: false });

    if (error) {
      $('productsList').textContent = 'Ошибка: ' + error.message;
      return;
    }

    products = data || [];
    render();
  }

  function render() {
    if (!products.length) {
      $('productsList').textContent =
        'Меню пока пустое. Добавьте первое блюдо.';
      return;
    }

    $('productsList').innerHTML = products.map(p => `
      <article class="product">
        ${
          p.image_url
            ? `<img src="${esc(p.image_url)}" alt=""
                    onerror="this.style.visibility='hidden'">`
            : '<div></div>'
        }

        <div>
          <div class="prod-title">
            <strong>${esc(p.name)}</strong>
            <span class="prod-price">${money(p.price)}</span>
          </div>

          <div class="meta">${esc(p.category)}</div>

          <span class="state ${p.available ? '' : 'off'}">
            ${p.available ? 'Доступно' : 'Нет в наличии'}
          </span>

          <div class="prod-actions">
            <button data-edit="${esc(p.id)}">Изменить</button>
            <button data-toggle="${esc(p.id)}">
              ${p.available ? 'Скрыть' : 'Показать'}
            </button>
            <button class="del" data-del="${esc(p.id)}">Удалить</button>
          </div>
        </div>
      </article>
    `).join('');
  }

  $('productsList').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;

    const id = button.dataset.edit ||
      button.dataset.toggle ||
      button.dataset.del;

    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;

    if (button.dataset.edit) {
      fill(product);
      return;
    }

    if (button.dataset.toggle) {
      const { error } = await db
        .from('products')
        .update({
          available: !product.available,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id);

      if (error) {
        msg('dashboardMessage', error.message);
      } else {
        msg('dashboardMessage', 'Наличие обновлено.', true);
        await load();
      }

      return;
    }

    if (button.dataset.del) {
      if (!confirm(`Удалить «${product.name}»?`)) return;

      const { error } = await db
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) {
        msg('dashboardMessage', error.message);
        return;
      }

      if (product.image_path) {
        const result = await db.storage
          .from('menu-photos')
          .remove([product.image_path]);

        if (result.error) console.warn(result.error);
      }

      if (String($('productId').value) === String(product.id)) {
        reset();
      }

      msg('dashboardMessage', 'Блюдо удалено.', true);
      await load();
    }
  });

  function fill(product) {
    $('productId').value = product.id;
    $('productName').value = product.name;
    $('productPrice').value = product.price;
    $('productCategory').value = product.category;
    $('productDescription').value = product.description || '';
    $('productTag').value = product.tag || '';
    $('productAvailable').checked = !!product.available;

    $('formTitle').textContent = 'Редактировать блюдо';
    $('saveButton').textContent = 'Сохранить изменения';
    $('cancelEdit').hidden = false;

    file = null;
    $('productPhoto').value = '';

    if (product.image_url) {
      $('photoPreview').src = product.image_url;
      $('photoPreviewWrap').hidden = false;
    } else {
      $('photoPreviewWrap').hidden = true;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() {
    $('productForm').reset();
    $('productId').value = '';
    $('productAvailable').checked = true;

    $('formTitle').textContent = 'Добавить блюдо';
    $('saveButton').textContent = 'Сохранить блюдо';
    $('cancelEdit').hidden = true;
    $('photoPreviewWrap').hidden = true;

    file = null;
    $('productPhoto').value = '';

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    msg('formMessage', '');
  }

  $('cancelEdit').onclick = reset;

  $('clearPhoto').onclick = () => {
    file = null;
    $('productPhoto').value = '';

    const product = products.find(
      p => String(p.id) === String($('productId').value)
    );

    if (product?.image_url) {
      $('photoPreview').src = product.image_url;
      $('photoPreviewWrap').hidden = false;
    } else {
      $('photoPreviewWrap').hidden = true;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  };

  $('productPhoto').addEventListener('change', event => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      msg('formMessage', 'Разрешены JPG, PNG или WebP.');
      event.target.value = '';
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      msg('formMessage', 'Максимальный размер фотографии — 5 МБ.');
      event.target.value = '';
      return;
    }

    file = selected;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    previewUrl = URL.createObjectURL(selected);
    $('photoPreview').src = previewUrl;
    $('photoPreviewWrap').hidden = false;
  });

  async function upload(selectedFile) {
    const extension =
      selectedFile.type === 'image/png' ? 'png' :
      selectedFile.type === 'image/webp' ? 'webp' : 'jpg';

    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error } = await db.storage
      .from('menu-photos')
      .upload(path, selectedFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: selectedFile.type
      });

    if (error) throw error;

    const result = db.storage
      .from('menu-photos')
      .getPublicUrl(path);

    return {
      path,
      url: result.data.publicUrl
    };
  }

  $('productForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!user) return;

    const button = $('saveButton');
    button.disabled = true;

    msg('formMessage', 'Сохраняем…', true);

    const id = $('productId').value;
    const old = products.find(p => String(p.id) === String(id));
    let uploaded = null;

    try {
      let imageUrl = old?.image_url || null;
      let imagePath = old?.image_path || null;

      if (file) {
        uploaded = await upload(file);
        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }

      const payload = {
        name: $('productName').value.trim(),
        price: Number($('productPrice').value),
        category: $('productCategory').value.trim(),
        description: $('productDescription').value.trim(),
        tag: $('productTag').value.trim() || null,
        available: $('productAvailable').checked,
        image_url: imageUrl,
        image_path: imagePath,
        updated_at: new Date().toISOString()
      };

      if (
        !payload.name ||
        !payload.category ||
        !Number.isFinite(payload.price) ||
        payload.price < 0
      ) {
        throw Error('Проверьте название, категорию и цену.');
      }

      const result = id
        ? await db.from('products').update(payload).eq('id', id)
        : await db.from('products').insert({
            ...payload,
            created_by: user.id
          });

      if (result.error) throw result.error;

      if (old?.image_path && file) {
        const result = await db.storage
          .from('menu-photos')
          .remove([old.image_path]);

        if (result.error) console.warn(result.error);
      }

      msg(
        'dashboardMessage',
        id ? 'Изменения сохранены.' : 'Блюдо добавлено.',
        true
      );

      reset();
      await load();
    } catch (error) {
      if (uploaded?.path) {
        const result = await db.storage
          .from('menu-photos')
          .remove([uploaded.path]);

        if (result.error) console.warn(result.error);
      }

      msg('formMessage', 'Ошибка: ' + (error.message || 'не удалось сохранить'));
    } finally {
      button.disabled = false;
    }
  });

  init();
  session();
})();
ы

/**
 * @typedef {Object} DockerContainer
 * @property {string} id
 * @property {string} image
 * @property {string} status
 * @property {string} name
 * @property {string} state
 */

/**
 * @typedef {Object} DockerImage
 * @property {string} id
 * @property {string} repository
 * @property {string} tag
 * @property {string} [size]
 * @property {string} [createdSince]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} DockerVolume
 * @property {string} name
 * @property {string} driver
 * @property {string} mountpoint
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} TextPayload
 * @property {string} [content]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ContainerDetail
 * @property {TextPayload} logs
 * @property {TextPayload} inspect
 * @property {TextPayload} stats
 */

/**
 * @typedef {Object} ImageDetail
 * @property {TextPayload} inspect
 * @property {TextPayload} history
 */

/**
 * @typedef {Object} VolumeDetail
 * @property {TextPayload} inspect
 */

/**
 * @typedef {Object} BootstrapPayload
 * @property {string} locale
 * @property {Record<string, Record<string, string>>} translations
 * @property {string[]} supportedLocales
 */

/**
 * Основной контроллер пользовательского интерфейса панели.
 */
class DashboardApp {
  /**
   * @param {any} vscodeApi VS Code webview API
   * @param {BootstrapPayload} bootstrap данные, полученные из расширения
   */
  constructor(vscodeApi, bootstrap) {
    this.vscode = vscodeApi;
    this.translations = bootstrap.translations || {};
    this.supportedLocales = bootstrap.supportedLocales || Object.keys(this.translations) || ['en'];
    this.locale = this.supportedLocales.includes(bootstrap.locale) ? bootstrap.locale : this.supportedLocales[0];

    /** @type {{containers: DockerContainer[]; images: DockerImage[]; volumes: DockerVolume[]; generatedAt: string}} */
    this.state = { containers: [], images: [], volumes: [], generatedAt: '' };
    this.selected = { container: '', image: '', volume: '' };
    this.activeResource = 'container';
    this.activeTabs = { container: 'logs', image: 'inspect', volume: 'inspect' };
    this.statusSnapshot = { text: '', loading: true };
    this.scale = 1;
    this.splitState = { container: 52, image: 50, volume: 50 };
    this.currentContainer = null;
    this.containerLogState = Object.create(null);
    this.logStep = 200;

    this.dom = {
      resourceTabs: [],
      resourceViews: [],
      splitters: { container: null, image: null, volume: null },
      viewMap: {},
      status: null,
      refreshButton: null,
      languageSelect: null,
      scaleSelect: null,
      logMoreButton: null,
      counts: { container: null, image: null, volume: null },
      tables: { container: null, image: null, volume: null },
      empty: { container: null, image: null, volume: null },
      errors: { container: null, image: null, volume: null },
      placeholders: { container: null, image: null, volume: null },
      detailCards: { container: null, image: null, volume: null },
      detailTitles: { container: null, image: null, volume: null },
      detailMeta: {
        container: { id: null, image: null, status: null },
        image: { id: null, created: null, size: null },
        volume: { driver: null, mount: null, created: null }
      },
      detailUpdated: { container: null, image: null, volume: null },
      actionGroups: { container: [], image: [], volume: [] },
      tabNavs: { container: [], image: [], volume: [] },
      tabPanels: { container: [], image: [], volume: [] }
    };
  }

  /** Заводим UI. */
  init() {
    this.cacheDom();
    this.applyScale(this.scale);
    this.applyTranslations();
    this.setActiveResource(this.activeResource);
    this.bindEvents();
    this.initSplitters();
    this.updateStatus(this.t('status.loading'), true);
    this.vscode.postMessage({ type: 'refresh' });
    window.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  /** Сохраняем ссылки на элементы DOM. */
  cacheDom() {
    this.dom.resourceTabs = Array.from(document.querySelectorAll('#resource-tabs button'));
    this.dom.resourceViews = Array.from(document.querySelectorAll('[data-resource-view]'));
    this.dom.status = document.getElementById('status');
    this.dom.refreshButton = document.getElementById('refresh');
    this.dom.languageSelect = document.getElementById('language-select');
    this.dom.scaleSelect = document.getElementById('scale-select');

    this.dom.counts = {
      container: document.getElementById('container-count'),
      image: document.getElementById('image-count'),
      volume: document.getElementById('volume-count')
    };

    this.dom.tables = {
      container: document.getElementById('container-body'),
      image: document.getElementById('image-body'),
      volume: document.getElementById('volume-body')
    };

    this.dom.empty = {
      container: document.getElementById('container-empty'),
      image: document.getElementById('image-empty'),
      volume: document.getElementById('volume-empty')
    };

    this.dom.errors = {
      container: document.getElementById('container-error'),
      image: document.getElementById('image-error'),
      volume: document.getElementById('volume-error')
    };

    this.dom.placeholders = {
      container: document.getElementById('container-placeholder'),
      image: document.getElementById('image-placeholder'),
      volume: document.getElementById('volume-placeholder')
    };

    this.dom.detailCards = {
      container: document.getElementById('container-detail'),
      image: document.getElementById('image-detail'),
      volume: document.getElementById('volume-detail')
    };

    this.dom.detailTitles = {
      container: document.getElementById('container-detail-name'),
      image: document.getElementById('image-detail-name'),
      volume: document.getElementById('volume-detail-name')
    };

    this.dom.detailMeta = {
      container: {
        id: document.getElementById('container-detail-id'),
        image: document.getElementById('container-detail-image'),
        status: document.getElementById('container-detail-status')
      },
      image: {
        id: document.getElementById('image-detail-id'),
        created: document.getElementById('image-detail-created'),
        size: document.getElementById('image-detail-size')
      },
      volume: {
        driver: document.getElementById('volume-detail-driver'),
        mount: document.getElementById('volume-detail-mount'),
        created: document.getElementById('volume-detail-created')
      }
    };

    this.dom.detailUpdated = {
      container: document.getElementById('container-detail-updated'),
      image: document.getElementById('image-detail-updated'),
      volume: document.getElementById('volume-detail-updated')
    };

    this.dom.actionGroups = {
      container: Array.from(document.querySelectorAll('#container-actions [data-action]')),
      image: Array.from(document.querySelectorAll('#image-actions [data-image-action]')),
      volume: Array.from(document.querySelectorAll('#volume-actions [data-volume-action]'))
    };

    this.dom.tabNavs = {
      container: Array.from(document.querySelectorAll('#container-tabs [data-container-tab]')),
      image: Array.from(document.querySelectorAll('#image-tabs [data-image-tab]')),
      volume: Array.from(document.querySelectorAll('#volume-tabs [data-volume-tab]'))
    };

    this.dom.tabPanels = {
      container: Array.from(document.querySelectorAll('[data-container-panel]')),
      image: Array.from(document.querySelectorAll('[data-image-panel]')),
      volume: Array.from(document.querySelectorAll('[data-volume-panel]'))
    };

    this.dom.splitters = {
      container: document.querySelector('[data-splitter="container"]'),
      image: document.querySelector('[data-splitter="image"]'),
      volume: document.querySelector('[data-splitter="volume"]')
    };

    this.dom.logMoreButton = document.querySelector('#container-log-toolbar [data-action="logs-more"]');
    if (this.dom.logMoreButton) {
      this.dom.logMoreButton.disabled = true;
    }

    this.dom.viewMap = {};
    this.dom.resourceViews.forEach((view) => {
      const resource = view.dataset.resourceView;
      if (resource) {
        this.dom.viewMap[resource] = view;
      }
    });

    if (this.dom.scaleSelect) {
      const numeric = parseFloat(this.dom.scaleSelect.value);
      if (!Number.isNaN(numeric)) {
        this.scale = numeric;
      }
    }
  }

  /** Назначаем обработчики. */
  bindEvents() {
    this.dom.resourceTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const resource = tab.dataset.resource;
        if (!resource || resource === this.activeResource) return;
        this.setActiveResource(resource);
      });
    });

    this.attachTableHandler('container', (id) => this.selectContainerById(id));
    this.attachTableHandler('image', (id) => this.selectImageById(id));
    this.attachTableHandler('volume', (id) => this.selectVolumeByName(id));

    this.dom.actionGroups.container.forEach((button) => {
      button.addEventListener('click', (event) => {
        const element = /** @type {HTMLElement} */ (event.currentTarget);
        const action = element.dataset.action;
        const containerId = element.dataset.containerId;
        if (!action || !containerId) return;
        const container = this.state.containers.find((item) => item.id === containerId);
        if (!container) return;
        if (action === 'exec') {
          this.vscode.postMessage({ type: 'exec', container });
          return;
        }
        this.updateStatus(this.t('status.performingAction', { action: this.t(`containers.actions.${action}`) }), true);
        this.vscode.postMessage({ type: 'containerAction', action, container });
      });
    });

    this.dom.actionGroups.image.forEach((button) => {
      button.addEventListener('click', (event) => {
        const element = /** @type {HTMLElement} */ (event.currentTarget);
        const action = element.dataset.imageAction;
        const imageId = element.dataset.imageId;
        if (!action || !imageId) return;
        const image = this.state.images.find((item) => item.id === imageId);
        if (!image) return;
        this.updateStatus(this.t('status.performingAction', { action: this.t('images.actions.remove') }), true);
        this.vscode.postMessage({ type: 'imageAction', action, image });
      });
    });

    this.dom.actionGroups.volume.forEach((button) => {
      button.addEventListener('click', (event) => {
        const element = /** @type {HTMLElement} */ (event.currentTarget);
        const action = element.dataset.volumeAction;
        const volumeName = element.dataset.volumeName;
        if (!action || !volumeName) return;
        const volume = this.state.volumes.find((item) => item.name === volumeName);
        if (!volume) return;
        this.updateStatus(this.t('status.performingAction', { action: this.t('volumes.actions.remove') }), true);
        this.vscode.postMessage({ type: 'volumeAction', action, volume });
      });
    });

    this.attachTabHandler('container');
    this.attachTabHandler('image');
    this.attachTabHandler('volume');

    if (this.dom.refreshButton) {
      this.dom.refreshButton.addEventListener('click', () => {
        this.updateStatus(this.t('status.refreshing'), true);
        this.vscode.postMessage({ type: 'refresh' });
      });
    }

    if (this.dom.languageSelect) {
      this.dom.languageSelect.addEventListener('change', () => {
        const newLocale = this.dom.languageSelect.value;
        if (!this.supportedLocales.includes(newLocale) || newLocale === this.locale) {
          this.dom.languageSelect.value = this.locale;
          return;
        }
        this.locale = newLocale;
        this.applyTranslations();
        this.updateStatus(this.t('status.loading'), true);
        this.vscode.postMessage({ type: 'changeLocale', locale: newLocale });
      });
    }

    if (this.dom.scaleSelect) {
      this.dom.scaleSelect.addEventListener('change', () => {
        this.applyScale(this.dom.scaleSelect.value);
      });
    }

    if (this.dom.logMoreButton) {
      this.dom.logMoreButton.addEventListener('click', () => {
        this.requestMoreLogs();
      });
    }
  }

  /** Инициализация сплиттеров (ресайз колонок). */
  initSplitters() {
    ['container', 'image', 'volume'].forEach((resource) => {
      this.applySplit(resource, this.splitState[resource]);
      const splitter = this.dom.splitters[resource];
      const view = this.dom.viewMap[resource];
      if (!splitter || !view) return;

      splitter.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        splitter.classList.add('active');
        const rect = view.getBoundingClientRect();
        const onMove = (moveEvent) => {
          const percent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
          this.applySplit(resource, percent);
        };
        const onUp = () => {
          splitter.classList.remove('active');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
  }

  /** Применяет сохранённый размер колонок. */
  applySplit(resource, percent) {
    const view = this.dom.viewMap[resource];
    if (!view) return;
    const left = Math.min(80, Math.max(20, percent ?? this.splitState[resource] ?? 50));
    this.splitState[resource] = left;
    view.style.gridTemplateColumns = `${left}% 12px ${100 - left}%`;
  }

  /** Обработка входящих сообщений от расширения. */
  handleMessage(message) {
    switch (message?.type) {
      case 'state':
        this.renderContainers(message.containers ?? [], message.generatedAt ?? '');
        this.renderImages(message.images ?? []);
        this.renderVolumes(message.volumes ?? []);
        this.updateStatus(this.t('status.updated', { timestamp: message.generatedAt ?? '—' }), false);
        this.cleanupSelections();
        break;
      case 'detail':
        this.renderDetails(message);
        break;
      case 'error':
        this.updateStatus(message.message ?? this.t('status.loadingError'), false);
        this.showError(message.message ?? this.t('status.loadingError'));
        break;
      case 'status':
        this.updateStatus(message.text ?? '', Boolean(message.isLoading));
        break;
      case 'actionResult':
        this.updateStatus(message.text ?? '', false);
        break;
      case 'logsMore':
        this.handleLogsMore(message);
        break;
      default:
        break;
    }
  }

  /** Применяет переводы ко всем элементам. */
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      if (!key) return;
      element.textContent = this.t(key);
    });

    document.querySelectorAll('[data-prefix]').forEach((element) => {
      const value = element.dataset.cachedValue ?? '';
      element.textContent = `${this.t(element.dataset.prefix)}${value}`;
    });

    if (this.dom.languageSelect) {
      Array.from(this.dom.languageSelect.options).forEach((option) => {
        option.textContent = this.t(`language.option.${option.value}`);
      });
      this.dom.languageSelect.value = this.locale;
    }

    if (this.dom.scaleSelect) {
      Array.from(this.dom.scaleSelect.options).forEach((option) => {
        option.textContent = this.t(`scale.option.${option.value}`);
      });
      this.dom.scaleSelect.value = String(this.scale);
    }

    this.updateCounts();
    this.updateStatus(this.statusSnapshot.text, this.statusSnapshot.loading, true);
    ['container', 'image', 'volume'].forEach((resource) => this.updateTabState(resource));
  }

  /** Применяет масштабирование интерфейса. */
  applyScale(value) {
    const numeric = parseFloat(String(value));
    if (Number.isFinite(numeric) && numeric > 0) {
      this.scale = numeric;
      document.documentElement.style.setProperty('--dashboard-zoom', String(numeric));
    }
    if (this.dom.scaleSelect) {
      this.dom.scaleSelect.value = String(this.scale);
    }
  }

  /**
   * Запрашивает у расширения дополнительную порцию логов.
   */
  requestMoreLogs() {
    if (!this.currentContainer || !this.selected.container) {
      return;
    }
    const current = this.containerLogState[this.selected.container]?.lines ?? 0;
    const target = current + this.logStep;
    this.updateStatus(this.t('status.refreshing'), true);
    this.vscode.postMessage({
      type: 'loadMoreLogs',
      container: this.currentContainer,
      lines: current,
      target
    });
  }

  /** Возвращает локализованную строку. */
  t(key, params) {
    const dict = this.translations[this.locale] || this.translations[this.supportedLocales[0]] || {};
    const fallback = this.translations[this.supportedLocales[0]] || {};
    const template = dict[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return Object.entries(params).reduce(
      (acc, [token, value]) => acc.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value)),
      template
    );
  }

  /** Обновляет индикатор состояния. */
  updateStatus(text, loading, preserveText = false) {
    this.statusSnapshot = {
      text: preserveText ? this.statusSnapshot.text : text,
      loading
    };
    const content = preserveText ? this.statusSnapshot.text : text;
    if (this.dom.status) {
      this.dom.status.textContent = content || (loading ? this.t('status.loading') : '');
      this.dom.status.dataset.loading = loading ? 'true' : 'false';
    }
    if (this.dom.refreshButton) {
      this.dom.refreshButton.disabled = Boolean(loading);
    }
  }

  /** Устанавливает активный ресурс (список + детали). */
  setActiveResource(resource) {
    this.activeResource = resource;
    this.dom.resourceTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.resource === resource);
    });
    this.dom.resourceViews.forEach((view) => {
      view.hidden = view.dataset.resourceView !== resource;
    });
    this.applySplit(resource, this.splitState[resource]);
  }

  /** Присоединяет обработчик к таблице ресурса. */
  attachTableHandler(resource, handler) {
    const body = this.dom.tables[resource];
    if (!body) return;
    body.addEventListener('click', (event) => {
      const row = event.target.closest('tr');
      if (!row?.dataset.id) return;
      handler(row.dataset.id);
    });
  }

  /** Настраивает переключение вкладок для ресурса. */
  attachTabHandler(resource) {
    const navs = this.dom.tabNavs[resource];
    navs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset[`${resource}Tab`];
        if (!target) return;
        this.activeTabs[resource] = target;
        this.updateTabState(resource);
      });
    });
  }

  /** Обновляет визуальное состояние вкладок. */
  updateTabState(resource) {
    const navs = this.dom.tabNavs[resource];
    const panels = this.dom.tabPanels[resource];
    const current = this.activeTabs[resource];
    navs.forEach((tab) => tab.classList.toggle('active', tab.dataset[`${resource}Tab`] === current));
    panels.forEach((panel) => panel.classList.toggle('active', panel.dataset[`${resource}Panel`] === current));
  }

  getTabPanel(resource, key) {
    return this.dom.tabPanels[resource].find((panel) => panel.dataset[`${resource}Panel`] === key) || null;
  }

  countLines(text) {
    if (!text) return 0;
    return text.split(/\r?\n/).filter((line) => line.length > 0).length;
  }

  /**
   * Обновляет список контейнеров.
   * @param {DockerContainer[]} containers
   * @param {string} generatedAt
   */
  renderContainers(containers, generatedAt) {
    this.state.containers = containers;
    this.state.generatedAt = generatedAt;
    this.fillTable('container', containers, ({ row, item }) => {
      row.dataset.id = item.id;
      row.innerHTML = `
        <td>${item.name || item.id}</td>
        <td>${item.image || '—'}</td>
        <td>${item.status || '—'}</td>
      `;
    });
  }

  /**
   * Обновляет список образов.
   * @param {DockerImage[]} images
   */
  renderImages(images) {
    this.state.images = images;
    this.fillTable('image', images, ({ row, item }) => {
      row.dataset.id = item.id;
      row.innerHTML = `
        <td>${item.repository}</td>
        <td>${item.tag}</td>
        <td>${item.size || '—'}</td>
        <td>${item.createdSince || item.createdAt || '—'}</td>
      `;
    });
  }

  /**
   * Обновляет список томов.
   * @param {DockerVolume[]} volumes
   */
  renderVolumes(volumes) {
    this.state.volumes = volumes;
    this.fillTable('volume', volumes, ({ row, item }) => {
      row.dataset.id = item.name;
      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.driver}</td>
        <td>${item.mountpoint || '—'}</td>
      `;
    });
  }

  /** Отрисовывает таблицу ресурса. */
  fillTable(resource, items, renderer) {
    const body = this.dom.tables[resource];
    const emptyState = this.dom.empty[resource];
    const placeholder = this.dom.placeholders[resource];
    const detailCard = this.dom.detailCards[resource];

    if (!body) return;
    body.innerHTML = '';

    if (!items.length) {
      if (emptyState) emptyState.hidden = false;
      if (placeholder) placeholder.hidden = false;
      if (detailCard) detailCard.hidden = true;
      this.highlightSelection(resource, '');
      this.updateCounts();
      return;
    }

    if (emptyState) emptyState.hidden = true;
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const row = document.createElement('tr');
      renderer({ row, item });
      fragment.appendChild(row);
    });
    body.appendChild(fragment);
    this.highlightSelection(resource, this.selected[resource]);
    this.updateCounts();
  }

  /** Обновляет числовые бейджи. */
  updateCounts() {
    if (this.dom.counts.container) this.dom.counts.container.textContent = String(this.state.containers.length);
    if (this.dom.counts.image) this.dom.counts.image.textContent = String(this.state.images.length);
    if (this.dom.counts.volume) this.dom.counts.volume.textContent = String(this.state.volumes.length);
  }

  /** Подсвечивает выбранную строку. */
  highlightSelection(resource, id) {
    const body = this.dom.tables[resource];
    if (!body) return;
    Array.from(body.querySelectorAll('tr')).forEach((row) => {
      row.classList.toggle('selected', Boolean(id) && row.dataset.id === id);
    });
  }

  /** Очищает выбор, если элемент исчез из списка. */
  cleanupSelections() {
    if (this.selected.container && !this.state.containers.find((c) => c.id === this.selected.container)) {
      this.selected.container = '';
      if (this.dom.placeholders.container) this.dom.placeholders.container.hidden = false;
      if (this.dom.detailCards.container) this.dom.detailCards.container.hidden = true;
      this.highlightSelection('container', '');
      if (this.dom.logMoreButton) this.dom.logMoreButton.disabled = true;
    }
    if (this.selected.image && !this.state.images.find((c) => c.id === this.selected.image)) {
      this.selected.image = '';
      if (this.dom.placeholders.image) this.dom.placeholders.image.hidden = false;
      if (this.dom.detailCards.image) this.dom.detailCards.image.hidden = true;
      this.highlightSelection('image', '');
    }
    if (this.selected.volume && !this.state.volumes.find((c) => c.name === this.selected.volume)) {
      this.selected.volume = '';
      if (this.dom.placeholders.volume) this.dom.placeholders.volume.hidden = false;
      if (this.dom.detailCards.volume) this.dom.detailCards.volume.hidden = true;
      this.highlightSelection('volume', '');
    }
  }

  /** Отображает сообщение об ошибке. */
  showError(message) {
    const target = this.dom.errors[this.activeResource];
    if (target) {
      target.hidden = false;
      target.textContent = message || this.t('status.loadingError');
    }
  }

  /** Обновляет карточки деталей в зависимости от сообщения. */
  renderDetails(payload) {
    if (payload.resource === 'container' && payload.container?.id === this.selected.container) {
      if (payload.logStep) {
        this.logStep = payload.logStep;
      }
      this.currentContainer = payload.container;
      if (payload.logLines) {
        this.containerLogState[payload.container.id] = { lines: payload.logLines };
      }
      this.showContainerDetail(payload.container, payload.detail, payload.fetchedAt);
    }
    if (payload.resource === 'image' && payload.image?.id === this.selected.image) {
      this.showImageDetail(payload.image, payload.detail, payload.fetchedAt);
    }
    if (payload.resource === 'volume' && payload.volume?.name === this.selected.volume) {
      this.showVolumeDetail(payload.volume, payload.detail, payload.fetchedAt);
    }
  }

  /** Выбор контейнера. */
  selectContainerById(id) {
    const container = this.state.containers.find((item) => item.id === id);
    if (!container) return;
    this.selected.container = id;
    this.highlightSelection('container', id);
    if (this.dom.placeholders.container) this.dom.placeholders.container.hidden = true;
    if (this.dom.detailCards.container) this.dom.detailCards.container.hidden = false;
    this.showContainerDetail(container, { logs: {}, inspect: {}, stats: {} }, '');
    this.vscode.postMessage({ type: 'select', resource: 'container', container });
  }

  /** Выбор образа. */
  selectImageById(id) {
    const image = this.state.images.find((item) => item.id === id);
    if (!image) return;
    this.selected.image = id;
    this.highlightSelection('image', id);
    if (this.dom.placeholders.image) this.dom.placeholders.image.hidden = true;
    if (this.dom.detailCards.image) this.dom.detailCards.image.hidden = false;
    this.showImageDetail(image, { inspect: {}, history: {} }, '');
    this.vscode.postMessage({ type: 'select', resource: 'image', image });
  }

  /** Выбор тома. */
  selectVolumeByName(name) {
    const volume = this.state.volumes.find((item) => item.name === name);
    if (!volume) return;
    this.selected.volume = name;
    this.highlightSelection('volume', name);
    if (this.dom.placeholders.volume) this.dom.placeholders.volume.hidden = true;
    if (this.dom.detailCards.volume) this.dom.detailCards.volume.hidden = false;
    this.showVolumeDetail(volume, { inspect: {} }, '');
    this.vscode.postMessage({ type: 'select', resource: 'volume', volume });
  }

  /** Отрисовка деталей контейнера. */
  showContainerDetail(container, detail, fetchedAt) {
    const meta = this.dom.detailMeta.container;
    if (this.dom.placeholders.container) this.dom.placeholders.container.hidden = true;
    if (this.dom.detailCards.container) this.dom.detailCards.container.hidden = false;
    this.dom.detailTitles.container.textContent = container.name || container.id;

    if (meta.id) {
      meta.id.dataset.cachedValue = container.id;
      meta.id.textContent = `${this.t('containers.detail.idPrefix')}${container.id}`;
    }
    if (meta.image) {
      meta.image.dataset.cachedValue = container.image || '—';
      meta.image.textContent = `${this.t('containers.detail.imagePrefix')}${container.image || '—'}`;
    }
    if (meta.status) {
      meta.status.textContent = this.t('containers.detail.statusWithInfo', {
        state: this.formatContainerState(container),
        info: container.status
      });
    }

    this.dom.detailUpdated.container.textContent = fetchedAt ? this.t('status.updated', { timestamp: fetchedAt }) : '';
    this.updateContainerActions(container);
    this.updateTabPanels('container', detail);
    this.containerLogState[container.id] = {
      lines: detail.logsLines ?? this.countLines(detail.logs?.content || '')
    };
    this.currentContainer = container;
    if (this.dom.logMoreButton) this.dom.logMoreButton.disabled = false;
  }

  /** Отрисовка деталей образа. */
  showImageDetail(image, detail, fetchedAt) {
    const meta = this.dom.detailMeta.image;
    if (this.dom.placeholders.image) this.dom.placeholders.image.hidden = true;
    if (this.dom.detailCards.image) this.dom.detailCards.image.hidden = false;
    this.dom.detailTitles.image.textContent = `${image.repository}:${image.tag}`;

    if (meta.id) {
      meta.id.dataset.cachedValue = image.id;
      meta.id.textContent = `${this.t('images.detail.idPrefix')}${image.id}`;
    }
    if (meta.created) {
      const createdValue = image.createdSince || image.createdAt || '—';
      meta.created.dataset.cachedValue = createdValue;
      meta.created.textContent = `${this.t('images.detail.createdPrefix')}${createdValue}`;
    }
    if (meta.size) {
      const sizeValue = image.size || '—';
      meta.size.dataset.cachedValue = sizeValue;
      meta.size.textContent = `${this.t('images.detail.sizePrefix')}${sizeValue}`;
    }

    this.dom.detailUpdated.image.textContent = fetchedAt ? this.t('status.updated', { timestamp: fetchedAt }) : '';
    this.updateTabPanels('image', detail);
  }

  /** Отрисовка деталей тома. */
  showVolumeDetail(volume, detail, fetchedAt) {
    const meta = this.dom.detailMeta.volume;
    if (this.dom.placeholders.volume) this.dom.placeholders.volume.hidden = true;
    if (this.dom.detailCards.volume) this.dom.detailCards.volume.hidden = false;
    this.dom.detailTitles.volume.textContent = volume.name;

    if (meta.driver) {
      meta.driver.dataset.cachedValue = volume.driver || '—';
      meta.driver.textContent = `${this.t('volumes.detail.driverPrefix')}${volume.driver || '—'}`;
    }
    if (meta.mount) {
      meta.mount.dataset.cachedValue = volume.mountpoint || '—';
      meta.mount.textContent = `${this.t('volumes.detail.mountPrefix')}${volume.mountpoint || '—'}`;
    }
    if (meta.created) {
      const createdValue = volume.createdAt || '—';
      meta.created.dataset.cachedValue = createdValue;
      meta.created.textContent = `${this.t('volumes.detail.createdPrefix')}${createdValue}`;
    }

    this.dom.detailUpdated.volume.textContent = fetchedAt ? this.t('status.updated', { timestamp: fetchedAt }) : '';
    this.updateTabPanels('volume', detail);
  }

  /** Обновляет содержимое вкладок детализации. */
  updateTabPanels(resource, detail) {
    const panels = this.dom.tabPanels[resource];
    /** @type {Record<string, Record<string, string>>} */
    const fallbackMap = {
      container: { logs: 'detail.logs.empty', inspect: 'inspect.empty', stats: 'detail.stats.empty' },
      image: { inspect: 'inspect.empty', history: 'detail.image.historyEmpty' },
      volume: { inspect: 'detail.volume.inspectEmpty' }
    };

    panels.forEach((panel) => {
      const key = panel.dataset[`${resource}Panel`];
      if (!key) return;
      const payload = detail[key] || {};
      const fallbackKey = fallbackMap[resource]?.[key] || 'inspect.empty';
      if (payload.error) {
        panel.dataset.state = 'error';
        panel.textContent = this.t('general.errorWithMessage', { message: payload.error });
      } else {
        panel.dataset.state = 'ok';
        panel.textContent = payload.content ?? this.t(fallbackKey);
      }
    });
    this.updateTabState(resource);
  }

  /** Обрабатывает поступивший пакет дополнительных логов. */
  handleLogsMore(message) {
    if (!message?.containerId || message.containerId !== this.selected.container) {
      this.updateStatus('', false);
      return;
    }
    if (message.logStep) {
      this.logStep = message.logStep;
    }
    const panel = this.getTabPanel('container', 'logs');
    if (!panel) {
      this.updateStatus('', false);
      return;
    }
    const payload = message.logs || {};
    if (payload.error) {
      panel.dataset.state = 'error';
      panel.textContent = this.t('general.errorWithMessage', { message: payload.error });
    } else {
      panel.dataset.state = 'ok';
      panel.textContent = payload.content ?? this.t('detail.logs.empty');
    }
    this.containerLogState[message.containerId] = {
      lines: message.logLines ?? this.countLines(payload.content || '')
    };
    this.updateStatus('', false);
  }

  /**
   * Обновляет доступность кнопок действий для контейнера.
   * @param {DockerContainer} container
   */
  updateContainerActions(container) {
    const running = container.state === 'running';
    this.dom.actionGroups.container.forEach((button) => {
      const action = button.dataset.action;
      button.dataset.containerId = container.id;
      if (!action) return;
      if (action === 'start') {
        button.disabled = running;
      } else if (action === 'restart' || action === 'stop' || action === 'exec') {
        button.disabled = !running;
      } else {
        button.disabled = false;
      }
    });
  }

  /** Генерирует локализованное описание состояния контейнера. */
  formatContainerState(container) {
    const normalized = (container.state || '').toLowerCase();
    switch (normalized) {
      case 'running':
        return this.t('containers.state.running');
      case 'exited':
        return this.t('containers.state.exited');
      case 'created':
        return this.t('containers.state.created');
      case 'paused':
        return this.t('containers.state.paused');
      default:
        return this.t('containers.state.generic', { state: container.state || 'unknown' });
    }
  }
}

// Запускаем приложение, когда DOM готов.
document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  window.addEventListener('error', (event) => {
    if (!statusEl) return;
    statusEl.textContent = `JS error: ${event.message}`;
    statusEl.dataset.loading = 'false';
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (!statusEl) return;
    statusEl.textContent = `Promise error: ${event.reason}`;
    statusEl.dataset.loading = 'false';
  });
  const vscode = acquireVsCodeApi();
  const bootstrap = /** @type {BootstrapPayload} */ (window.__DASHBOARD_DATA__ || {});
  const app = new DashboardApp(vscode, bootstrap);
  app.init();
});

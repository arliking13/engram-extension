/**
 * Engram — Storage
 * IndexedDB wrapper. Each project is fully isolated.
 * Global settings and templates are shared across projects.
 */

class Storage {
  constructor() {
    this.db = null;
    this.DB_NAME = "engram";
    this.DB_VERSION = 1;
    this._ready = this._init();
  }

  async _init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Projects store
        if (!db.objectStoreNames.contains("projects")) {
          const ps = db.createObjectStore("projects", { keyPath: "id" });
          ps.createIndex("createdAt", "createdAt");
        }

        // Messages store — keyed by projectId
        if (!db.objectStoreNames.contains("messages")) {
          const ms = db.createObjectStore("messages", {
            keyPath: "id",
            autoIncrement: true,
          });
          ms.createIndex("projectId", "projectId");
          ms.createIndex("timestamp", "timestamp");
        }

        // Health store
        if (!db.objectStoreNames.contains("health")) {
          db.createObjectStore("health", { keyPath: "projectId" });
        }

        // Handoffs store
        if (!db.objectStoreNames.contains("handoffs")) {
          const hs = db.createObjectStore("handoffs", { keyPath: "id" });
          hs.createIndex("projectId", "projectId");
        }

        // Global settings (shared across projects)
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  async ready() {
    await this._ready;
  }

  // ── Projects ──────────────────────────────────────────────────────────────

  async createProject(name, platform = "claude") {
    await this.ready();
    const project = {
      id: crypto.randomUUID(),
      name,
      platform,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this._put("projects", project);
    await this.setActiveProject(project.id);
    return project;
  }

  async listProjects() {
    await this.ready();
    return this._getAll("projects");
  }

  async setActiveProject(projectId) {
    await this.ready();
    await this._put("settings", { key: "activeProjectId", value: projectId });
  }

  async getActiveProject() {
    await this.ready();
    const setting = await this._get("settings", "activeProjectId");
    if (!setting) return null;
    return this._get("projects", setting.value);
  }

  // ── Sessions (alias for active project context) ───────────────────────────

  async getCurrentSession(tabId) {
    let project = await this.getActiveProject();
    if (!project) {
      // Auto-create default project
      project = await this.createProject("Default Project", "claude");
    }
    return project;
  }

  async getActiveSession() {
    return this.getActiveProject();
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async appendMessages(projectId, messages) {
    await this.ready();
    const tx = this.db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const msg of messages) {
      store.add({ ...msg, projectId, storedAt: Date.now() });
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async getMessages(projectId) {
    await this.ready();
    if (!projectId) return [];
    const tx = this.db.transaction("messages", "readonly");
    const index = tx.objectStore("messages").index("projectId");
    return new Promise((resolve, reject) => {
      const req = index.getAll(projectId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async clearMessages(projectId) {
    await this.ready();
    const messages = await this.getMessages(projectId);
    const tx = this.db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    messages.forEach((m) => store.delete(m.id));
    return new Promise((resolve) => { tx.oncomplete = resolve; });
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async updateHealth(projectId, health) {
    await this.ready();
    await this._put("health", { projectId, ...health });
  }

  async getHealth(projectId) {
    await this.ready();
    if (!projectId) return null;
    return this._get("health", projectId);
  }

  // ── Handoffs ──────────────────────────────────────────────────────────────

  async saveHandoff(projectId, handoff) {
    await this.ready();
    await this._put("handoffs", { ...handoff, projectId });
  }

  async getHandoffs(projectId) {
    await this.ready();
    const tx = this.db.transaction("handoffs", "readonly");
    const index = tx.objectStore("handoffs").index("projectId");
    return new Promise((resolve, reject) => {
      const req = index.getAll(projectId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Generic helpers ───────────────────────────────────────────────────────

  _put(store, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  _get(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll(store) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

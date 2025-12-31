<template>
  <div class="controls" :class="{ 'controls-hidden': !settingsStore.showControls }">
    <button class="icon-btn" @click="settingsStore.toggleDarkMode" :title="settingsStore.isDarkMode ? 'ライトモード' : 'ダークモード'">
      <span class="mode-icon">{{ settingsStore.isDarkMode ? '☾' : '☀' }}</span>
    </button>

    <button class="sync-btn" :class="{ active: settingsStore.syncMode }" @click="settingsStore.toggleSyncMode">
      <span class="sync-icon">⇄</span>
      スクロール同期
    </button>

    <div class="file-inputs">
      <label class="file-input-label">
        <input type="file" @change="$emit('file-select', 0, $event)" :accept="acceptTypes" />
        <span>左ペイン</span>
      </label>
      <label class="file-input-label right-pane">
        <input type="file" @change="$emit('file-select', 1, $event)" :accept="acceptTypes" />
        <span>右ペイン</span>
      </label>
    </div>

    <div class="version">v{{ appVersion }}</div>
  </div>

  <button class="toggle-controls" @click="settingsStore.toggleControls">
    <span class="toggle-icon">{{ settingsStore.showControls ? '▲' : '▼' }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const settingsStore = useSettingsStore()

const appVersion = window.appVersion || '2.0.0'
const acceptTypes = '.epub,.pdf'

defineEmits(['file-select'])
</script>

<style scoped>
.controls {
  padding: 0.5rem 1rem;
  display: flex;
  gap: 0.75rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  transition: all 0.3s ease-in-out;
  position: relative;
}

.controls-hidden {
  transform: translateY(-100%);
  height: 0;
  padding: 0;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.icon-btn {
  padding: 0.4rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: var(--bg-hover);
}

.mode-icon {
  font-size: 1.2rem;
  line-height: 1;
}

.sync-btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.sync-btn:hover {
  background: var(--bg-hover);
}

.sync-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.sync-icon {
  font-size: 1rem;
}

.file-inputs {
  display: flex;
  gap: 0.5rem;
  flex: 1;
}

.file-input-label.right-pane {
  margin-left: auto;
}

.file-input-label {
  display: flex;
  align-items: center;
  padding: 0.4rem 0.75rem;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.85rem;
}

.file-input-label:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover);
}

.file-input-label input {
  display: none;
}

.version {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.toggle-controls {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 1000;
  padding: 0.3rem 0.5rem;
  background: var(--bg-primary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toggle-controls:hover {
  background: var(--bg-secondary);
}

.toggle-icon {
  font-size: 0.7rem;
}
</style>

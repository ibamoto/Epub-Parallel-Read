<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click="$emit('close')">
      <div class="settings-panel" @click.stop>
        <div class="settings-header">
          <h3>表示設定</h3>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <div class="settings-content">
          <!-- Sync Button -->
          <div class="sync-settings-section">
            <button class="sync-left-btn" @click="syncToLeft">
              ← 左の設定に揃える
            </button>
          </div>

          <!-- Left and Right Panes -->
          <div class="panes-container">
            <!-- Left Pane Settings -->
            <div class="pane-settings-column">
              <div class="pane-header">
                <h4>左ペイン</h4>
              </div>
              <SettingsPaneContent
                :paneIndex="0"
                :localSettings="leftSettings"
                @update="updateLeftSetting"
              />
            </div>

            <!-- Right Pane Settings -->
            <div class="pane-settings-column">
              <div class="pane-header">
                <h4>右ペイン</h4>
              </div>
              <SettingsPaneContent
                :paneIndex="1"
                :localSettings="rightSettings"
                @update="updateRightSetting"
              />
            </div>
          </div>

          <!-- Theme Section (Global) -->
          <section class="settings-section">
            <h4>テーマ（全体）</h4>

            <div class="theme-options">
              <button
                v-for="themeOption in themeOptions"
                :key="themeOption.value"
                class="theme-btn"
                :class="{ active: settingsStore.theme === themeOption.value }"
                :style="{ background: themeOption.bg, color: themeOption.text }"
                @click="handleThemeChange(themeOption.value)"
              >
                {{ themeOption.label }}
              </button>
            </div>
          </section>

          <!-- Actions -->
          <div class="settings-actions">
            <button class="reset-btn" @click="resetSettings">
              デフォルトに戻す
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, reactive } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import SettingsPaneContent from './SettingsPaneContent.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  paneIndex: {
    type: Number,
    default: -1, // -1 means unified mode (both panes)
  },
})

const emit = defineEmits(['close', 'settings-changed'])

const settingsStore = useSettingsStore()

const themeOptions = [
  { value: 'light', label: 'ライト', bg: '#ffffff', text: '#333333' },
  { value: 'dark', label: 'ダーク', bg: '#1a1a1a', text: '#e0e0e0' },
  { value: 'sepia', label: 'セピア', bg: '#f4ecd8', text: '#5c4b37' },
]

// Local copies of settings for both panes
const leftSettings = reactive({ ...settingsStore.paneSettings[0] })
const rightSettings = reactive({ ...settingsStore.paneSettings[1] })

// Sync local settings when pane settings change
watch(() => settingsStore.paneSettings[0], (newSettings) => {
  Object.assign(leftSettings, newSettings)
}, { deep: true })

watch(() => settingsStore.paneSettings[1], (newSettings) => {
  Object.assign(rightSettings, newSettings)
}, { deep: true })

// Update left pane setting
function updateLeftSetting(key, value) {
  settingsStore.updatePaneSettings(0, { [key]: value })
  emit('settings-changed')
}

// Update right pane setting
function updateRightSetting(key, value) {
  settingsStore.updatePaneSettings(1, { [key]: value })
  emit('settings-changed')
}

// Sync right pane to left pane
function syncToLeft() {
  const leftSettingsCopy = { ...leftSettings }
  Object.keys(leftSettingsCopy).forEach(key => {
    settingsStore.updatePaneSettings(1, { [key]: leftSettingsCopy[key] })
  })
  Object.assign(rightSettings, leftSettingsCopy)
  emit('settings-changed')
}

// Handle theme change
function handleThemeChange(themeValue) {
  settingsStore.setTheme(themeValue)
  emit('settings-changed')
}

// Reset to defaults
function resetSettings() {
  settingsStore.resetPaneSettings(0)
  settingsStore.resetPaneSettings(1)
  Object.assign(leftSettings, settingsStore.paneSettings[0])
  Object.assign(rightSettings, settingsStore.paneSettings[1])
  emit('settings-changed')
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
}

.settings-panel {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.settings-header {
  display: flex;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.settings-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

.sync-settings-section {
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.sync-left-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  background: var(--accent-color);
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.sync-left-btn:hover {
  background: var(--accent-color);
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}

.panes-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.pane-settings-column {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
}

.pane-header {
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.pane-header h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.settings-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.settings-section h4 {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-options {
  display: flex;
  gap: 0.5rem;
}

.theme-btn {
  flex: 1;
  padding: 0.75rem;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.15s;
}

.theme-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.theme-btn.active {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px var(--accent-light);
}

.settings-actions {
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.reset-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}

.reset-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

@media (max-width: 900px) {
  .settings-panel {
    width: 95vw;
  }
  
  .panes-container {
    grid-template-columns: 1fr;
  }
}
</style>

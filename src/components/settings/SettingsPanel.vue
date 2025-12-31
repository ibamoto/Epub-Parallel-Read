<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-overlay" @click="$emit('close')">
      <div class="settings-panel" @click.stop>
        <div class="settings-header">
          <h3>表示設定</h3>
          <span class="pane-indicator">{{ paneIndex === 0 ? '左ペイン' : '右ペイン' }}</span>
          <button class="close-btn" @click="$emit('close')">×</button>
        </div>

        <div class="settings-content">
          <!-- Font Section -->
          <section class="settings-section">
            <h4>フォント</h4>

            <div class="setting-item">
              <label>フォントファミリー</label>
              <select v-model="localSettings.fontFamily" @change="updateSetting('fontFamily')">
                <option v-for="font in settingsStore.fontOptions" :key="font.value" :value="font.value">
                  {{ font.label }}
                </option>
              </select>
            </div>

            <div class="setting-item">
              <label>サイズ</label>
              <input
                type="range"
                v-model.number="localSettings.fontSize"
                min="10"
                max="32"
                step="1"
                @input="updateSetting('fontSize')"
              />
              <span class="value">{{ localSettings.fontSize }}px</span>
            </div>

            <div class="setting-item">
              <label>太さ</label>
              <input
                type="range"
                v-model.number="localSettings.fontWeight"
                min="300"
                max="700"
                step="100"
                @input="updateSetting('fontWeight')"
              />
              <span class="value">{{ localSettings.fontWeight }}</span>
            </div>
          </section>

          <!-- Layout Section -->
          <section class="settings-section">
            <h4>レイアウト</h4>

            <div class="setting-item">
              <label>行間</label>
              <input
                type="range"
                v-model.number="localSettings.lineHeight"
                min="1"
                max="3"
                step="0.1"
                @input="updateSetting('lineHeight')"
              />
              <span class="value">{{ localSettings.lineHeight.toFixed(1) }}</span>
            </div>

            <div class="setting-item">
              <label>字間</label>
              <input
                type="range"
                v-model.number="localSettings.letterSpacing"
                min="-0.1"
                max="0.5"
                step="0.05"
                @input="updateSetting('letterSpacing')"
              />
              <span class="value">{{ localSettings.letterSpacing.toFixed(2) }}em</span>
            </div>

            <div class="setting-item">
              <label>段落間隔</label>
              <input
                type="range"
                v-model.number="localSettings.paragraphSpacing"
                min="0"
                max="3"
                step="0.25"
                @input="updateSetting('paragraphSpacing')"
              />
              <span class="value">{{ localSettings.paragraphSpacing.toFixed(2) }}em</span>
            </div>

            <div class="setting-item">
              <label>テキスト配置</label>
              <div class="btn-group">
                <button
                  v-for="align in alignOptions"
                  :key="align.value"
                  :class="{ active: localSettings.textAlign === align.value }"
                  @click="localSettings.textAlign = align.value; updateSetting('textAlign')"
                >
                  {{ align.label }}
                </button>
              </div>
            </div>
          </section>

          <!-- Margin Section -->
          <section class="settings-section">
            <h4>余白</h4>

            <div class="margin-grid">
              <div class="margin-item">
                <label>上</label>
                <input
                  type="number"
                  v-model.number="localSettings.marginTop"
                  min="0"
                  max="100"
                  @input="updateSetting('marginTop')"
                />
              </div>
              <div class="margin-item">
                <label>下</label>
                <input
                  type="number"
                  v-model.number="localSettings.marginBottom"
                  min="0"
                  max="100"
                  @input="updateSetting('marginBottom')"
                />
              </div>
              <div class="margin-item">
                <label>左</label>
                <input
                  type="number"
                  v-model.number="localSettings.marginLeft"
                  min="0"
                  max="100"
                  @input="updateSetting('marginLeft')"
                />
              </div>
              <div class="margin-item">
                <label>右</label>
                <input
                  type="number"
                  v-model.number="localSettings.marginRight"
                  min="0"
                  max="100"
                  @input="updateSetting('marginRight')"
                />
              </div>
            </div>
          </section>

          <!-- Theme Section -->
          <section class="settings-section">
            <h4>テーマ</h4>

            <div class="theme-options">
              <button
                v-for="themeOption in themeOptions"
                :key="themeOption.value"
                class="theme-btn"
                :class="{ active: settingsStore.theme === themeOption.value }"
                :style="{ background: themeOption.bg, color: themeOption.text }"
                @click="settingsStore.setTheme(themeOption.value)"
              >
                {{ themeOption.label }}
              </button>
            </div>
          </section>

          <!-- Scroll Section -->
          <section class="settings-section">
            <h4>スクロール</h4>

            <div class="setting-item">
              <label>モード</label>
              <div class="btn-group">
                <button
                  v-for="mode in scrollModeOptions"
                  :key="mode.value"
                  :class="{ active: localSettings.epubScrollMode === mode.value }"
                  @click="localSettings.epubScrollMode = mode.value; updateSetting('epubScrollMode')"
                >
                  {{ mode.label }}
                </button>
              </div>
            </div>

            <div v-if="localSettings.epubScrollMode === 'continuous'" class="setting-item">
              <label>速度</label>
              <input
                type="range"
                v-model.number="localSettings.epubScrollSpeed"
                min="0.5"
                max="3"
                step="0.1"
                @input="updateSetting('epubScrollSpeed')"
              />
              <span class="value">{{ localSettings.epubScrollSpeed.toFixed(1) }}x</span>
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

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  paneIndex: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['close', 'settings-changed'])

const settingsStore = useSettingsStore()

const alignOptions = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'justify', label: '両端' },
]

const themeOptions = [
  { value: 'light', label: 'ライト', bg: '#ffffff', text: '#333333' },
  { value: 'dark', label: 'ダーク', bg: '#1a1a1a', text: '#e0e0e0' },
  { value: 'sepia', label: 'セピア', bg: '#f4ecd8', text: '#5c4b37' },
]

const scrollModeOptions = [
  { value: 'page', label: 'ページ' },
  { value: 'continuous', label: '連続' },
]

// Local copy of settings for responsive updates
const localSettings = reactive({ ...settingsStore.paneSettings[props.paneIndex] })

// Sync local settings when pane settings change
watch(() => settingsStore.paneSettings[props.paneIndex], (newSettings) => {
  Object.assign(localSettings, newSettings)
}, { deep: true })

// Update a single setting
function updateSetting(key) {
  settingsStore.updatePaneSettings(props.paneIndex, { [key]: localSettings[key] })
  emit('settings-changed')
}

// Reset to defaults
function resetSettings() {
  settingsStore.resetPaneSettings(props.paneIndex)
  Object.assign(localSettings, settingsStore.paneSettings[props.paneIndex])
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
  width: 480px;
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

.pane-indicator {
  margin-left: 0.75rem;
  padding: 0.2rem 0.5rem;
  background: var(--accent-light);
  color: var(--accent-color);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
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

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.75rem;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  min-width: 80px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.setting-item select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.setting-item input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

.setting-item input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.setting-item input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.setting-item .value {
  min-width: 50px;
  text-align: right;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  font-family: monospace;
}

.btn-group {
  display: flex;
  gap: 0.25rem;
  flex: 1;
}

.btn-group button {
  flex: 1;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}

.btn-group button:first-child {
  border-radius: 6px 0 0 6px;
}

.btn-group button:last-child {
  border-radius: 0 6px 6px 0;
}

.btn-group button:not(:first-child) {
  border-left: none;
}

.btn-group button:hover {
  background: var(--bg-hover);
}

.btn-group button.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.margin-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.margin-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.margin-item label {
  min-width: 24px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.margin-item input {
  flex: 1;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
  width: 60px;
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
</style>

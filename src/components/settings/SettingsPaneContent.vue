<template>
  <div class="pane-content">
    <!-- Font Section -->
    <section class="settings-section">
      <h4>フォント</h4>

      <div class="setting-item">
        <label>フォントファミリー</label>
        <select :value="localSettings.fontFamily" @change="update('fontFamily', $event.target.value)">
          <option v-for="font in settingsStore.fontOptions" :key="font.value" :value="font.value">
            {{ font.label }}
          </option>
        </select>
      </div>

      <div class="setting-item">
        <label>サイズ</label>
        <input
          type="range"
          :value="localSettings.fontSize"
          min="10"
          max="32"
          step="1"
          @input="update('fontSize', parseFloat($event.target.value))"
        />
        <span class="value">{{ localSettings.fontSize }}px</span>
      </div>

      <div class="setting-item">
        <label>太さ</label>
        <input
          type="range"
          :value="localSettings.fontWeight"
          min="300"
          max="700"
          step="100"
          @input="update('fontWeight', parseFloat($event.target.value))"
        />
        <span class="value">{{ localSettings.fontWeight }}</span>
      </div>

      <div class="setting-item">
        <label>文字色</label>
        <div class="color-input-group">
          <input
            type="color"
            :value="textColorValue"
            @input="update('textColor', $event.target.value)"
            class="color-input"
          />
          <button
            class="reset-color-btn"
            @click="update('textColor', null)"
            title="テーマの色を使用"
          >
            リセット
          </button>
        </div>
        <span class="value">{{ textColorDisplay }}</span>
      </div>
    </section>

    <!-- Layout Section -->
    <section class="settings-section">
      <h4>レイアウト</h4>

      <div class="setting-item">
        <label>行間</label>
        <input
          type="range"
          :value="localSettings.lineHeight"
          min="1"
          max="3"
          step="0.1"
          @input="update('lineHeight', parseFloat($event.target.value))"
        />
        <span class="value">{{ localSettings.lineHeight.toFixed(1) }}</span>
      </div>

      <div class="setting-item">
        <label>字間</label>
        <input
          type="range"
          :value="localSettings.letterSpacing"
          min="-0.1"
          max="0.5"
          step="0.05"
          @input="update('letterSpacing', parseFloat($event.target.value))"
        />
        <span class="value">{{ localSettings.letterSpacing.toFixed(2) }}em</span>
      </div>

      <div class="setting-item">
        <label>段落間隔</label>
        <input
          type="range"
          :value="localSettings.paragraphSpacing"
          min="0"
          max="3"
          step="0.25"
          @input="update('paragraphSpacing', parseFloat($event.target.value))"
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
            @click="update('textAlign', align.value)"
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
            :value="localSettings.marginTop"
            min="0"
            max="100"
            @input="update('marginTop', parseFloat($event.target.value) || 0)"
          />
        </div>
        <div class="margin-item">
          <label>下</label>
          <input
            type="number"
            :value="localSettings.marginBottom"
            min="0"
            max="100"
            @input="update('marginBottom', parseFloat($event.target.value) || 0)"
          />
        </div>
        <div class="margin-item">
          <label>左</label>
          <input
            type="number"
            :value="localSettings.marginLeft"
            min="0"
            max="100"
            @input="update('marginLeft', parseFloat($event.target.value) || 0)"
          />
        </div>
        <div class="margin-item">
          <label>右</label>
          <input
            type="number"
            :value="localSettings.marginRight"
            min="0"
            max="100"
            @input="update('marginRight', parseFloat($event.target.value) || 0)"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'

const props = defineProps({
  paneIndex: {
    type: Number,
    required: true,
  },
  localSettings: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update'])

const settingsStore = useSettingsStore()

const alignOptions = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'justify', label: '両端' },
]

// Get text color value for color input (default to theme color if null)
const textColorValue = computed(() => {
  if (props.localSettings.textColor) {
    return props.localSettings.textColor
  }
  const colors = settingsStore.getThemeColors()
  return colors.text
})

// Display text for text color
const textColorDisplay = computed(() => {
  if (props.localSettings.textColor) {
    return props.localSettings.textColor
  }
  return 'テーマの色'
})

function update(key, value) {
  emit('update', key, value)
}
</script>

<style scoped>
.pane-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-section {
  background: var(--bg-primary);
  border-radius: 6px;
  padding: 0.75rem;
}

.settings-section h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-item {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-item label {
  min-width: 70px;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.setting-item select {
  flex: 1;
  padding: 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8rem;
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
  width: 14px;
  height: 14px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s;
}

.setting-item input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.setting-item .value {
  min-width: 45px;
  text-align: right;
  color: var(--text-tertiary);
  font-size: 0.75rem;
  font-family: monospace;
}

.color-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.color-input {
  width: 50px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}

.reset-color-btn {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.7rem;
  transition: all 0.15s;
}

.reset-color-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-group {
  display: flex;
  gap: 0.25rem;
  flex: 1;
}

.btn-group button {
  flex: 1;
  padding: 0.35rem 0.4rem;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.btn-group button:first-child {
  border-radius: 4px 0 0 4px;
}

.btn-group button:last-child {
  border-radius: 0 4px 4px 0;
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
  gap: 0.5rem;
}

.margin-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.margin-item label {
  min-width: 20px;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.margin-item input {
  flex: 1;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8rem;
  width: 50px;
}
</style>


<template>
  <div class="toc-container" :class="position">
    <div class="toc-sidebar" :class="{ 'toc-hidden': !visible, 'toc-left': position === 'left', 'toc-right': position === 'right' }">
      <div class="toc-header">
        <button v-if="position === 'left'" class="toc-toggle" @click="$emit('toggle')">
          <span class="toggle-icon">{{ visible ? '◀' : '▶' }}</span>
        </button>
        <div class="toc-title">目次</div>
        <button v-if="position === 'right'" class="toc-toggle" @click="$emit('toggle')">
          <span class="toggle-icon">{{ visible ? '▶' : '◀' }}</span>
        </button>
      </div>
      <div class="toc-content" v-if="items.length > 0">
        <div
          v-for="(item, index) in items"
          :key="index"
          class="toc-item"
          :class="{ active: isActive(item) }"
          :style="{ paddingLeft: `${12 + item.level * 12}px` }"
          @click="$emit('navigate', item.href)"
        >
          {{ item.label }}
        </div>
      </div>
      <div class="toc-empty" v-else>
        <span>目次がありません</span>
      </div>
    </div>

    <button
      v-if="!visible"
      class="toc-show-button"
      :class="position"
      @click="$emit('toggle')"
    >
      <span class="toggle-icon">{{ position === 'left' ? '▶' : '◀' }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  visible: {
    type: Boolean,
    default: true,
  },
  position: {
    type: String,
    default: 'left', // 'left' | 'right'
  },
  currentLocation: {
    type: [String, Number, Object],
    default: null,
  },
})

defineEmits(['toggle', 'navigate'])

function isActive(item) {
  if (!props.currentLocation) return false
  return item.href === props.currentLocation
}
</script>

<style scoped>
.toc-container {
  position: relative;
  display: flex;
  flex-shrink: 0;
}

.toc-container.left {
  order: -1;
}

.toc-container.right {
  order: 1;
}

.toc-sidebar {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  transition: all 0.3s ease-in-out;
}

.toc-sidebar.toc-left {
  border-right: 1px solid var(--border-color);
}

.toc-sidebar.toc-right {
  border-left: 1px solid var(--border-color);
}

.toc-hidden {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border: none !important;
  opacity: 0;
  visibility: hidden;
}

.toc-header {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  background: var(--bg-secondary);
  gap: 0.5rem;
}

.toc-toggle {
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.toc-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toggle-icon {
  font-size: 0.8rem;
}

.toc-title {
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
  text-align: center;
  color: var(--text-primary);
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.toc-item {
  padding: 0.4rem 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
  font-size: 0.85rem;
  transition: all 0.15s;
}

.toc-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toc-item.active {
  background: var(--accent-light);
  color: var(--accent-color);
  font-weight: 500;
}

.toc-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.toc-show-button {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 12px 6px;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  opacity: 0;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toc-show-button.left {
  left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.toc-show-button.right {
  right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.toc-show-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  opacity: 1 !important;
}

/* Show button on container hover */
.toc-container:hover .toc-show-button {
  opacity: 0.7;
}

/* Always show button when TOC is hidden */
.toc-container .toc-show-button {
  opacity: 0.5;
}

/* Responsive */
@media (max-width: 1200px) {
  .toc-sidebar {
    width: 160px;
    min-width: 160px;
    max-width: 160px;
  }
}

@media (max-width: 900px) {
  .toc-sidebar {
    width: 140px;
    min-width: 140px;
    max-width: 140px;
  }
}
</style>

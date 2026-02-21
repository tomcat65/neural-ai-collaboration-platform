import { ref, watch } from 'vue'
import type { ThemeName } from '@/types/command-center'

const THEME_KEY = 'cc-theme'
const FONT_SCALE_KEY = 'cc-font-scale'

const theme = ref<ThemeName>(
  (localStorage.getItem(THEME_KEY) as ThemeName) || 'dark'
)
const fontScale = ref<number>(
  parseFloat(localStorage.getItem(FONT_SCALE_KEY) || '1.1')
)

function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme.value)
}

function applyFontScale() {
  document.documentElement.style.setProperty('--cc-font-scale', String(fontScale.value))
}

// Apply on load
applyTheme()
applyFontScale()

watch(theme, (val) => {
  localStorage.setItem(THEME_KEY, val)
  applyTheme()
})

watch(fontScale, (val) => {
  localStorage.setItem(FONT_SCALE_KEY, String(val))
  applyFontScale()
})

export function useTheme() {
  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function increaseFontSize() {
    if (fontScale.value < 1.4) {
      fontScale.value = Math.round((fontScale.value + 0.1) * 10) / 10
    }
  }

  function decreaseFontSize() {
    if (fontScale.value > 0.8) {
      fontScale.value = Math.round((fontScale.value - 0.1) * 10) / 10
    }
  }

  return {
    theme,
    fontScale,
    toggleTheme,
    increaseFontSize,
    decreaseFontSize,
  }
}

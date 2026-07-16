import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
const panelSource = readFileSync(resolve('app/components/map/DisplaySettingsPanel.vue'), 'utf8')

test('map display settings are isolated behind a typed presentation component', () => {
  assert.match(pageSource, /<MapDisplaySettingsPanel\b/)
  assert.match(pageSource, /:base-style="mapBaseStyle"/)
  assert.match(pageSource, /:display-options="mapDisplayOptions"/)
  assert.match(pageSource, /@set-base-style="setMapBaseStyle"/)
  assert.match(pageSource, /@toggle-option="toggleDisplayOption"/)
  assert.match(pageSource, /@set-label-size="setLabelSize"/)
  assert.doesNotMatch(pageSource, /const mapBaseStyleOptions/)
  assert.doesNotMatch(pageSource, /行政分块等待学校或高德提供可信边界数据后开放/)

  assert.match(panelSource, /defineProps<\{/)
  assert.match(panelSource, /defineEmits<\{/)
  assert.match(panelSource, /type DisplayToggleKey = Exclude<keyof MapDisplayOptions, 'labelSize'>/)
  assert.match(panelSource, /emit\('setBaseStyle', style\.value\)/)
  assert.match(panelSource, /emit\('toggleOption', item\.key\)/)
  assert.match(panelSource, /emit\('setLabelSize', size\.value\)/)
  assert.doesNotMatch(panelSource, /createRuntimeMapProvider|useRoute|useRouter/)
})

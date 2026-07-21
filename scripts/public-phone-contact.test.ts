import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  parsePublicPhoneContacts,
  resolvePublicEmailHref
} from '../app/utils/public-phone-contact'

const departmentPage = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
const placePage = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
const placePanel = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
const campusPage = readFileSync(resolve('app/pages/campus.vue'), 'utf8')
const homePage = readFileSync(resolve('app/pages/index.vue'), 'utf8')

test('parsePublicPhoneContacts splits multi-number campus lines into dialable tel links', () => {
  assert.deepEqual(
    parsePublicPhoneContacts('0595-22098521 / 0595-22087606'),
    [
      { label: '0595-22098521', href: 'tel:059522098521' },
      { label: '0595-22087606', href: 'tel:059522087606' }
    ]
  )
  assert.deepEqual(
    parsePublicPhoneContacts('0595-22076110'),
    [{ label: '0595-22076110', href: 'tel:059522076110' }]
  )
  assert.deepEqual(parsePublicPhoneContacts('待公布'), [])
  assert.deepEqual(parsePublicPhoneContacts(''), [])
  assert.deepEqual(parsePublicPhoneContacts(null), [])
})

test('resolvePublicEmailHref only accepts plain email addresses', () => {
  assert.equal(resolvePublicEmailHref('help@example.edu.cn'), 'mailto:help@example.edu.cn')
  assert.equal(resolvePublicEmailHref('  help@example.edu.cn  '), 'mailto:help@example.edu.cn')
  assert.equal(resolvePublicEmailHref('not-an-email'), null)
  assert.equal(resolvePublicEmailHref(null), null)
})

test('public pages expose dialable public phone contacts', () => {
  assert.match(departmentPage, /parsePublicPhoneContacts/)
  assert.match(departmentPage, /resolvePublicEmailHref/)
  assert.match(departmentPage, /phoneContacts/)
  assert.match(departmentPage, /:href="phone\.href"/)
  assert.match(departmentPage, /min-h-11/)
  assert.match(placePage, /parsePublicPhoneContacts/)
  assert.match(placePage, /phoneContacts/)
  assert.match(placePage, /:href="phone\.href"/)
  assert.match(placePanel, /parsePublicPhoneContacts/)
  assert.match(placePanel, /phoneContacts/)
  assert.match(placePanel, /:href="phone\.href"/)
  assert.match(placePanel, /props\.variant === 'mobile' && \(props\.place\.campusArea \|\| props\.place\.openingHours \|\| phoneContacts\.length\)/)
  assert.match(placePanel, /拨打/)
  assert.match(campusPage, /parsePublicPhoneContacts/)
  assert.match(campusPage, /departmentPhoneContacts/)
  assert.match(campusPage, /:href="phone\.href"/)
  assert.match(homePage, /href="tel:059522076110"/)
  assert.match(homePage, /href="tel:110"/)
  assert.match(homePage, /href="tel:119"/)
  assert.match(homePage, /href="tel:120"/)
  assert.match(homePage, /拨打校园 110/)
  assert.doesNotMatch(departmentPage, /\{\{\s*department\.phone\s*\}\}/)
  assert.doesNotMatch(placePage, /\{\{\s*place\.phone\s*\}\}/)
  assert.doesNotMatch(placePanel, /\{\{\s*props\.place\.phone\s*\}\}/)
})

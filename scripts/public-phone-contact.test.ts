import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  parsePublicPhoneContacts,
  resolvePublicContactActions,
  resolvePublicEmailHref
} from '../app/utils/public-phone-contact'

const departmentPage = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
const placePage = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
const placePanel = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
const campusPage = readFileSync(resolve('app/pages/campus.vue'), 'utf8')
const homePage = readFileSync(resolve('app/pages/index.vue'), 'utf8')
const clubPage = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')

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


test('resolvePublicContactActions maps phones, emails, and plain text contacts', () => {
  assert.deepEqual(
    resolvePublicContactActions('0595-22098521 / 0595-22087606'),
    [
      {
        kind: 'phone',
        label: '0595-22098521',
        href: 'tel:059522098521',
        copyValue: '0595-22098521',
        actionLabel: '拨打 0595-22098521'
      },
      {
        kind: 'phone',
        label: '0595-22087606',
        href: 'tel:059522087606',
        copyValue: '0595-22087606',
        actionLabel: '拨打 0595-22087606'
      }
    ]
  )
  assert.deepEqual(
    resolvePublicContactActions('club@example.edu.cn'),
    [{
      kind: 'email',
      label: 'club@example.edu.cn',
      href: 'mailto:club@example.edu.cn',
      copyValue: 'club@example.edu.cn',
      actionLabel: '发邮件'
    }]
  )
  assert.deepEqual(
    resolvePublicContactActions('关注校团委公众号后搜索社团名称'),
    [{
      kind: 'text',
      label: '关注校团委公众号后搜索社团名称',
      href: null,
      copyValue: '关注校团委公众号后搜索社团名称',
      actionLabel: '复制联系方式'
    }]
  )
  assert.deepEqual(resolvePublicContactActions(''), [])
  assert.deepEqual(resolvePublicContactActions(null), [])
})

test('public pages expose dialable public phone contacts', () => {
  assert.match(departmentPage, /parsePublicPhoneContacts/)
  assert.match(departmentPage, /resolvePublicEmailHref/)
  assert.match(departmentPage, /phoneContacts/)
  assert.match(departmentPage, /:(?:href|to)="phone\.href"/)
  assert.match(departmentPage, /copyDepartmentPhone\(phone\.label\)/)
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
  assert.match(homePage, /href="tel:059522099033"/)
  assert.match(homePage, /href="tel:059522082006"/)
  assert.match(homePage, /href="tel:059522099018"/)
  assert.match(homePage, /拨打校园 110/)
  assert.doesNotMatch(homePage, /href="tel:110"|href="tel:119"|href="tel:120"/)
  assert.match(clubPage, /resolvePublicContactActions/)
  assert.match(clubPage, /contactActions/)
  assert.match(clubPage, /copyContactAction/)
  assert.match(clubPage, /action\.actionLabel/)
  assert.match(clubPage, /clubSectionLabels\.copyContact/)
  assert.match(clubPage, /i-lucide-phone/)
  assert.match(clubPage, /i-lucide-mail/)
  assert.match(clubPage, /i-lucide-copy/)
  assert.doesNotMatch(clubPage, /\{\{\s*club\.contactMethod\s*\}\}/)
  assert.doesNotMatch(departmentPage, /\{\{\s*department\.phone\s*\}\}/)
  assert.doesNotMatch(placePage, /\{\{\s*place\.phone\s*\}\}/)
  assert.doesNotMatch(placePanel, /\{\{\s*props\.place\.phone\s*\}\}/)
})

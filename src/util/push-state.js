/* @flow */

import { inBrowser } from './dom'
import { saveScrollPosition } from './scroll'

// ! 判断是否支持 pushState；HTML5 引入的方法
export const supportsPushState =
  inBrowser &&
  (function() {
    const ua = window.navigator.userAgent // ! 获取代理

    // ! 满足下面条件为不支持 history 模式
    if (
      (ua.indexOf('Android 2.') !== -1 || ua.indexOf('Android 4.0') !== -1) &&
      ua.indexOf('Mobile Safari') !== -1 &&
      ua.indexOf('Chrome') === -1 &&
      ua.indexOf('Windows Phone') === -1
    ) {
      return false
    }

    return window.history && 'pushState' in window.history
  })()

// use User Timing api (if present) for more accurate key precision
const Time =
  inBrowser && window.performance && window.performance.now
    ? window.performance
    : Date

let _key: string = genKey()

function genKey(): string {
  return Time.now().toFixed(3)
}

export function getStateKey() {
  return _key
}

export function setStateKey(key: string) {
  _key = key
}

export function pushState(url?: string, replace?: boolean) {
  saveScrollPosition()
  // try...catch the pushState call to get around Safari
  // DOM Exception 18 where it limits to 100 pushState calls
  const history = window.history // ! 浏览器原生 history
  try {
    if (replace) {
      history.replaceState({ key: _key }, '', url) // ! 替换，不可后退
    } else {
      _key = genKey()
      history.pushState({ key: _key }, '', url) // ! push，可以后退
    }
  } catch (e) {
    window.location[replace ? 'replace' : 'assign'](url)
  }
}

export function replaceState(url?: string) {
  pushState(url, true)
}

/* @flow */
import { inBrowser } from './dom'

// use User Timing api (if present) for more accurate key precision
// ! 浏览器支持 performance 使用 performance，不支持使用 Date
const Time =
  inBrowser && window.performance && window.performance.now
    ? window.performance
    : Date

// ! 生成 key
export function genStateKey(): string {
  return Time.now().toFixed(3)
}

let _key: string = genStateKey() // ! 赋值

// ! 获取 key
export function getStateKey() {
  return _key
}

// ! 设置 key
export function setStateKey(key: string) {
  return (_key = key)
}

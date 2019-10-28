/* @flow */

import { _Vue } from '../install'
import { warn, isError } from './warn'

// ! 解析异步组件的方法
export function resolveAsyncComponents(matched: Array<RouteRecord>): Function {
  return (to, from, next) => {
    let hasAsync = false
    let pending = 0
    let error = null

    flatMapComponents(matched, (def, _, match, key) => {
      // if it's a function and doesn't have cid attached,
      // assume it's an async component resolve function.
      // we are not using Vue's default async resolving mechanism because
      // we want to halt the navigation until the incoming component has been
      // resolved.
      if (typeof def === 'function' && def.cid === undefined) {
        hasAsync = true // ! 设置为异步组件
        pending++

        // ! 成功回调
        // ! once 只执行一次
        const resolve = once(resolvedDef => {
          if (isESModule(resolvedDef)) {
            resolvedDef = resolvedDef.default
          }
          // save resolved on async factory in case it's used elsewhere
          def.resolved =
            typeof resolvedDef === 'function'
              ? resolvedDef
              : _Vue.extend(resolvedDef)
          match.components[key] = resolvedDef
          pending--
          if (pending <= 0) {
            next()
          }
        })

        // ! 失败回调
        // ! once 只执行一次
        const reject = once(reason => {
          const msg = `Failed to resolve async component ${key}: ${reason}`
          process.env.NODE_ENV !== 'production' && warn(false, msg)
          if (!error) {
            error = isError(reason) ? reason : new Error(msg)
            next(error)
          }
        })

        let res
        try {
          res = def(resolve, reject)
        } catch (e) {
          reject(e)
        }
        if (res) {
          if (typeof res.then === 'function') {
            res.then(resolve, reject)
          } else {
            // new syntax in Vue 2.3
            const comp = res.component
            if (comp && typeof comp.then === 'function') {
              comp.then(resolve, reject)
            }
          }
        }
      }
    })

    if (!hasAsync) next()
  }
}

// ! 组件实例降维的方法
export function flatMapComponents(
  matched: Array<RouteRecord>,
  fn: Function
): Array<?Function> {
  // ! 获取所有的 key 并转换成一维数组
  return flatten(
    matched.map(m => {
      return Object.keys(m.components).map(key =>
        fn(m.components[key], m.instances[key], m, key)
      )
    })
  )
}

// ! 数组降维
export function flatten(arr: Array<any>): Array<any> {
  return Array.prototype.concat.apply([], arr)
}

// ! 是否支持 Symbol
const hasSymbol =
  typeof Symbol === 'function' && typeof Symbol.toStringTag === 'symbol'

// ! 是不是 ES Module
function isESModule(obj) {
  return obj.__esModule || (hasSymbol && obj[Symbol.toStringTag] === 'Module')
}

// in Webpack 2, require.ensure now also returns a Promise
// so the resolve/reject functions may get called an extra time
// if the user uses an arrow function shorthand that happens to
// return that Promise.
// ! 生成执行一次函数
function once(fn) {
  let called = false
  return function(...args) {
    if (called) return
    called = true
    return fn.apply(this, args)
  }
}

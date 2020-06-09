/* @flow */

// ! 断言：条件没达成时，抛出错误
export function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`[vue-router] ${message}`)
  }
}

// ! 提醒：条件没达成时，在开发环境时提醒
export function warn(condition: any, message: string) {
  if (process.env.NODE_ENV !== 'production' && !condition) {
    typeof console !== 'undefined' && console.warn(`[vue-router] ${message}`)
  }
}

// ! 判断是不是一个错误对象
export function isError(err: any): boolean {
  return Object.prototype.toString.call(err).indexOf('Error') > -1
}

export function isRouterError (err: any, errorType: ?string): boolean {
  return isError(err) && err._isRouter && (errorType == null || err.type === errorType)
}

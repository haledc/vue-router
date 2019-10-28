/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g // ! 匹配 ! ' ( ) * 任一符号
// ! % + 匹配的符号的索引的十六进制字符串
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g // ! 逗号正则

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
// ! 编码
const encode = str =>
  encodeURIComponent(str)
    .replace(encodeReserveRE, encodeReserveReplacer)
    .replace(commaRE, ',') // ! 保留逗号

// ! 解码
const decode = decodeURIComponent

// ! 解析 query -> 字符串转对象 + 扩展
export function resolveQuery(
  query: ?string,
  extraQuery: Dictionary<string> = {},
  _parseQuery: ?Function
): Dictionary<string> {
  const parse = _parseQuery || parseQuery
  let parsedQuery
  try {
    parsedQuery = parse(query || '')
  } catch (e) {
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  for (const key in extraQuery) {
    parsedQuery[key] = extraQuery[key]
  }
  return parsedQuery
}

// ! query 字符串转对象
function parseQuery(query: string): Dictionary<string> {
  const res = {}

  query = query.trim().replace(/^(\?|#|&)/, '') // ! 去除开头的 ? # & 字符

  if (!query) {
    return res
  }

  // ! 以 & 符号拆分字符串成数组，再遍历数组
  query.split('&').forEach(param => {
    const parts = param.replace(/\+/g, ' ').split('=')
    const key = decode(parts.shift())
    const val = parts.length > 0 ? decode(parts.join('=')) : null

    if (res[key] === undefined) {
      res[key] = val
    } else if (Array.isArray(res[key])) {
      res[key].push(val) // ! 已经存在相同 key 的数组，加入数组
    } else {
      res[key] = [res[key], val] // ! 存储相同 key 的值合并成数组
    }
  })

  return res
}

// ! query 对象转字符串
export function stringifyQuery(obj: Dictionary<string>): string {
  const res = obj
    ? Object.keys(obj)
        .map(key => {
          const val = obj[key]

          if (val === undefined) {
            return ''
          }

          if (val === null) {
            return encode(key)
          }

          // ! 拆分数组拼接字符串
          if (Array.isArray(val)) {
            const result = []
            val.forEach(val2 => {
              if (val2 === undefined) {
                return
              }
              if (val2 === null) {
                result.push(encode(key))
              } else {
                result.push(encode(key) + '=' + encode(val2))
              }
            })
            return result.join('&')
          }

          return encode(key) + '=' + encode(val)
        })
        .filter(x => x.length > 0) // ! 字符串不能为空
        .join('&')
    : null
  return res ? `?${res}` : ''
}

/* @flow */

// ! 执行导航钩子队列的方法（同步执行异步的方法）
export function runQueue(
  queue: Array<?NavigationGuard>, // ! 队列
  fn: Function, // ! 迭代器
  cb: Function // ! 回调函数
) {
  const step = index => {
    // ! 执行完队列钩子后，执行回调函数
    if (index >= queue.length) {
      cb()
    } else {
      // ! 通过 index，判断队列是否存在钩子函数
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1) // ! 取出对应的钩子函数执行，再执行 next，执行下一个钩子函数
        })
      } else {
        step(index + 1) // ! 直接执行 next
      }
    }
  }
  step(0) // ! 执行第一个钩子函数
}

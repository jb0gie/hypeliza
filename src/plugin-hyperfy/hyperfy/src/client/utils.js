export function cls(...args) {
  let str = ''
  for (const arg of args) {
    if (typeof arg === 'string') {
      str += ' ' + arg
    } else if (typeof arg === 'object') {
      for (const key in arg) {
        const value = arg[key]
        if (value) str += ' ' + key
      }
    }
  }
  return str
}

// export const isTouch = !!navigator.userAgent.match(/OculusBrowser|iPhone|iPad|iPod|Android/i)

// if at least two indicators point to touch, consider it primarily touch-based:
// Add browser detection to prevent errors in Node.js
const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined'
const coarse = isBrowser ? window.matchMedia('(pointer: coarse)').matches : false
const noHover = isBrowser ? window.matchMedia('(hover: none)').matches : false
const hasTouch = isBrowser ? navigator.maxTouchPoints > 0 : false
export const isTouch = (coarse && hasTouch) || (noHover && hasTouch)

import { describe, it, expect } from 'vitest'
import { placeholder } from './index.js'

describe('ai (dominio)', () => {
  it('expone un punto de entrada para tests unitarios', () => {
    expect(placeholder()).toBe('ai')
  })
})

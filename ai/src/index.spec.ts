import { describe, it, expect } from 'vitest'
import { interpret } from './index'

describe('ai (exports)', () => {
  it('exporta la función interpret', () => {
    expect(typeof interpret).toBe('function')
  })
})

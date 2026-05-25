import { existsSync } from 'fs'

const filterExisting = (files) => files.filter((f) => existsSync(f))

export default {
  '*.{js,jsx,ts,tsx}': (files) => {
    const existing = filterExisting(files)
    if (!existing.length) return []
    return [
      `node node_modules/eslint/bin/eslint.js --fix --max-warnings=-1 ${existing.join(' ')}`,
      `node node_modules/prettier/bin/prettier.cjs --write ${existing.join(' ')}`,
    ]
  },
  '*.{json,md}': (files) => {
    const existing = filterExisting(files)
    if (!existing.length) return []
    return [`node node_modules/prettier/bin/prettier.cjs --write ${existing.join(' ')}`]
  },
}

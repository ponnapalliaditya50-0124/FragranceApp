module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'js/logic.js',
    'js/data.js',
    'js/scoring.js',
    'js/filters.js',
    '!js/config.js',
    '!js/app.js'
  ]
};
